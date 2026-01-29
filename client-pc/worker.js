/**
 * [Agent-Node] Worker Client v4.0
 * 역할: ADB 장치 감시, Supabase 등록, 작업 폴링 및 자동 실행
 * 추가: Socket.io 실시간 통신 (Heartbeat, Remote Control, Streaming)
 * v4.0: 자동 등록 시스템 (device-map.json 자동 생성, 순차 번호 할당)
 *       - 새 기기 연결 시 자동으로 P01-001, P01-002, ... 형식 할당
 *       - device-map.json 수동 작성 불필요
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
const { exec, execFile, spawn } = require('child_process');
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
 * [자동 등록 네이밍 로직 v4]
 * Generate device name: P{PC}-{순차번호}
 * Example: P01-001, P01-002, ... (연결 순서대로 자동 할당)
 *
 * 자동 등록 방식:
 * 1. device-map.json에 이미 등록된 시리얼 → 기존 번호 사용
 * 2. 새 시리얼 → 빈 번호 중 가장 작은 번호 자동 할당 & device-map.json 저장
 */

const DEVICE_MAP_PATH = path.join(__dirname, 'device-map.json');

/**
 * device-map.json을 파일에서 읽어오기 (실시간)
 */
function loadDeviceMap() {
    try {
        if (fs.existsSync(DEVICE_MAP_PATH)) {
            const mapData = JSON.parse(fs.readFileSync(DEVICE_MAP_PATH, 'utf8'));
            // Filter out comment fields
            return Object.fromEntries(
                Object.entries(mapData).filter(([key]) => !key.startsWith('_'))
            );
        }
    } catch (e) {
        console.warn('[Config] device-map.json 읽기 실패:', e.message);
    }
    return {};
}

/**
 * device-map.json에 저장하기
 */
function saveDeviceMap(map) {
    try {
        const dataToSave = {
            _comment: `Auto-generated device map for ${PC_CODE}. Format: serial -> slot_number`,
            _updated: new Date().toISOString(),
            ...map
        };
        fs.writeFileSync(DEVICE_MAP_PATH, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log(`[Config] device-map.json 저장됨 (${Object.keys(map).length}개 기기)`);
    } catch (e) {
        console.error('[Config] device-map.json 저장 실패:', e.message);
    }
}

/**
 * 새 기기에 빈 슬롯 번호 할당
 * @param {Object} existingMap - 현재 device-map (serial -> slotNum)
 * @returns {string} - 할당된 슬롯 번호 (예: "001", "002", ...)
 */
function findNextAvailableSlot(existingMap) {
    // 이미 사용 중인 슬롯 번호 Set
    const usedSlots = new Set(Object.values(existingMap));

    // 001부터 MAX_SLOTS까지 순회하며 빈 슬롯 찾기
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const slotNum = i.toString().padStart(3, '0'); // "001", "002", ...
        if (!usedSlots.has(slotNum)) {
            return slotNum;
        }
    }

    // 모든 슬롯이 찬 경우, 다음 번호 할당 (MAX_SLOTS 초과)
    const maxUsed = Math.max(0, ...Array.from(usedSlots).map(s => parseInt(s, 10)));
    return (maxUsed + 1).toString().padStart(3, '0');
}

/**
 * 기기 자동 등록: 새 시리얼이면 자동으로 슬롯 할당 & 저장
 * @param {string} serial - ADB 시리얼 번호
 * @returns {string} - 슬롯 번호 (예: "001")
 */
function getOrRegisterDevice(serial) {
    // 1. 현재 device-map 로드
    const currentMap = loadDeviceMap();

    // 2. 이미 등록된 시리얼이면 기존 슬롯 반환
    if (currentMap[serial]) {
        return currentMap[serial];
    }

    // 3. 새 시리얼: 빈 슬롯 찾아서 할당
    const newSlot = findNextAvailableSlot(currentMap);
    currentMap[serial] = newSlot;

    // 4. device-map.json에 저장
    saveDeviceMap(currentMap);

    console.log(`[Auto-Register] 새 기기 등록: ${serial.slice(-6)} → ${newSlot}`);
    return newSlot;
}

