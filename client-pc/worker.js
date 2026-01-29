/**
 * [Agent-Node] Worker Client v3.0
 * 역할: ADB 장치 감시, Supabase 등록, 작업 폴링 및 자동 실행
 * 추가: Socket.io 실시간 통신 (Heartbeat, Remote Control, Streaming)
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
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

// =============================================
// 1. 초기 설정
// =============================================

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADB_PATH = process.env.ADB_PATH || 'adb';
const PC_ID = config.pc_id;
const DEFAULT_GROUP = config.groups?.default || 'P1-G1';
const SERVER_URL = process.env.API_BASE_URL || 'https://doai.me';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// 로컬 캐시: serial_number -> device UUID 매핑
const deviceIdCache = new Map();

// 로컬 작업 큐
const jobQueue = [];
let isProcessing = false;

// Streaming state
const activeStreams = new Map(); // deviceId -> interval

console.log(`[System] PC-Client v3.0 (${PC_ID}) Starting...`);
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
        default:
            return command; // Pass through for shell commands
    }
}

// =============================================
// 3. Heartbeat System
// =============================================

async function sendHeartbeat() {
    const { devices: serials } = await getConnectedDevices();

    const deviceStatuses = [];
    for (const serial of serials) {
        const deviceId = deviceIdCache.get(serial);
        deviceStatuses.push({
            serial,
            deviceId,
            status: 'idle', // Could be enhanced with actual status tracking
            adbConnected: true
        });
    }

    // Send via Socket.io if connected
    if (socketConnected && socket) {
        socket.emit('worker:heartbeat', {
            pcId: PC_ID,
            timestamp: new Date().toISOString(),
            devices: deviceStatuses
        });
    }

    // Also update Supabase for fallback
    for (const serial of serials) {
        const deviceId = deviceIdCache.get(serial);
        if (deviceId) {
            await supabase
                .from('devices')
                .update({
                    last_heartbeat_at: new Date().toISOString(),
                    adb_connected: true
                })
                .eq('id', deviceId);
        }
    }
}

// =============================================
// 4. Screen Capture
// =============================================

async function captureScreen(serial) {
    return new Promise((resolve, reject) => {
        const tempPath = path.join(__dirname, `temp_screen_${serial}.png`);

        // Use screencap with file output for Windows compatibility
        execFile(ADB_PATH, ['-s', serial, 'exec-out', 'screencap', '-p'],
            { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
            (error, stdout) => {
                if (error) {
                    return reject(error);
                }

                try {
                    // Convert buffer to base64
                    const base64 = stdout.toString('base64');
                    resolve(base64);
                } catch (e) {
                    reject(e);
                }
            }
        );
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

function getConnectedDevices() {
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

        const { data, error } = await supabase
            .from('devices')
            .upsert({
                serial_number: serial,
                pc_id: PC_ID,
                group_id: groupId,
                status: 'idle',
                last_seen_at: new Date().toISOString(),
                adb_connected: true
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
        }
    }

    console.log(`[Sync] ${serials.length}대 장치 동기화 완료`);
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
        await executeAdbCommand(device_serial, 'shell input keyevent 26');
        await new Promise(resolve => setTimeout(resolve, 500));

        const watchDuration = job.duration_sec || 60;

        if (scriptType === 'youtube_search') {
            console.log(`[Execute] 검색 유입 모드 - 키워드: "${searchKeyword}"`);

            const jobConfig = {
                assignment_id: id,
                keyword: searchKeyword,
                video_title: job.title,
                duration_sec: watchDuration,
                prob_like: job.prob_like || 0,
                prob_comment: job.prob_comment || 0,
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

        } else {
            console.log(`[Execute] 직접 URL 모드 - ${job.target_url}`);

            const urlValidation = validateAndSanitizeUrl(job.target_url);
            if (!urlValidation.valid) {
                throw new Error(`유효하지 않은 URL: ${urlValidation.error}`);
            }
            const videoUrl = urlValidation.sanitized;

            await executeAdbCommand(
                device_serial,
                `shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n com.google.android.youtube/.UrlActivity`
            );
        }

        console.log(`[Execute] 시청 시간: ${watchDuration}초`);

        let elapsed = 0;
        while (elapsed < watchDuration) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            elapsed += 10;

            const progressPct = Math.min(100, Math.round((elapsed / watchDuration) * 100));

            await supabase
                .from('job_assignments')
                .update({ progress_pct: progressPct })
                .eq('id', id);

            // Emit progress via Socket.io
            if (socketConnected && socket) {
                socket.emit('job:progress', {
                    assignmentId: id,
                    jobId: job.id,
                    deviceId: device_id,
                    progressPct,
                    elapsedSec: elapsed
                });
            }

            console.log(`[Execute] ${device_serial}: ${elapsed}s / ${watchDuration}s (${progressPct}%)`);
        }

        if (job.prob_like > 0) {
            const shouldLike = Math.random() * 100 < job.prob_like;
            if (shouldLike) {
                console.log(`[Execute] ${device_serial}: 좋아요 시도`);
                await executeAdbCommand(device_serial, 'shell input tap 100 600');
            }
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
