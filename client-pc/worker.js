const fs = require('fs');
const path = require('path');

// =============================================
// [PKG 호환] process.cwd()를 사용하여 외부 파일 경로 참조
// .exe 파일이 있는 위치에서 .env, device-map.json 등을 읽음
// =============================================
const APP_ROOT = process.cwd();

// Load .env.local first (for local testing), fallback to .env
const localEnvPath = path.join(APP_ROOT, '.env.local');
const defaultEnvPath = path.join(APP_ROOT, '.env');

if (fs.existsSync(localEnvPath)) {
    require('dotenv').config({ path: localEnvPath });
    console.log('[Config] Loaded .env.local (Local Test Mode)');
} else if (fs.existsSync(defaultEnvPath)) {
    require('dotenv').config({ path: defaultEnvPath });
    console.log('[Config] Loaded .env');
} else {
    require('dotenv').config();
    console.log('[Config] No local .env found, using defaults');
}

console.log(`[Config] APP_ROOT: ${APP_ROOT}`);

const { io } = require("socket.io-client");
const { exec, spawn, execFile } = require('child_process');

// --- [환경 설정] ---
const PC_CODE = process.env.PC_CODE || 'P01'; // .env에 P01 필수
const SERVER_URL = process.env.API_BASE_URL || 'https://doai.me';
const ADB_PATH = process.env.ADB_PATH || 'adb';
const MAP_FILE = path.join(APP_ROOT, 'device-map.json');
const MAX_SLOTS = 20;

console.log(`🛡️ Worker Started. Identity: [${PC_CODE}] Target: ${SERVER_URL}`);

const socket = io(`${SERVER_URL}/worker`, {
    auth: { token: process.env.WORKER_API_KEY, pcId: PC_CODE },
    transports: ['websocket']
});

// --- [1] IP 조회 로직 개선 ---
async function getDeviceIp(serial) {
    try {
        // 방법 A: wlan0 (Wi-Fi)
        let ipOut = await runAdbCommand(serial, `ip -f inet addr show wlan0`);
        let match = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
        if (match) return match[1];

        // 방법 B: rmnet (데이터/USB테더링) - 일부 기기는 이걸로 잡힘
        ipOut = await runAdbCommand(serial, `ip -f inet addr show rmnet_data0`);
        match = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
        if (match) return match[1];

        return '-';
    } catch (e) { return '-'; }
}

// --- [2] 스마트폰 검증 ---
async function isSmartphone(serial) {
    // 1차 필터: 에뮬레이터나 Wi-Fi 연결 기기 제외 (USB 연결만 허용)
    if (serial.includes('emulator') || serial.includes(':5555')) {
        // 에뮬레이터 또는 Wi-Fi(tcpip) 연결 기기 제외
        return false;
    }

    try {
        const model = await runAdbCommand(serial, 'getprop ro.product.model');
        // 모델명이 비어있으면 기기가 아님
        return model && model.trim().length > 0;
    } catch (e) { return false; }
}