/**
 * Generate device name: P{PC}-{순차번호}
 * Example: P01-001 (PC01의 1번 기기)
 */
function getDeviceName(serial) {
    const pcId = PC_CODE.startsWith('P') ? PC_CODE : `P${PC_CODE}`;
    const slotNum = getOrRegisterDevice(serial);
    return `${pcId}-${slotNum}`;
}

/**
 * Extract slot number from device name (e.g., "P01-001" -> "001")
 */
function getSlotNum(deviceName) {
    const match = deviceName.match(/-(\d{3})$/);
    return match ? match[1] : null;
}

// Legacy functions for backwards compatibility (deprecated)
function getBoardId(deviceName) {
    // Legacy: P01-B01S01 형식 지원 (하위 호환성)
    const match = deviceName.match(/B(\d+)/);
    return match ? `B${match[1].padStart(2, '0')}` : null;
}

function getSlotId(deviceName) {
    // Legacy: P01-B01S01 형식 지원 (하위 호환성)
    const match = deviceName.match(/S(\d+)/);
    return match ? `S${match[1].padStart(2, '0')}` : null;
}

/**
 * [스마트폰 검증 로직]
 * ro.product.model이 조회되면 스마트폰으로 간주 (PC나 USB허브는 이 명령에 응답 못함)
 * @param {string} serial - ADB 시리얼 번호
 * @returns {Promise<boolean>} - 스마트폰이면 true
 */
async function isSmartphone(serial) {
    return new Promise((resolve) => {
        execFile(ADB_PATH, ['-s', serial, 'shell', 'getprop', 'ro.product.model'],
            { timeout: 3000 },
            (error, stdout) => {
                if (error) {
                    resolve(false);
                    return;
                }
                // 모델명이 존재하면 스마트폰으로 간주
                const model = stdout.trim();
                resolve(model && model.length > 0);
            }
        );
    });
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

/**
 * [댓글 풀에서 댓글 가져오기]
 * API를 통해 미사용 댓글을 가져오고 사용 처리
 * @param {string} jobId - 작업 ID
 * @param {string} deviceId - 기기 ID
 * @returns {Promise<string|null>} - 댓글 내용 또는 null
 */
async function getCommentFromPool(jobId, deviceId) {
    try {
        const response = await fetch(
            `${SERVER_URL}/api/comments?job_id=${jobId}&device_id=${deviceId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            console.error(`[Comment] API error: ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data.success && data.comment) {
            console.log(`[Comment] Got comment: "${data.comment.content.slice(0, 30)}..."`);
            return data.comment.content;
        }

        console.log(`[Comment] No comments available for job ${jobId}`);
        return null;
    } catch (err) {
        console.error(`[Comment] Failed to fetch comment: ${err.message}`);
        return null;
    }
}

// 순차 기기 번호 캐시: serial_number -> sequential number (PC당 연결 순서)
const deviceSequenceCache = new Map();
let nextSequenceNumber = 1;

// 로컬 작업 큐
const jobQueue = [];
let isProcessing = false;

// Streaming state
const activeStreams = new Map(); // deviceId -> interval

console.log(`[System] PC-Client v4.0 Starting... (Auto-Registration Enabled)`);
console.log(`[System] PC Code: ${PC_CODE} (기기명 형식: ${PC_CODE}-001, ${PC_CODE}-002, ...)`);
console.log(`[System] ADB Path: ${ADB_PATH}`);
console.log(`[System] Max Slots: ${MAX_SLOTS}`);
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
        name: device.slotId,           // P01-001 (순차 번호 기반)
        deviceName: device.slotId,     // 호환성 유지
        pcId: device.pcId,             // P01
        slotNum: device.slotNum,       // 1, 2, 3, ...
        slotNumStr: device.slotNum.toString().padStart(3, '0'), // "001", "002", ...
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

    // UPSERT to Supabase for ALL devices (connected and offline)
    // This ensures device list persists across page refreshes
    for (const device of fixedDevices) {
        if (device.serial !== 'Empty' && device.serial !== '-') {
            const deviceId = deviceIdCache.get(device.serial);
            const isConnected = device.status !== 'offline';

            if (deviceId) {
                // Update existing device
                await supabase
                    .from('devices')
                    .update({
                        pc_id: device.slotId,  // P01-001 format
                        status: device.status,
                        ip_address: isConnected ? device.ip : null,
                        last_heartbeat_at: isConnected ? new Date().toISOString() : null,
                        last_seen_at: isConnected ? new Date().toISOString() : null,
                        connection_info: {
                            pcCode: PC_CODE,
                            slotNum: device.slotNum,
                            adbConnected: isConnected
                        }
                    })
                    .eq('id', deviceId);
            } else if (isConnected) {
                // New connected device - will be registered via syncDevices
                // Just log for now
                console.log(`[Heartbeat] New device detected: ${device.serial.slice(-6)} at slot ${device.slotNum}`);
            }
        }
    }

    // Mark devices as offline if not in current fixedDevices
    const connectedSerials = new Set(
        fixedDevices
            .filter(d => d.status !== 'offline' && d.serial !== 'Empty' && d.serial !== '-')
            .map(d => d.serial)
    );

    for (const [serial, deviceId] of deviceIdCache.entries()) {
        if (!connectedSerials.has(serial)) {
            // Device was registered but not currently connected
            await supabase
                .from('devices')
                .update({
                    status: 'offline',
                    last_heartbeat_at: null
                })
                .eq('id', deviceId);
        }
    }
}

