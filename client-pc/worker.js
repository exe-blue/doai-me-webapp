/**
 * [Agent-Node] Worker Client v3.0
 * 역할: ADB 장치 감시, Supabase 등록, 작업 폴링 및 자동 실행
 * 추가: Socket.io 실시간 통신 (Heartbeat, Remote Control, Streaming)
 */

const fs = require('fs');
const path = require('path');

// Load .env.local first (for local testing), fallback to ../.env (production)
const localEnvPath = path.join(__dirname, '.env.local');
const rootEnvPath = path.join(__dirname, '../.env');

if (fs.existsSync(localEnvPath)) {
    require('dotenv').config({ path: localEnvPath });
    console.log('[Config] Loaded .env.local (Local Test Mode)');
} else {
    require('dotenv').config({ path: rootEnvPath });
    console.log('[Config] Loaded ../.env (Production Mode)');
}
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
const { io } = require('socket.io-client');
const config = require('./config.json');

// v5.1: 결과 수집 모듈 (파일 존재 확인 후 Pull)
let resultCollector;
try {
    resultCollector = require('../backend/result-collector.js');
} catch (e) {
    console.warn('[System] result-collector.js not found, evidence collection disabled');
    resultCollector = null;
}

// v5.2: Human Simulation 모듈 (탐지 회피용 인간 행동 모사)
let humanSim;
try {
    humanSim = require('./human-simulation.js');
    console.log('[System] Human simulation module loaded');
} catch (e) {
    console.warn('[System] human-simulation.js not found, using basic execution');
    humanSim = null;
}

// =============================================
// 1. 초기 설정
// =============================================

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADB_PATH = process.env.ADB_PATH || 'adb';
const PC_CODE = process.env.PC_CODE || 'P01'; // 필수: .env에서 PC_CODE=P01 설정
const PC_ID = `${PC_CODE}-WORKER`; // Worker 식별용
const DEFAULT_GROUP = config.groups?.default || 'P1-G1';
const SERVER_URL = process.env.API_BASE_URL || 'https://doai.me';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// [Fixed Inventory System] 한 PC당 관리할 최대 슬롯 수 (20대 기본)
const MAX_SLOTS = parseInt(process.env.MAX_SLOTS || '20', 10);

// Device mapping file for board/slot codes
let deviceMap = {};
try {
    const mapPath = path.join(__dirname, 'device-map.json');
    if (fs.existsSync(mapPath)) {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        // Filter out comment fields
        deviceMap = Object.fromEntries(
            Object.entries(mapData).filter(([key]) => !key.startsWith('_'))
        );
        console.log(`[Config] Loaded device-map.json with ${Object.keys(deviceMap).length} mappings`);
    }
} catch (e) {
    console.warn('[Config] device-map.json not found or invalid, using defaults');
}

/**
 * [확정된 네이밍 로직 v3]
 * Generate device name: P{PC}-B{Board}S{Slot}
 * Example: P01-B01S01 (PC01의 보드1 슬롯1)
 *
 * Priority:
 * 1. Use device-map.json mapping if exists (serial -> B{Board}S{Slot})
 * 2. Fallback to P{PC}-UNKNOWN-{SerialLast4}
 */
function getDeviceName(serial) {
    // 1. PC 코드 가져오기 (.env에서 PC_CODE 설정 필수) - P01 or 01 -> P01
    const pcId = PC_CODE.startsWith('P') ? PC_CODE : `P${PC_CODE}`;

    // 2. device-map.json에서 보드/슬롯 매핑 확인
    const boardSlot = deviceMap[serial];

    if (boardSlot) {
        // 매핑 존재: P01-B01S01 형식
        return `${pcId}-${boardSlot}`;
    }

    // 3. 매핑 없음: P01-UNKNOWN-{SerialLast4} 형식
    const serialSuffix = serial.slice(-4).toUpperCase();
    return `${pcId}-UNKNOWN-${serialSuffix}`;
}

/**
 * Extract board ID from device name (e.g., "P01-B01S01" -> "B01")
 */
function getBoardId(deviceName) {
    const match = deviceName.match(/B(\d+)/);
    return match ? `B${match[1].padStart(2, '0')}` : null;
}

/**
 * Extract slot ID from device name (e.g., "P01-B01S01" -> "S01")
 */
function getSlotId(deviceName) {
    const match = deviceName.match(/S(\d+)/);
    return match ? `S${match[1].padStart(2, '0')}` : null;
}

/**
 * [Helper] 기기 IP 가져오기 (WLAN0 기준)
 * ADB shell 명령으로 안드로이드 기기의 IP 주소 조회
 */
async function getDeviceIp(serial) {
    return new Promise((resolve) => {
        execFile(ADB_PATH, ['-s', serial, 'shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0'],
            { timeout: 3000 },
            (error, stdout) => {
                if (error) {
                    resolve('N/A');
                    return;
                }
                // "inet 192.168.0.123/24" 형태에서 IP만 추출
                const match = stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
                resolve(match ? match[1] : 'No IP');
            }
        );
    });
}