// --- [3] 자동 번호 부여 (Auto-Naming) ---
// Atomic file write: temp 파일에 쓰고 rename으로 교체 (레이스 컨디션 방지)
function atomicWriteMapFile(data) {
    const tempFile = `${MAP_FILE}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
        fs.renameSync(tempFile, MAP_FILE);
    } catch (err) {
        // 임시 파일 정리
        try { fs.unlinkSync(tempFile); } catch (_) {}
        throw err;
    }
}

function getOrRegisterSlot(serial, _existingMap) {
    // 매번 파일을 다시 읽어 최신 상태 확인 (레이스 컨디션 방지)
    let mapData = {};
    try {
        if (fs.existsSync(MAP_FILE)) {
            mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[getOrRegisterSlot] Map file parse error:', e.message);
        mapData = {};
    }

    // 이미 번호가 있으면 반환 (예: "001")
    if (mapData[serial]) return mapData[serial];

    // 빈 번호 찾기
    const usedSlots = Object.values(mapData).map(s => parseInt(s, 10));
    for (let i = 1; i <= MAX_SLOTS; i++) {
        if (!usedSlots.includes(i)) {
            const newSlot = i.toString().padStart(3, '0'); // "001"
            mapData[serial] = newSlot;
            atomicWriteMapFile(mapData);
            // 원본 맵도 업데이트 (caller에서 참조하는 경우 대비)
            if (_existingMap) _existingMap[serial] = newSlot;
            return newSlot;
        }
    }

    // 슬롯 꽉 참 - null 반환
    console.warn(`[getOrRegisterSlot] All ${MAX_SLOTS} slots are full. Cannot register: ${serial}`);
    return null;
}

// --- [4] 메인 루프 ---
async function getConnectedDevices() {
    return new Promise((resolve) => {
        exec(`${ADB_PATH} devices -l`, async (error, stdout) => {
            // 1. 매핑 파일 로드
            let mapData = {};
            try {
                if (fs.existsSync(MAP_FILE)) {
                    mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
                }
            } catch (e) {}

            // 2. 실제 연결된 기기 리스트업
            const connectedSerials = [];
            if (!error) {
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (!line.includes('device') || line.includes('List of')) continue;
                    const serial = line.split(/\s+/)[0];

                    // 검증 로직 실행
                    if (await isSmartphone(serial)) {
                        connectedSerials.push(serial);
                    }
                }
            }

            // 3. 20개 슬롯 데이터 생성
            const finalDevices = [];

            // 연결된 기기들 번호 부여
            for (const serial of connectedSerials) {
                const slot = getOrRegisterSlot(serial, mapData);
                if (slot === null) {
                    console.error(`[Registration] Failed to register device ${serial}: No available slots`);
                    // 슬롯 부족 시 해당 기기는 등록 실패로 처리 (connectedSerials에는 남아있지만 mapData에 없음)
                }
            }

            for (let i = 1; i <= MAX_SLOTS; i++) {
                const slotNum = i.toString().padStart(3, '0'); // "001"
                const deviceId = `${PC_CODE}-${slotNum}`;      // "P01-001" (이게 화면에 뜰 이름)

                // 매핑된 시리얼 찾기
                const mappedSerial = Object.keys(mapData).find(key => mapData[key] === slotNum);

                let status = 'Offline';
                let ip = '-';
                let serialDisplay = '-';

                if (mappedSerial) {
                    serialDisplay = mappedSerial;
                    if (connectedSerials.includes(mappedSerial)) {
                        status = 'Sleep'; // 일단 Sleep으로 보고
                        ip = await getDeviceIp(mappedSerial);
                    }
                }

                finalDevices.push({
                    id: deviceId,       // DB Primary Key 역할
                    name: deviceId,     // UI Title: P01-001
                    serial: serialDisplay,
                    ip: ip,
                    status: status,
                    pcId: PC_CODE       // 그룹핑 키
                });
            }

            resolve(finalDevices);
        });
    });
}

// --- Socket & ADB Helpers ---
socket.on("connect", () => {
    console.log(`✅ Connected! ID: ${socket.id}`);
    startHeartbeat();
});

socket.on("disconnect", (reason) => {
    console.log(`❌ Disconnected: ${reason}`);
    // 연결 해제 시 하트비트 중지
    stopHeartbeat();
});

socket.on("connect_error", (error) => {
    console.error(`🔴 Connection error: ${error.message}`);
});

// 하트비트 인터벌 ID (중복 방지용)
let heartbeatIntervalId = null;

function stopHeartbeat() {
    if (heartbeatIntervalId !== null) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
        console.log('[Heartbeat] Stopped');
    }
}

function startHeartbeat() {
    // 기존 인터벌 정리 (중복 방지)
    stopHeartbeat();

    // 즉시 한번 전송
    sendHeartbeat();

    // 5초마다 반복
    heartbeatIntervalId = setInterval(sendHeartbeat, 5000);
    console.log('[Heartbeat] Started');
}

async function sendHeartbeat() {
    const devices = await getConnectedDevices();
    const activeCount = devices.filter(d => d.status !== 'Offline').length;

    console.log(`💓 Heartbeat: ${activeCount}/${MAX_SLOTS} active devices`);

    socket.emit('worker:heartbeat', {
        pcId: PC_CODE,
        timestamp: Date.now(),
        devices: devices
    });
}

// 시리얼 번호 검증 패턴 (영문, 숫자, 하이픈, 언더스코어, 콜론, 점만 허용)
const SERIAL_PATTERN = /^[A-Za-z0-9_:\-.]+$/;

function validateSerial(serial) {
    if (!serial || typeof serial !== 'string') {
        throw new Error('Invalid serial: empty or not a string');
    }
    if (!SERIAL_PATTERN.test(serial)) {
        throw new Error(`Invalid serial format: ${serial}`);
    }
    return serial;
}

function runAdbCommand(serial, command) {
    return new Promise((resolve, reject) => {
        try {
            // 시리얼 검증 (command injection 방지)
            validateSerial(serial);
        } catch (err) {
            return reject(err);
        }

        // execFile 사용: shell=false로 명령어 인젝션 방지
        // ADB shell 명령은 'shell' 인자 뒤에 하나의 문자열로 전달
        const args = ['-s', serial, 'shell', command];

        execFile(ADB_PATH, args, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout ? stdout.trim() : '');
            }
        });
    });
}

// --- [5] 명령 처리 (Dashboard -> Worker) ---
socket.on('device:command', async (payload) => {
    const { deviceId, command, params, commandId } = payload;
    console.log(`🎮 Command: ${command} for ${deviceId}`);

    try {
        // deviceId에서 시리얼 찾기 (P01-001 -> 시리얼)
        const serial = await getSerialFromDeviceId(deviceId);
        if (!serial) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        const adbCommand = buildAdbCommand(command, params);
        await runAdbCommand(serial, adbCommand);

        socket.emit('command:ack', {
            commandId,
            deviceId,
            status: 'completed'
        });
        console.log(`✅ Command completed: ${command}`);
    } catch (error) {
        socket.emit('command:ack', {
            commandId,
            deviceId,
            status: 'failed',
            error: error.message
        });
        console.error(`❌ Command failed: ${error.message}`);
    }
});

// Helper: deviceId (P01-001)에서 시리얼 찾기
async function getSerialFromDeviceId(deviceId) {
    // deviceId = "P01-001" -> slotNum = "001"
    const slotNum = deviceId.split('-')[1];
    if (!slotNum) return null;

    try {
        if (fs.existsSync(MAP_FILE)) {
            const mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
            // mapData: { "시리얼": "001", ... }
            const serial = Object.keys(mapData).find(key => mapData[key] === slotNum);
            return serial || null;
        }
    } catch (e) {}
    return null;
}

// Helper: 명령어 빌드
function buildAdbCommand(command, params = {}) {
    switch (command) {
        case 'tap':
            return `input tap ${params.x || 0} ${params.y || 0}`;
        case 'swipe': {
            const duration = params.duration || 300;
            return `input swipe ${params.x || 0} ${params.y || 0} ${params.x2 || 0} ${params.y2 || 0} ${duration}`;
        }
        case 'keyevent':
            return `input keyevent ${params.keycode || 0}`;
        case 'text': {
            // ADB input text 이스케이프:
            // 1. 공백은 %s로 변환 (ADB 특수 처리)
            // 2. 쉘 특수 문자들은 백슬래시로 이스케이프
            const escapedText = (params.text || '')
                // 공백을 %s로 변환 (ADB input text 규칙)
                .replaceAll(' ', '%s')
                // 백슬래시 먼저 이스케이프
                .replaceAll('\\', '\\\\')
                // 따옴표 이스케이프
                .replaceAll("'", "\\'")
                .replaceAll('"', '\\"')
                // 쉘 특수 문자 이스케이프
                .replaceAll('$', '\\$')
                .replaceAll('`', '\\`')
                .replaceAll('!', '\\!')
                .replaceAll('&', '\\&')
                .replaceAll('|', '\\|')
                .replaceAll(';', '\\;')
                .replaceAll('<', '\\<')
                .replaceAll('>', '\\>')
                .replaceAll('*', '\\*')
                .replaceAll('?', '\\?')
                .replaceAll('(', '\\(')
                .replaceAll(')', '\\)')
                .replaceAll('[', '\\[')
                .replaceAll(']', '\\]')
                .replaceAll('{', '\\{')
                .replaceAll('}', '\\}');
            return `input text "${escapedText}"`;
        }
        case 'shell':
            return params.shellCommand || '';
        default:
            return command;
    }
}

// --- [6] 스트리밍 (Dashboard 원격 보기) ---
const activeStreams = new Map();

socket.on('stream:start', (payload) => {
    const { deviceId, fps = 2 } = payload;
    console.log(`🎥 Stream start: ${deviceId} at ${fps} FPS`);

    // 기존 스트림 중지
    if (activeStreams.has(deviceId)) {
        clearInterval(activeStreams.get(deviceId));
    }

    const interval = setInterval(async () => {
        try {
            const serial = await getSerialFromDeviceId(deviceId);
            if (!serial) return;

            const base64Img = await captureScreen(serial);
            if (base64Img && socket.connected) {
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
});

socket.on('stream:stop', (payload) => {
    const { deviceId } = payload;
    console.log(`🛑 Stream stop: ${deviceId}`);

    if (activeStreams.has(deviceId)) {
        clearInterval(activeStreams.get(deviceId));
        activeStreams.delete(deviceId);
    }
});

// 화면 캡처 (spawn 사용 - 바이너리 안전)
async function captureScreen(serial) {
    const devicePath = '/sdcard/stream_capture.png';

    // Step 1: 폰에 스크린샷 저장
    await new Promise((res, rej) => {
        execFile(ADB_PATH, ['-s', serial, 'shell', 'screencap', '-p', devicePath],
            { timeout: 5000 },
            (error) => error ? rej(error) : res()
        );
    });

    // Step 2: spawn으로 바이너리 읽기 (Promise executor는 동기적으로)
    return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;

        const cleanup = () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        const safeResolve = (value) => {
            if (!settled) {
                settled = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (err) => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(err);
            }
        };

        const child = spawn(ADB_PATH, ['-s', serial, 'shell', 'cat', devicePath]);

        const chunks = [];
        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.stderr.on('data', (data) => {
            console.error(`[Capture] Stderr: ${data}`);
        });

        child.on('error', (err) => {
            safeReject(new Error(`Spawn error: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) {
                const buffer = Buffer.concat(chunks);
                if (buffer.length === 0) {
                    safeReject(new Error('Empty buffer'));
                } else {
                    safeResolve(buffer.toString('base64'));
                }
            } else {
                safeReject(new Error(`ADB exited with code ${code}`));
            }
        });

        // Timeout - 프로세스가 아직 실행 중이면 kill
        timeoutId = setTimeout(() => {
            if (!settled && !child.killed) {
                child.kill();
            }
            safeReject(new Error('Capture timeout'));
        }, 10000);
    });
}

