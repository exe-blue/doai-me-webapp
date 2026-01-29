const fs = require('fs');
const path = require('path');

// Load .env.local first (for local testing), fallback to .env
const localEnvPath = path.join(__dirname, '.env.local');
const defaultEnvPath = path.join(__dirname, '.env');

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

const { io } = require("socket.io-client");
const { exec, spawn } = require('child_process');

// --- [환경 설정] ---
const PC_CODE = process.env.PC_CODE || 'P01'; // .env에 P01 필수
const SERVER_URL = process.env.API_BASE_URL || 'https://doai.me';
const ADB_PATH = process.env.ADB_PATH || 'adb';
const MAP_FILE = path.join(__dirname, 'device-map.json');
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
    // 1차 필터: 시리얼 번호에 'emulator'나 'localhost'가 있으면 제외 (USB 연결만 허용할 경우)
    if (serial.includes('emulator') || serial.includes(':5555')) {
        // 와이파이 연결 기기도 제외하고 싶으면 여기서 return false;
        // 일단은 유지
    }

    try {
        const model = await runAdbCommand(serial, 'getprop ro.product.model');
        // 모델명이 비어있으면 기기가 아님
        return model && model.trim().length > 0;
    } catch (e) { return false; }
}

// --- [3] 자동 번호 부여 (Auto-Naming) ---
function getOrRegisterSlot(serial, existingMap) {
    if (existingMap[serial]) return existingMap[serial]; // 이미 번호 있음 (예: "001")

    // 빈 번호 찾기
    const usedSlots = Object.values(existingMap).map(s => parseInt(s, 10));
    for (let i = 1; i <= MAX_SLOTS; i++) {
        if (!usedSlots.includes(i)) {
            const newSlot = i.toString().padStart(3, '0'); // "001"
            existingMap[serial] = newSlot;
            fs.writeFileSync(MAP_FILE, JSON.stringify(existingMap, null, 2));
            return newSlot;
        }
    }
    return null; // 슬롯 꽉 참
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
                getOrRegisterSlot(serial, mapData);
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
});

socket.on("connect_error", (error) => {
    console.error(`🔴 Connection error: ${error.message}`);
});

function startHeartbeat() {
    // 즉시 한번 전송
    sendHeartbeat();

    // 5초마다 반복
    setInterval(sendHeartbeat, 5000);
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

function runAdbCommand(serial, command) {
    return new Promise((resolve, reject) => {
        exec(`${ADB_PATH} -s ${serial} shell ${command}`, { timeout: 5000 }, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout ? stdout.trim() : '');
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
        case 'swipe':
            const duration = params.duration || 300;
            return `input swipe ${params.x || 0} ${params.y || 0} ${params.x2 || 0} ${params.y2 || 0} ${duration}`;
        case 'keyevent':
            return `input keyevent ${params.keycode || 0}`;
        case 'text':
            const escapedText = (params.text || '').replace(/['"\\]/g, '\\$&');
            return `input text "${escapedText}"`;
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

    return new Promise(async (resolve, reject) => {
        try {
            // Step 1: 폰에 스크린샷 저장
            await new Promise((res, rej) => {
                exec(`${ADB_PATH} -s ${serial} shell screencap -p ${devicePath}`,
                    { timeout: 5000 },
                    (error) => error ? rej(error) : res()
                );
            });

            // Step 2: spawn으로 바이너리 읽기
            const child = spawn(ADB_PATH, ['-s', serial, 'shell', 'cat', devicePath]);

            const chunks = [];
            child.stdout.on('data', (chunk) => chunks.push(chunk));
            child.stderr.on('data', (data) => {
                console.error(`[Capture] Stderr: ${data}`);
            });

            child.on('error', (err) => reject(new Error(`Spawn error: ${err.message}`)));

            child.on('close', (code) => {
                if (code === 0) {
                    const buffer = Buffer.concat(chunks);
                    if (buffer.length === 0) return reject(new Error('Empty buffer'));
                    resolve(buffer.toString('base64'));
                } else {
                    reject(new Error(`ADB exited with code ${code}`));
                }
            });

            // Timeout
            setTimeout(() => {
                child.kill();
                reject(new Error('Capture timeout'));
            }, 10000);

        } catch (err) {
            reject(err);
        }
    });
}

// --- [7] 작업 수신 (Socket.io) ---
socket.on('job:assign', async (payload) => {
    const { assignmentId, deviceId, deviceSerial, job } = payload;
    console.log(`📋 Job assigned: ${assignmentId} for ${deviceSerial || deviceId}`);

    // 작업 실행 로직은 별도 모듈로 분리 가능
    // 현재는 로그만 출력
    socket.emit('job:ack', {
        assignmentId,
        status: 'received'
    });
});

socket.on('job:paused', (payload) => {
    console.log(`⏸️ Job paused: ${payload.jobId}`);
});

socket.on('job:cancelled', (payload) => {
    console.log(`🛑 Job cancelled: ${payload.jobId}`);
});

console.log('[System] Worker v5.0 (Simplified) started');
console.log('[System] Waiting for Socket.io connection...');