// =============================================
// 4. Screen Capture (바이너리 안전 방식 - spawn 사용)
// =============================================

async function captureScreen(serial) {
    /**
     * Windows 호환성을 위한 바이너리 안전 캡처:
     * 1. 폰에 캡처 파일 생성 (screencap -p)
     * 2. spawn으로 cat 명령 실행하여 바이너리 읽기
     * 3. Node.js에서 Base64 변환
     *
     * exec는 버퍼 제한/인코딩 문제가 있어 spawn 사용 권장
     */

    const devicePath = '/sdcard/stream_v6.png';

    return new Promise(async (resolve, reject) => {
        try {
            // Step 1: 폰에 스크린샷 파일 생성
            await new Promise((res, rej) => {
                exec(`"${ADB_PATH}" -s ${serial} shell screencap -p ${devicePath}`,
                    { timeout: 5000 },
                    (error) => {
                        if (error) return rej(error);
                        res();
                    }
                );
            });

            // Step 2: spawn으로 바이너리 안전하게 읽기
            const child = spawn(ADB_PATH, ['-s', serial, 'shell', 'cat', devicePath]);

            const chunks = [];
            child.stdout.on('data', (chunk) => chunks.push(chunk));
            child.stderr.on('data', (data) => {
                console.error(`[Capture] ADB Stderr: ${data}`);
            });

            child.on('error', (err) => {
                reject(new Error(`Spawn error: ${err.message}`));
            });

            child.on('close', (code) => {
                if (code === 0) {
                    const buffer = Buffer.concat(chunks);

                    if (buffer.length === 0) {
                        return reject(new Error('Empty screenshot buffer'));
                    }

                    // Step 3: Node.js에서 Base64 변환
                    const base64 = buffer.toString('base64');
                    resolve(base64);
                } else {
                    reject(new Error(`ADB exited with code ${code}`));
                }
            });

            // Timeout 처리
            setTimeout(() => {
                child.kill();
                reject(new Error('Screenshot capture timeout'));
            }, 10000);

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
 * [Auto-Registration Fixed Inventory System v4]
 * 자동 등록 + 고정 슬롯 기반 기기 목록 생성
 *
 * 동작 방식:
 * 1. 연결된 기기들을 자동으로 device-map.json에 등록 (getOrRegisterDevice)
 * 2. 001부터 MAX_SLOTS까지의 슬롯을 항상 반환
 * 3. 빈 슬롯은 Offline 상태로 표시
 * 4. 스마트폰 검증: ro.product.model 존재 확인 (PC/허브 필터링)
 */
async function getFixedInventoryDevices() {
    const { devices: connectedSerials, error } = await getConnectedDevicesRaw();

    // 연결된 기기 Map 생성 (스마트폰 검증 + 자동 등록)
    const connectedMap = new Map(); // serial -> slotNum
    if (!error) {
        for (const serial of connectedSerials) {
            // 스마트폰 검증: PC나 USB허브 필터링
            const isPhone = await isSmartphone(serial);
            if (isPhone) {
                // 자동 등록: 새 기기면 자동으로 슬롯 할당
                const slotNum = getOrRegisterDevice(serial);
                connectedMap.set(serial, slotNum);
            } else {
                console.log(`[Filter] ${serial} - 스마트폰 아님 (필터링됨)`);
            }
        }
    }

    // 현재 device-map 로드 (자동 등록 후 최신 상태)
    const currentDeviceMap = loadDeviceMap();

    // device-map을 역방향으로 변환 (슬롯번호 -> 시리얼)
    const slotToSerial = {};
    for (const [serial, slotNum] of Object.entries(currentDeviceMap)) {
        slotToSerial[slotNum] = serial;
    }

    // PC ID 정규화
    const pcId = PC_CODE.startsWith('P') ? PC_CODE : `P${PC_CODE}`;

    // 고정 슬롯 목록 생성 (001 ~ MAX_SLOTS)
    const fixedDevices = [];

    for (let i = 1; i <= MAX_SLOTS; i++) {
        const slotNum = i.toString().padStart(3, '0'); // "001", "002", ...
        const deviceName = `${pcId}-${slotNum}`; // 예: P01-001

        // 이 슬롯에 매핑된 시리얼 찾기
        const mappedSerial = slotToSerial[slotNum];

        let deviceData = {
            slotId: deviceName,        // P01-001
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
        // 자동 등록 네이밍 v4: P{PC}-{순차번호} (예: P01-001)
        const deviceName = getDeviceName(serial);

        const { data, error } = await supabase
            .from('devices')
            .upsert({
                serial_number: serial,
                pc_id: deviceName, // P01-001 형식
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
            const slotNum = getSlotNum(deviceName) || 'NEW';
            console.log(`[Sync] Device registered: ${deviceName} [Slot ${slotNum}] (${serial.slice(-6)})`);
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
                    doMicroInteractions: true,
                    // Comment pool getter for human simulation
                    getComment: async () => {
                        return await getCommentFromPool(job.id, device_id);
                    }
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
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Update did_like
                    await supabase
                        .from('job_assignments')
                        .update({ did_like: true })
                        .eq('id', id);
                }

                // Basic probabilistic comment (fallback with comment pool)
                if (probComment > 0 && Math.random() * 100 < probComment) {
                    console.log(`[Execute] ${device_serial}: 댓글 시도 (기본 모드)`);

                    // Get comment from pool
                    const commentText = await getCommentFromPool(job.id, device_id);

                    if (commentText) {
                        // Tap comment input area (approximate position)
                        await executeAdbCommand(device_serial, 'shell input tap 540 1600');
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Type the comment (escape special characters)
                        const escapedComment = commentText
                            .replace(/[`$;|&]/g, '')
                            .replace(/"/g, '\\"')
                            .replace(/'/g, "\\'");

                        await executeAdbCommand(device_serial, `shell input text "${escapedComment}"`);
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Submit comment (tap send button)
                        await executeAdbCommand(device_serial, 'shell input tap 950 1600');
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        console.log(`[Execute] ${device_serial}: 댓글 작성 완료`);

                        // Update did_comment
                        await supabase
                            .from('job_assignments')
                            .update({ did_comment: true })
                            .eq('id', id);
                    } else {
                        console.log(`[Execute] ${device_serial}: 사용 가능한 댓글이 없음`);
                    }
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

console.log('[System] Worker v4.0 started with Socket.io support');
console.log('[System] Auto-Registration: 새 기기 연결 시 자동으로 슬롯 할당');
console.log('[System] Polling for jobs and commands...');