// --- [7] 작업 수신 (Socket.io) ---
socket.on('job:assign', async (payload) => {
    const { assignmentId, deviceId, deviceSerial, job } = payload;
    console.log(`📋 Job assigned: ${assignmentId} for ${deviceSerial || deviceId}`);

    try {
        // 시리얼 번호 확인
        const serial = deviceSerial || await getSerialFromDeviceId(deviceId);
        if (!serial || serial === '-') {
            throw new Error(`Device serial not found for ${deviceId}`);
        }

        // 작업 실행
        await startJobOnDevice(serial, assignmentId, job);

        socket.emit('job:ack', {
            assignmentId,
            status: 'started',
            deviceId,
            timestamp: Date.now()
        });
        console.log(`✅ Job started: ${assignmentId}`);
    } catch (error) {
        console.error(`❌ Job start failed: ${error.message}`);
        socket.emit('job:ack', {
            assignmentId,
            status: 'failed',
            error: error.message
        });
    }
});

socket.on('job:paused', (payload) => {
    console.log(`⏸️ Job paused: ${payload.jobId}`);
    // TODO: AutoX.js 스크립트에 pause 신호 전송
});

socket.on('job:cancelled', (payload) => {
    console.log(`🛑 Job cancelled: ${payload.jobId}`);
    // TODO: AutoX.js 스크립트 강제 종료
});