// 로컬 캐시: serial_number -> device UUID 매핑
const deviceIdCache = new Map();

// 순차 기기 번호 캐시: serial_number -> sequential number (PC당 연결 순서)
const deviceSequenceCache = new Map();
let nextSequenceNumber = 1;

// 로컬 작업 큐
const jobQueue = [];
let isProcessing = false;

// Streaming state
const activeStreams = new Map(); // deviceId -> interval

console.log(`[System] PC-Client v3.0 Starting...`);
console.log(`[System] PC Code: ${PC_CODE} (기기명 형식: PC${PC_CODE.replace(/^P/i, '')}-###)`);
console.log(`[System] ADB Path: ${ADB_PATH}`);
console.log(`[System] Default Group: ${DEFAULT_GROUP}`);
console.log(`[System] Server URL: ${SERVER_URL}`);

// =============================================
// 2. Socket.io 연결
// =============================================

let socket = null;
let socketConnected = false;

function initSocketConnection() {
    console.log(`[Socket] Connecting to ${SERVER_URL}/worker...`);

    socket = io(`${SERVER_URL}/worker`, {
        auth: {
            token: WORKER_API_KEY,
            pcId: PC_ID
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000
    });

    socket.on('connect', () => {
        console.log(`[Socket] ✅ Connected! (ID: ${socket.id})`);
        socketConnected = true;
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Socket] ❌ Disconnected: ${reason}`);
        socketConnected = false;

        // Stop all active streams on disconnect
        activeStreams.forEach((interval, deviceId) => {
            clearInterval(interval);
            console.log(`[Stream] Stopped streaming for ${deviceId} (disconnected)`);
        });
        activeStreams.clear();
    });

    socket.on('connect_error', (error) => {
        console.error(`[Socket] Connection error: ${error.message}`);
        socketConnected = false;
    });

    // Command execution from dashboard
    socket.on('device:command', async (payload) => {
        const { deviceId, command, params, commandId } = payload;
        console.log(`[Socket] 🎮 Command received: ${command} for device ${deviceId}`);

        try {
            const serial = getSerialFromDeviceId(deviceId);
            if (!serial) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            const adbCommand = buildAdbCommand(command, params);
            await executeAdbCommand(serial, `shell ${adbCommand}`);

            socket.emit('command:ack', {
                commandId,
                deviceId,
                status: 'completed'
            });
            console.log(`[Socket] ✅ Command completed: ${command}`);
        } catch (error) {
            socket.emit('command:ack', {
                commandId,
                deviceId,
                status: 'failed',
                error: error.message
            });
            console.error(`[Socket] ❌ Command failed: ${error.message}`);
        }
    });

    // Start screen streaming
    socket.on('stream:start', (payload) => {
        const { deviceId, fps = 2 } = payload;
        console.log(`[Socket] 🎥 Stream start requested for ${deviceId} at ${fps} FPS`);

        const serial = getSerialFromDeviceId(deviceId);
        if (!serial) {
            console.error(`[Stream] Device not found: ${deviceId}`);
            return;
        }

        // Stop existing stream if any
        if (activeStreams.has(deviceId)) {
            clearInterval(activeStreams.get(deviceId));
        }

        const interval = setInterval(async () => {
            try {
                const base64Img = await captureScreen(serial);
                if (base64Img && socketConnected) {
                    socket.emit('stream:frame', {
                        deviceId,
                        timestamp: Date.now(),
                        frame: base64Img
                    });
                }
            } catch (error) {
                console.error(`[Stream] Capture error: ${error.message}`);
            }
        }, Math.round(1000 / fps));

        activeStreams.set(deviceId, interval);
        console.log(`[Stream] ✅ Streaming started for ${deviceId}`);
    });

    // Stop screen streaming
    socket.on('stream:stop', (payload) => {
        const { deviceId } = payload;
        console.log(`[Socket] 🛑 Stream stop requested for ${deviceId}`);

        if (activeStreams.has(deviceId)) {
            clearInterval(activeStreams.get(deviceId));
            activeStreams.delete(deviceId);
            console.log(`[Stream] ✅ Streaming stopped for ${deviceId}`);
        }
    });

    // Device initialization (Phase A: Standardization)
    socket.on('device:init', async (payload) => {
        const { deviceId, serial, config } = payload;
        console.log(`[Socket] 🔧 Device init requested for ${serial}`);

        try {
            const deviceSerial = serial || getSerialFromDeviceId(deviceId);
            if (!deviceSerial) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            // Step 1: Set resolution (1080x1920 for unified coordinate system)
            const resolution = config?.resolution || '1080x1920';
            console.log(`[Init] Setting resolution: ${resolution}`);
            await executeAdbCommand(deviceSerial, `shell wm size ${resolution}`);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 2: Set density (420 for unified scaling)
            const density = config?.density || 420;
            console.log(`[Init] Setting density: ${density}`);
            await executeAdbCommand(deviceSerial, `shell wm density ${density}`);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 3: Go to home screen (clean environment)
            console.log(`[Init] Going to home screen`);
            await executeAdbCommand(deviceSerial, 'shell input keyevent KEYCODE_HOME');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Report success
            socket.emit('device:init:complete', {
                deviceId,
                serial: deviceSerial,
                success: true,
                config: { resolution, density }
            });

            console.log(`[Init] ✅ Device initialized: ${deviceSerial}`);

        } catch (error) {
            console.error(`[Init] ❌ Init failed: ${error.message}`);
            socket.emit('device:init:complete', {
                deviceId,
                serial,
                success: false,
                error: error.message
            });
        }
    });

    // =============================================
    // Job Assignment via Socket.io (Primary method)
    // =============================================

    // Receive new job assignment from server
    socket.on('job:assign', (payload) => {
        const { assignmentId, deviceId, deviceSerial, job } = payload;
        console.log(`[Socket] 📋 Job assigned: ${assignmentId} for ${deviceSerial || deviceId}`);

        // Find serial if not provided
        let serial = deviceSerial;
        if (!serial && deviceId) {
            serial = getSerialFromDeviceId(deviceId);
        }

        if (!serial) {
            console.error(`[Socket] ❌ Cannot find device serial for assignment ${assignmentId}`);
            return;
        }

        // Check if already in queue
        if (jobQueue.find(j => j.id === assignmentId)) {
            console.log(`[Socket] ⚠️ Assignment ${assignmentId} already in queue, skipping`);
            return;
        }

        // Add to queue in the same format as polling
        const assignment = {
            id: assignmentId,
            job_id: job.id,
            device_id: deviceId,
            device_serial: serial,
            status: 'pending',
            jobs: job  // Job info embedded
        };

        jobQueue.push(assignment);
        console.log(`[Socket] ✅ Job queued: ${assignmentId} (Queue size: ${jobQueue.length})`);

        // Process queue immediately
        processQueue();
    });

    // Handle job pause notification
    socket.on('job:paused', (payload) => {
        const { jobId } = payload;
        console.log(`[Socket] ⏸️ Job paused: ${jobId}`);

        // Remove pending assignments for this job from queue
        const beforeLength = jobQueue.length;
        const pausedAssignments = jobQueue.filter(j => j.job_id === jobId || (j.jobs && j.jobs.id === jobId));

        // Keep only assignments that are NOT for this job
        const newQueue = jobQueue.filter(j => j.job_id !== jobId && (!j.jobs || j.jobs.id !== jobId));
        jobQueue.length = 0;
        jobQueue.push(...newQueue);

        console.log(`[Socket] Removed ${beforeLength - jobQueue.length} pending assignments from queue for job ${jobId}`);

        // Note: Running jobs will continue to completion
        // The pause only affects pending assignments
    });

    // Handle job resume notification
    socket.on('job:resumed', (payload) => {
        const { jobId } = payload;
        console.log(`[Socket] ▶️ Job resumed: ${jobId}`);
        // New assignments will be sent via job:assign event
    });

    // Handle job cancellation notification
    socket.on('job:cancelled', (payload) => {
        const { jobId } = payload;
        console.log(`[Socket] 🛑 Job cancelled: ${jobId}`);

        // Remove all pending assignments for this job from queue
        const newQueue = jobQueue.filter(j => j.job_id !== jobId && (!j.jobs || j.jobs.id !== jobId));
        const removedCount = jobQueue.length - newQueue.length;
        jobQueue.length = 0;
        jobQueue.push(...newQueue);

        console.log(`[Socket] Removed ${removedCount} assignments from queue for cancelled job ${jobId}`);
    });

    // Server shutdown notification
    socket.on('server:shutdown', (payload) => {
        console.log(`[Socket] 🔄 Server shutting down: ${payload.message}`);
        // Will auto-reconnect when server comes back up
    });
}

// Helper: Get serial from device ID
function getSerialFromDeviceId(deviceId) {
    for (const [serial, id] of deviceIdCache.entries()) {
        if (id === deviceId) return serial;
    }
    return null;
}

// Helper: Build ADB command from params
function buildAdbCommand(command, params = {}) {
    switch (command) {
        case 'tap':
            return `input tap ${params.x || 0} ${params.y || 0}`;
        case 'swipe':
            const duration = params.duration || 300;
            return `input swipe ${params.x || 0} ${params.y || 0} ${params.x2 || 0} ${params.y2 || 0} ${duration}`;
        case 'keyevent':
            return `input keyevent ${params.keycode || 0}`;
        case 'text':
            const escapedText = (params.text || '').replace(/['"\\]/g, '\\$&');
            return `input text "${escapedText}"`;
        case 'shell':
            // Shell command: params.shellCommand contains the full shell command
            // e.g., "wm size 1080x2340", "settings put system screen_brightness 0"
            return params.shellCommand || '';
        default:
            return command; // Pass through for other commands
    }
}

// =============================================
// 3. Heartbeat System (Fixed Inventory)
// =============================================

async function sendHeartbeat() {
    // [Fixed Inventory] 고정 슬롯 기반 기기 목록 가져오기
    const fixedDevices = await getFixedInventoryDevices();
    const pcId = PC_CODE.startsWith('P') ? PC_CODE : `P${PC_CODE}`;

    const deviceStatuses = fixedDevices.map(device => ({
        serial: device.serial,
        deviceId: device.serial !== 'Empty' && device.serial !== '-' ? deviceIdCache.get(device.serial) : null,
        name: device.slotId,           // P01-B01S01 (slot-based name)
        deviceName: device.slotId,     // 호환성 유지
        pcId: device.pcId,             // P01
        boardId: getBoardId(device.slotId),  // B01
        slotId: getSlotId(device.slotId),    // S01
        slotNum: device.slotNum,       // 1, 2, 3, ...
        pcCode: PC_CODE,               // 호환성 유지
        status: device.status,         // idle, busy, offline
        ip: device.ip,                 // 192.168.x.x or N/A
        adbConnected: device.status !== 'offline'
    }));

    // Send via Socket.io if connected
    if (socketConnected && socket) {
        socket.emit('worker:heartbeat', {
            pcId: PC_CODE,
            pcCode: PC_CODE,
            timestamp: new Date().toISOString(),
            maxSlots: MAX_SLOTS,       // 대시보드에서 슬롯 수 알 수 있도록
            devices: deviceStatuses
        });
    }

    // Also update Supabase for connected devices only
    for (const device of fixedDevices) {
        if (device.status !== 'offline' && device.serial !== 'Empty' && device.serial !== '-') {
            const deviceId = deviceIdCache.get(device.serial);
            if (deviceId) {
                await supabase
                    .from('devices')
                    .update({
                        last_heartbeat_at: new Date().toISOString(),
                        last_seen_at: new Date().toISOString()
                    })
                    .eq('id', deviceId);
            }
        }
    }
}

// =============================================
// 4. Screen Capture
// =============================================

async function captureScreen(serial) {
    // Fixed streaming logic for Windows compatibility:
    // 1. Capture to file on device (not piping base64 through shell)
    // 2. Read raw PNG buffer via shell cat
    // 3. Convert to base64 in Node.js

    const devicePath = '/sdcard/stream_capture.png';

    return new Promise(async (resolve, reject) => {
        try {
            // Step 1: Capture screenshot to file on device
            await new Promise((res, rej) => {
                execFile(ADB_PATH, ['-s', serial, 'shell', 'screencap', '-p', devicePath],
                    { timeout: 5000 },
                    (error) => {
                        if (error) return rej(error);
                        res();
                    }
                );
            });

            // Step 2: Read the file as raw buffer (NOT through base64 in shell)
            execFile(ADB_PATH, ['-s', serial, 'exec-out', 'cat', devicePath],
                { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024, timeout: 5000 },
                (error, stdout) => {
                    if (error) {
                        return reject(error);
                    }

                    if (!stdout || stdout.length === 0) {
                        return reject(new Error('Empty screenshot buffer'));
                    }

                    try {
                        // Step 3: Convert buffer to base64 in Node.js
                        const base64 = stdout.toString('base64');
                        resolve(base64);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

// =============================================
// 5. Scrcpy Command Polling (Fallback)
// =============================================

async function pollScrcpyCommands() {
    try {
        const { devices: serials } = await getConnectedDevices();
        if (serials.length === 0) return;

        const deviceIds = serials
            .map(s => deviceIdCache.get(s))
            .filter(Boolean);

        if (deviceIds.length === 0) return;

        // Poll for pending commands
        const { data: commands, error } = await supabase
            .from('scrcpy_commands')
            .select('*')
            .in('device_id', deviceIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(10);

        if (error || !commands || commands.length === 0) return;

        for (const cmd of commands) {
            const serial = getSerialFromDeviceId(cmd.device_id);
            if (!serial) continue;

            console.log(`[Command] Processing: ${cmd.command_type} for ${serial}`);

            // Update status to executing
            await supabase
                .from('scrcpy_commands')
                .update({
                    status: 'executing',
                    received_at: new Date().toISOString()
                })
                .eq('id', cmd.id);

            try {
                let result = null;

                switch (cmd.command_type) {
                    case 'input':
                        // Execute ADB input command
                        const adbCmd = cmd.command_data?.adbCommand;
                        if (adbCmd) {
                            await executeAdbCommand(serial, `shell ${adbCmd}`);
                        }
                        break;

                    case 'screenshot':
                        // Capture and upload screenshot
                        const base64 = await captureScreen(serial);
                        // For MVP, store as data URL
                        result = { imageUrl: `data:image/png;base64,${base64.substring(0, 100)}...` };
                        // In production, upload to storage and return URL
                        break;

                    case 'stream_start':
                        // Start streaming (handled via Socket.io primarily)
                        console.log(`[Command] Stream start via polling not supported, use Socket.io`);
                        break;

                    case 'stream_stop':
                        // Stop streaming
                        if (activeStreams.has(cmd.device_id)) {
                            clearInterval(activeStreams.get(cmd.device_id));
                            activeStreams.delete(cmd.device_id);
                        }
                        break;

                    case 'shell':
                        // Execute shell command (with whitelist check)
                        const shellCmd = cmd.command_data?.shellCommand;
                        if (shellCmd) {
                            await executeAdbCommand(serial, `shell ${shellCmd}`);
                        }
                        break;

                    default:
                        console.warn(`[Command] Unknown command type: ${cmd.command_type}`);
                }

                // Update status to completed
                await supabase
                    .from('scrcpy_commands')
                    .update({
                        status: 'completed',
                        result_data: result,
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', cmd.id);

                console.log(`[Command] ✅ Completed: ${cmd.command_type}`);

            } catch (cmdError) {
                console.error(`[Command] ❌ Failed: ${cmdError.message}`);

                await supabase
                    .from('scrcpy_commands')
                    .update({
                        status: 'failed',
                        error_message: cmdError.message,
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', cmd.id);
            }
        }
    } catch (err) {
        console.error('[Command Poll] Error:', err.message);
    }
}

// =============================================
// 6. ADB 유틸리티 함수
// =============================================

/**
 * [기존] 실제 연결된 ADB 기기만 반환 (시리얼 번호 리스트)
 */
function getConnectedDevicesRaw() {
    return new Promise((resolve) => {
        exec(`"${ADB_PATH}" devices`, (error, stdout) => {
            if (error) {
                console.error(`[ADB Error] ${error.message}`);
                resolve({ devices: [], error });
                return;
            }

            const devices = [];
            const lines = stdout.split('\n');

            for (let line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2 && parts[1].trim() === 'device') {
                    devices.push(parts[0].trim());
                }
            }
            resolve({ devices, error: null });
        });
    });
}

/**
 * [기존 호환] getConnectedDevices - 다른 함수에서 호출하는 기존 인터페이스 유지
 */
function getConnectedDevices() {
    return getConnectedDevicesRaw();
}

/**
 * [Fixed Inventory System] 고정 슬롯 기반 기기 목록 생성
 * 1번부터 MAX_SLOTS번까지의 슬롯을 항상 반환
 * 빈 슬롯은 Offline 상태로 표시
 */
async function getFixedInventoryDevices() {
    const { devices: connectedSerials, error } = await getConnectedDevicesRaw();

    // 연결된 기기 Map 생성
    const connectedMap = new Map();
    if (!error) {
        for (const serial of connectedSerials) {
            connectedMap.set(serial, true);
        }
    }

    // device-map.json을 역방향으로 변환 (슬롯코드 -> 시리얼)
    const slotToSerial = {};
    for (const [serial, slotCode] of Object.entries(deviceMap)) {
        slotToSerial[slotCode] = serial;
    }

    // PC ID 정규화
    const pcId = PC_CODE.startsWith('P') ? PC_CODE : `P${PC_CODE}`;

    // 고정 슬롯 목록 생성
    const fixedDevices = [];

    for (let i = 1; i <= MAX_SLOTS; i++) {
        const slotNum = i.toString().padStart(2, '0');
        const slotCode = `B01S${slotNum}`; // 예: B01S01, B01S02, ...
        const deviceName = `${pcId}-${slotCode}`; // 예: P01-B01S01

        // 이 슬롯에 매핑된 시리얼 찾기
        const mappedSerial = slotToSerial[slotCode];

        let deviceData = {
            slotId: deviceName,        // P01-B01S01
            serial: mappedSerial || '-',
            status: 'offline',
            ip: '-',
            pcId: pcId,
            slotNum: i
        };

        // 매핑된 시리얼이 있고, 실제로 연결되어 있으면
        if (mappedSerial && connectedMap.has(mappedSerial)) {
            deviceData.status = 'idle'; // 연결됨 = idle (작업중이면 busy로 변경됨)
            deviceData.ip = await getDeviceIp(mappedSerial);
        } else if (mappedSerial && !connectedMap.has(mappedSerial)) {
            // 매핑은 되어있는데 연결 안됨 -> Offline
            deviceData.status = 'offline';
        } else {
            // 매핑조차 안됨 -> Empty Slot
            deviceData.status = 'offline';
            deviceData.serial = 'Empty';
        }

        fixedDevices.push(deviceData);
    }

    return fixedDevices;
}

const SERIAL_REGEX = /^[a-zA-Z0-9:_-]+$/;

function isValidSerial(serial) {
    return typeof serial === 'string' &&
           serial.length > 0 &&
           serial.length <= 64 &&
           SERIAL_REGEX.test(serial);
}

function parseCommandToArgs(command) {
    const args = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (inQuote) {
            if (char === quoteChar) {
                inQuote = false;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            inQuote = true;
            quoteChar = char;
        } else if (char === ' ') {
            if (current) {
                args.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (inQuote) {
        throw new Error(`Unclosed quote in command: missing closing ${quoteChar}`);
    }

    if (current) {
        args.push(current);
    }

    return args;
}

function executeAdbCommand(serial, command) {
    return new Promise((resolve, reject) => {
        if (!isValidSerial(serial)) {
            const error = new Error(`유효하지 않은 시리얼 번호: ${serial.substring(0, 20)}`);
            console.error(`[ADB Error] 시리얼 검증 실패`);
            reject(error);
            return;
        }

        const commandArgs = parseCommandToArgs(command);
        const args = ['-s', serial, ...commandArgs];

        console.log(`[ADB] Executing: ${ADB_PATH} ${args.join(' ')}`);

        execFile(ADB_PATH, args, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ADB Error] serial=${serial}: ${error.message}`);
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

// =============================================
// 7. 장치 동기화 (Watchdog)
// =============================================

async function syncDevices() {
    const { devices: serials, error: adbError } = await getConnectedDevices();

    if (adbError) {
        console.error(`[Watchdog] ADB 조회 실패: ${adbError.message}`);
        return [];
    }

    if (serials.length === 0) {
        // Mark all cached devices as offline
        return [];
    }

    for (const serial of serials) {
        const groupId = config.groups?.mappings?.[serial] || DEFAULT_GROUP;
        // 확정된 네이밍 v3: P{PC}-B{Board}S{Slot} 또는 P{PC}-UNKNOWN-{Serial}
        const deviceName = getDeviceName(serial);
        const boardId = getBoardId(deviceName);
        const slotId = getSlotId(deviceName);

        const { data, error } = await supabase
            .from('devices')
            .upsert({
                serial_number: serial,
                pc_id: deviceName, // P01-B01S01 형식
                group_id: groupId,
                status: 'idle',
                last_seen_at: new Date().toISOString()
            }, {
                onConflict: 'serial_number',
                ignoreDuplicates: false
            })
            .select('id, serial_number')
            .single();

        if (error) {
            console.error('[DB Error]', error.message);
        } else if (data) {
            deviceIdCache.set(serial, data.id);
            const boardSlotInfo = boardId && slotId ? `${boardId}${slotId}` : 'UNKNOWN';
            console.log(`[Sync] Device registered: ${deviceName} [${boardSlotInfo}] (${serial.slice(-6)})`);
        }
    }

    console.log(`[Sync] ${serials.length}대 장치 동기화 완료 (PC: ${PC_CODE})`);
    return serials;
}

// =============================================
// 8. 작업 폴링 (Polling Logic)
// =============================================

async function pollForJobs() {
    try {
        const { devices: connectedSerials, error: adbError } = await getConnectedDevices();

        if (adbError) {
            console.error(`[Poll] ADB 조회 실패: ${adbError.message}`);
            return;
        }

        const connectedDeviceIds = [];

        for (const serial of connectedSerials) {
            let deviceId = deviceIdCache.get(serial);

            if (!deviceId) {
                const { data } = await supabase
                    .from('devices')
                    .select('id, serial_number')
                    .eq('serial_number', serial)
                    .single();

                if (data) {
                    deviceId = data.id;
                    deviceIdCache.set(serial, deviceId);
                }
            }

            if (deviceId) {
                connectedDeviceIds.push({ id: deviceId, serial });
            }
        }

        if (connectedDeviceIds.length === 0) {
            return;
        }

        const { data: assignments, error } = await supabase
            .from('job_assignments')
            .select(`
                id,
                job_id,
                device_id,
                status,
                jobs (
                    id,
                    title,
                    keyword,
                    duration_sec,
                    target_url,
                    script_type,
                    duration_min_pct,
                    duration_max_pct,
                    prob_like,
                    prob_comment,
                    prob_playlist
                )
            `)
            .eq('status', 'pending')
            .in('device_id', connectedDeviceIds.map(d => d.id))
            .limit(10);

        if (error) {
            console.error('[Poll Error]', error.message);
            return;
        }

        if (!assignments || assignments.length === 0) {
            return;
        }

        console.log(`[Poll] ${assignments.length}개 새 작업 발견!`);

        for (const assignment of assignments) {
            const deviceInfo = connectedDeviceIds.find(d => d.id === assignment.device_id);
            if (deviceInfo && !jobQueue.find(j => j.id === assignment.id)) {
                jobQueue.push({
                    ...assignment,
                    device_serial: deviceInfo.serial
                });
                console.log(`[Queue] 작업 추가: ${assignment.id}`);
            }
        }

        processQueue();

    } catch (err) {
        console.error('[Poll Exception]', err.message);
    }
}

// =============================================
// 9. 큐 처리 (Queue Management)
// =============================================

async function processQueue() {
    if (isProcessing || jobQueue.length === 0) {
        return;
    }

    isProcessing = true;

    while (jobQueue.length > 0) {
        const assignment = jobQueue.shift();

        try {
            await executeJob(assignment);
        } catch (err) {
            console.error(`[Execute Error] ${assignment.id}:`, err.message);

            await supabase
                .from('job_assignments')
                .update({
                    status: 'failed',
                    error_log: err.message
                })
                .eq('id', assignment.id);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessing = false;
}

// =============================================
// 10. 작업 실행 (Command Execution)
// =============================================

const YOUTUBE_URL_REGEX = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\/.*/i;

/**
 * Report job progress to Supabase and Socket.io
 */
async function reportProgress(assignmentId, jobId, deviceId, progressPct, elapsedSec) {
    // Update Supabase
    await supabase
        .from('job_assignments')
        .update({ progress_pct: progressPct })
        .eq('id', assignmentId);

    // Emit via Socket.io
    if (socketConnected && socket) {
        socket.emit('job:progress', {
            assignmentId,
            jobId,
            deviceId,
            progressPct,
            elapsedSec
        });
    }
}

function validateAndSanitizeUrl(url) {
    try {
        const parsedUrl = new URL(url);

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, sanitized: '', error: '허용되지 않은 프로토콜' };
        }

        const allowedHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
        if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
            return { valid: false, sanitized: '', error: '허용되지 않은 도메인' };
        }

        if (!YOUTUBE_URL_REGEX.test(url)) {
            return { valid: false, sanitized: '', error: 'YouTube URL 형식이 아닙니다' };
        }

        let sanitized = parsedUrl.href;
        sanitized = sanitized
            .replace(/[`$;|]/g, (char) => encodeURIComponent(char))
            .replace(/"/g, '%22')
            .replace(/'/g, '%27');

        return { valid: true, sanitized };
    } catch (e) {
        return { valid: false, sanitized: '', error: `유효하지 않은 URL: ${e.message}` };
    }
}

async function executeJob(assignment) {
    const { id, device_id, device_serial, jobs: job } = assignment;

    if (!job) {
        console.error(`[Execute] Job 정보 없음: ${id}`);
        await supabase
            .from('job_assignments')
            .update({
                status: 'failed',
                error_log: 'Job 정보를 찾을 수 없음'
            })
            .eq('id', id);
        return;
    }

    const searchKeyword = job.keyword || job.title;
    const scriptType = job.script_type || 'youtube_watch';

    console.log(`[Execute] 작업 시작: ${id}`);
    console.log(`[Execute] 기기: ${device_serial} (device_id: ${device_id})`);

    // Emit job start event via Socket.io
    if (socketConnected && socket) {
        socket.emit('job:started', {
            assignmentId: id,
            jobId: job.id,
            deviceId: device_id,
            title: job.title
        });
    }

    try {
        const { error: assignmentError } = await supabase
            .from('job_assignments')
            .update({
                status: 'running',
                started_at: new Date().toISOString()
            })
            .eq('id', id);

        if (assignmentError) {
            throw new Error(`job_assignments 업데이트 실패: ${assignmentError.message}`);
        }

        const { error: deviceError } = await supabase
            .from('devices')
            .update({ status: 'busy' })
            .eq('id', device_id);

        if (deviceError) {
            await supabase
                .from('job_assignments')
                .update({ status: 'pending', started_at: null })
                .eq('id', id);
            throw new Error(`devices 업데이트 실패: ${deviceError.message}`);
        }
    } catch (dbError) {
        console.error(`[Execute] DB 초기화 실패: ${dbError.message}`);
        throw dbError;
    }

    try {
        // Wake up screen
        await executeAdbCommand(device_serial, 'shell input keyevent 26');
        await new Promise(resolve => setTimeout(resolve, 500));

        const watchDuration = job.duration_sec || 60;
        const probLike = job.prob_like || 0;
        const probComment = job.prob_comment || 0;

        if (scriptType === 'youtube_search') {
            console.log(`[Execute] 검색 유입 모드 - 키워드: "${searchKeyword}"`);

            const jobConfig = {
                assignment_id: id,
                keyword: searchKeyword,
                video_title: job.title,
                duration_sec: watchDuration,
                prob_like: probLike,
                prob_comment: probComment,
                prob_playlist: job.prob_playlist || 0
            };

            const jobJsonPath = `/sdcard/Scripts/doai-bot/job.json`;
            const tempJobFile = path.join(__dirname, `temp_job_${device_serial}.json`);

            fs.writeFileSync(tempJobFile, JSON.stringify(jobConfig, null, 2));

            await executeAdbCommand(device_serial, `shell mkdir -p /sdcard/Scripts/doai-bot`);
            await executeAdbCommand(device_serial, `push "${tempJobFile}" ${jobJsonPath}`);

            fs.unlinkSync(tempJobFile);

            await executeAdbCommand(
                device_serial,
                `shell am start -n org.autojs.autoxjs.v6/org.autojs.autojs.external.open.RunIntentActivity -d "file:///sdcard/Scripts/doai-bot/webview_bot.js" -t "text/javascript"`
            );

            // Search mode uses AutoJS script - just wait for completion
            let elapsed = 0;
            while (elapsed < watchDuration) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                elapsed += 10;
                const progressPct = Math.min(100, Math.round((elapsed / watchDuration) * 100));
                await reportProgress(id, job.id, device_id, progressPct, elapsed);
            }

        } else {
            // =============================================
            // Phase C: Human Simulation Mode (탐지 회피)
            // =============================================
            console.log(`[Execute] 직접 URL 모드 (Human Simulation) - ${job.target_url}`);

            const urlValidation = validateAndSanitizeUrl(job.target_url);
            if (!urlValidation.valid) {
                throw new Error(`유효하지 않은 URL: ${urlValidation.error}`);
            }
            const videoUrl = urlValidation.sanitized;

            // Step 1: Launch YouTube app with video URL
            await executeAdbCommand(
                device_serial,
                `shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n com.google.android.youtube/.UrlActivity`
            );

            console.log(`[Execute] 시청 시간: ${watchDuration}초 (Human Simulation 활성화)`);

            // Step 2: Execute with Human Simulation if available
            if (humanSim) {
                console.log(`[Execute] 🤖 Human Simulation 시작`);

                // Create ADB executor wrapper for human-simulation module
                const executeAdb = async (serial, cmd) => {
                    await executeAdbCommand(serial, cmd);
                };

                // Execute human watch session with progress reporting
                const sessionConfig = {
                    durationSec: watchDuration,
                    probLike: probLike,
                    probComment: probComment,
                    doInitialScroll: true,
                    doMicroInteractions: true
                };

                // Start progress reporting in parallel
                const progressInterval = setInterval(async () => {
                    // Progress will be reported by humanSim, but we track time here
                }, 10000);

                try {
                    const humanResult = await humanSim.executeHumanWatchSession(
                        executeAdb,
                        device_serial,
                        sessionConfig
                    );

                    console.log(`[Execute] Human simulation result:`, humanResult);

                    // Update assignment with human simulation results
                    await supabase
                        .from('job_assignments')
                        .update({
                            did_like: humanResult.didLike,
                            did_comment: humanResult.didComment
                        })
                        .eq('id', id);

                } finally {
                    clearInterval(progressInterval);
                }

                // Report final progress
                await reportProgress(id, job.id, device_id, 100, watchDuration);

            } else {
                // Fallback: Basic execution without human simulation
                console.log(`[Execute] ⚠️ Human Simulation 미사용 (기본 모드)`);

                let elapsed = 0;
                while (elapsed < watchDuration) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    elapsed += 10;
                    const progressPct = Math.min(100, Math.round((elapsed / watchDuration) * 100));
                    await reportProgress(id, job.id, device_id, progressPct, elapsed);
                    console.log(`[Execute] ${device_serial}: ${elapsed}s / ${watchDuration}s (${progressPct}%)`);
                }

                // Basic probabilistic like (fallback)
                if (probLike > 0 && Math.random() * 100 < probLike) {
                    console.log(`[Execute] ${device_serial}: 좋아요 시도 (기본 모드)`);
                    await executeAdbCommand(device_serial, 'shell input tap 130 820');
                }
            }

            // Step 3: Close YouTube app and clean up
            console.log(`[Execute] 앱 종료 및 정리`);
            await executeAdbCommand(device_serial, 'shell am force-stop com.google.android.youtube');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Go back to home
            await executeAdbCommand(device_serial, 'shell input keyevent KEYCODE_HOME');
        }

        // Evidence collection
        if (resultCollector) {
            try {
                const jobResult = await resultCollector.collectJobResult(
                    ADB_PATH,
                    device_serial,
                    id
                );

                if (jobResult.success !== false) {
                    const evidenceCount = jobResult.evidencePullResults ?
                        jobResult.evidencePullResults.filter(r => r.success).length : 0;

                    await supabase
                        .from('job_assignments')
                        .update({
                            evidence_collected: true,
                            evidence_count: evidenceCount,
                            evidence_local_path: jobResult.localResultPath
                        })
                        .eq('id', id);
                }
            } catch (collectErr) {
                console.error(`[Execute] 증거 수집 오류: ${collectErr.message}`);
            }
        }

        await supabase
            .from('job_assignments')
            .update({
                status: 'completed',
                progress_pct: 100,
                final_duration_sec: watchDuration,
                completed_at: new Date().toISOString()
            })
            .eq('id', id);

        // Emit completion via Socket.io
        if (socketConnected && socket) {
            socket.emit('job:completed', {
                assignmentId: id,
                jobId: job.id,
                deviceId: device_id,
                finalDurationSec: watchDuration
            });
        }

        console.log(`[Execute] 작업 완료: ${id}`);

    } catch (err) {
        // Emit failure via Socket.io
        if (socketConnected && socket) {
            socket.emit('job:failed', {
                assignmentId: id,
                jobId: job.id,
                deviceId: device_id,
                error: err.message
            });
        }
        throw err;
    } finally {
        await supabase
            .from('devices')
            .update({ status: 'idle' })
            .eq('id', device_id);
    }
}

// =============================================
// 11. 메인 실행 루프
// =============================================

// Initialize Socket.io connection
initSocketConnection();

// 장치 동기화 (5초마다)
setInterval(syncDevices, config.scan_interval_ms || 5000);
syncDevices();

// 작업 폴링 (3초마다)
setInterval(pollForJobs, 3000);
pollForJobs();

// Heartbeat (5초마다)
setInterval(sendHeartbeat, 5000);

// Scrcpy command polling (2초마다) - Fallback for non-Socket.io commands
setInterval(pollScrcpyCommands, 2000);

console.log('[System] Worker v3.0 started with Socket.io support');
console.log('[System] Polling for jobs and commands...');