// --- [8] AutoX.js 스크립트 실행 ---
const AUTOXJS_SCRIPT_PATH = '/sdcard/Scripts/doai-bot/bot.js';
const JOB_JSON_PATH = '/sdcard/job.json';

/**
 * 디바이스에서 AutoX.js 스크립트 실행
 * @param {string} serial - 디바이스 시리얼
 * @param {string} assignmentId - 작업 할당 ID
 * @param {object} job - 작업 데이터
 */
async function startJobOnDevice(serial, assignmentId, job) {
    console.log(`🚀 Starting job on ${serial}: ${job.display_name || job.id}`);

    // 1. Job Payload 구성
    const jobPayload = {
        // 작업 식별
        job_id: job.id,
        assignment_id: assignmentId,
        device_id: `${PC_CODE}-${await getSlotFromSerial(serial)}`,
        
        // 영상 정보
        video_url: job.target_url,
        video_title: job.video_title || job.title || '',
        keyword: job.keyword || '',
        
        // 시청 시간 설정
        duration_min_sec: job.watch_duration_min || job.duration_sec || 60,
        duration_max_sec: job.watch_duration_max || (job.duration_sec ? job.duration_sec * 2 : 180),
        
        // 상호작용 확률
        prob_like: job.prob_like || 0,
        prob_comment: job.prob_comment || 0,
        prob_subscribe: job.prob_subscribe || 0,
        prob_playlist: job.prob_playlist || 0,
        
        // 댓글 목록 (서버에서 미리 생성됨: 확률 * 노드수 * 2)
        comments: job.comments || [],
        
        // 기능 플래그
        enable_search: job.enable_search !== false,
        enable_forward_action: job.enable_forward_action !== false,
        enable_random_surf: job.enable_random_surf !== false,
        forward_action_count: job.forward_action_count || 5,
        surf_video_count: job.surf_video_count || 1,
        
        // Supabase 연결 (옵션)
        supabase_url: process.env.SUPABASE_URL || '',
        supabase_key: process.env.SUPABASE_ANON_KEY || '',
        
        // 완료 플래그 경로
        done_flag_path: `/sdcard/completion_${assignmentId}.flag`,
        
        // 메타데이터
        created_at: job.created_at || new Date().toISOString(),
        worker_version: '5.1'
    };

    // 2. JSON을 Base64로 인코딩
    const payloadStr = JSON.stringify(jobPayload);
    const payloadB64 = Buffer.from(payloadStr).toString('base64');

    console.log(`[Job] Payload prepared (${payloadStr.length} bytes -> ${payloadB64.length} B64)`);

    // 3. job.json 파일로 먼저 전송 (안정적인 방법)
    await writeJobJsonToDevice(serial, jobPayload);

    // 4. AutoX.js 실행 (두 가지 방법 시도)
    try {
        // 방법 A: RunIntent로 Base64 전달
        await runAutoXjsWithIntent(serial, payloadB64);
    } catch (intentError) {
        console.warn(`[Job] Intent 방식 실패, Broadcast 시도: ${intentError.message}`);
        
        // 방법 B: Broadcast로 스크립트 실행 (job.json 파일 사용)
        await runAutoXjsWithBroadcast(serial);
    }

    console.log(`[Job] AutoX.js 실행 완료: ${assignmentId}`);
}

/**
 * job.json 파일을 디바이스에 저장
 */
async function writeJobJsonToDevice(serial, jobPayload) {
    const tempFile = path.join(APP_ROOT, `temp_job_${Date.now()}.json`);
    
    try {
        // 로컬에 임시 파일 생성
        fs.writeFileSync(tempFile, JSON.stringify(jobPayload, null, 2));
        
        // ADB push로 디바이스에 전송
        await new Promise((resolve, reject) => {
            execFile(ADB_PATH, ['-s', serial, 'push', tempFile, JOB_JSON_PATH], 
                { timeout: 10000 },
                (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolve(stdout);
                }
            );
        });
        
        console.log(`[Job] job.json pushed to device: ${JOB_JSON_PATH}`);
    } finally {
        // 임시 파일 삭제
        try { fs.unlinkSync(tempFile); } catch (_) {}
    }
}

/**
 * AutoX.js RunIntent로 스크립트 실행 (Base64 payload 전달)
 */
async function runAutoXjsWithIntent(serial, payloadB64) {
    // AutoX.js RunIntent 형식
    const cmd = `am start -n org.autojs.autojs/.external.open.RunIntentActivity ` +
                `-d "file://${AUTOXJS_SCRIPT_PATH}" ` +
                `--es "jobDataB64" "${payloadB64}"`;
    
    await runAdbShell(serial, cmd);
}

/**
 * AutoX.js Broadcast로 스크립트 실행 (job.json 파일 사용)
 */
async function runAutoXjsWithBroadcast(serial) {
    // AutoX.js 브로드캐스트 실행
    const cmd = `am broadcast -a org.autojs.autojs.action.RUN_SCRIPT ` +
                `-e "path" "${AUTOXJS_SCRIPT_PATH}"`;
    
    await runAdbShell(serial, cmd);
}

/**
 * ADB shell 명령 실행 (범용)
 * execFile 사용으로 command injection 방지
 */
function runAdbShell(serial, shellCmd) {
    return new Promise((resolve, reject) => {
        try {
            // 시리얼 검증 (command injection 방지)
            validateSerial(serial);
        } catch (err) {
            return reject(err);
        }

        // execFile 사용: shell=false로 명령어 인젝션 방지
        const args = ['-s', serial, 'shell', shellCmd];

        execFile(ADB_PATH, args, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`ADB shell error: ${error.message}`));
            } else {
                resolve(stdout ? stdout.trim() : '');
            }
        });
    });
}

/**
 * 시리얼에서 슬롯 번호 가져오기
 */
async function getSlotFromSerial(serial) {
    try {
        if (fs.existsSync(MAP_FILE)) {
            const mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
            return mapData[serial] || '000';
        }
    } catch (e) {}
    return '000';
}

// --- [9] 작업 완료 모니터링 ---
const activeJobs = new Map(); // assignmentId -> { serial, startTime, ... }

/**
 * 완료 플래그 파일 모니터링 (폴링 방식)
 */
async function checkJobCompletion(serial, assignmentId) {
    const flagPath = `/sdcard/completion_${assignmentId}.flag`;
    
    try {
        const flagContent = await runAdbCommand(serial, `cat ${flagPath}`);
        if (flagContent) {
            const result = JSON.parse(flagContent);
            return result;
        }
    } catch (e) {
        // 파일이 없거나 읽기 실패
    }
    return null;
}

console.log('[System] Worker v5.1 (Job Executor) started');
console.log('[System] Waiting for Socket.io connection...');
