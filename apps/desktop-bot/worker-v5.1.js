/**
 * [Agent-Node] Worker Client v5.1
 * 역할: WebView 기반 YouTube 검색 자동화
 *
 * 주요 변경사항 (v2.0 → v5.1):
 * - WebView bot (bot-webview.js) 통합
 * - JSON 파일 기반 파라미터 전달 (ADB broadcast extras 대신)
 * - 고유 증거 파일 경로 (/sdcard/evidence_{job_id}.png)
 * - 완료 시그널 기반 증거 회수 (flag 파일)
 * - 파일 해시 기반 배포 최적화
 * - Atomic job claiming (RPC)
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.json');

// =============================================
// 1. 초기 설정
// =============================================

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADB_PATH = process.env.ADB_PATH || 'adb';
const PC_ID = config.pc_id;
const DEFAULT_GROUP = config.groups.default;

// 경로 설정
const CLIENT_DIR = __dirname;
const CLIENT_MOBILE_DIR = path.join(CLIENT_DIR, '..', 'client-mobile');
const SCREENSHOT_DIR = path.join(CLIENT_DIR, 'screenshots');

// 스크린샷 디렉토리 생성
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 로컬 캐시
const deviceIdCache = new Map(); // serial_number -> device UUID
const deployedDevices = new Map(); // serial -> lastDeployHash
const jobQueue = [];
let isProcessing = false;

console.log(`[System] PC-Client v5.1 (${PC_ID}) Starting...`);
console.log(`[System] ADB Path: ${ADB_PATH}`);
console.log(`[System] Mobile Scripts: ${CLIENT_MOBILE_DIR}`);

// =============================================
// 2. WebView Bot 파일 배포 설정
// =============================================

const BOT_FILES = [
    { local: 'bot-webview.js', remote: '/sdcard/Scripts/webview_bot.js' },
    { local: 'config.json', remote: '/sdcard/Scripts/config.json' },
    { local: 'selectors.json', remote: '/sdcard/Scripts/selectors.json' },
    { local: 'modules/webview-setup.js', remote: '/sdcard/Scripts/modules/webview-setup.js' },
    { local: 'modules/dom-control.js', remote: '/sdcard/Scripts/modules/dom-control.js' },
    { local: 'modules/search-flow.js', remote: '/sdcard/Scripts/modules/search-flow.js' }
];

/**
 * 파일 해시 계산 (배포 최적화용)
 */
function getFilesHash() {
    let combinedHash = '';
    for (const file of BOT_FILES) {
        const localPath = path.join(CLIENT_MOBILE_DIR, file.local);
        if (fs.existsSync(localPath)) {
            const content = fs.readFileSync(localPath);
            const hash = crypto.createHash('md5').update(content).digest('hex');
            combinedHash += hash;
        }
    }
    return crypto.createHash('md5').update(combinedHash).digest('hex');
}

/**
 * WebView 봇 파일 배포 (해시 체크로 중복 방지)
 */
async function deployBotFiles(serial) {
    const currentHash = getFilesHash();

    // 이미 배포된 경우 스킵
    if (deployedDevices.get(serial) === currentHash) {
        return;
    }

    console.log(`[Deploy] ${serial}: WebView 봇 파일 배포 시작...`);

    // 디렉토리 생성
    await runAdb(['-s', serial, 'shell', 'mkdir', '-p', '/sdcard/Scripts/modules']);

    // 파일 배포
    for (const file of BOT_FILES) {
        const localPath = path.join(CLIENT_MOBILE_DIR, file.local);
        if (fs.existsSync(localPath)) {
            await runAdb(['-s', serial, 'push', localPath, file.remote]);
            console.log(`[Deploy] ${serial}: ${file.local} → ${file.remote}`);
        } else {
            console.warn(`[Deploy] ${serial}: 파일 없음 - ${localPath}`);
        }
    }

    // 배포 완료 마킹
    deployedDevices.set(serial, currentHash);
    console.log(`[Deploy] ${serial}: 배포 완료 (hash: ${currentHash.substring(0, 8)})`);
}

// =============================================
// 3. ADB 유틸리티 함수
// =============================================

const SERIAL_REGEX = /^[a-zA-Z0-9:_-]+$/;

function isValidSerial(serial) {
    return typeof serial === 'string' &&
           serial.length > 0 &&
           serial.length <= 64 &&
           SERIAL_REGEX.test(serial);
}

/**
 * ADB 명령 실행 (Promise 기반)
 */
function runAdb(args) {
    return new Promise((resolve, reject) => {
        execFile(ADB_PATH, args, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

/**
 * 연결된 기기 목록 조회
 */
async function getConnectedDevices() {
    try {
        const stdout = await runAdb(['devices']);
        const devices = [];
        const lines = stdout.split('\n');

        for (let line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2 && parts[1].trim() === 'device') {
                const serial = parts[0].trim();
                if (isValidSerial(serial)) {
                    devices.push(serial);
                }
            }
        }
        return devices;
    } catch (error) {
        console.error(`[ADB Error]`, error.message);
        return [];
    }
}

// =============================================
// 4. 장치 동기화 (Watchdog)
// =============================================

async function syncDevices() {
    const serials = await getConnectedDevices();

    if (serials.length === 0) {
        console.log(`[Watchdog] 연결된 기기 없음. 대기중...`);
        return [];
    }

    for (const serial of serials) {
        const groupId = config.groups.mappings[serial] || DEFAULT_GROUP;

        // Upsert 기기 정보
        const { data, error } = await supabase
            .from('devices')
            .upsert({
                serial_number: serial,
                pc_id: PC_ID,
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
            console.log(`[Sync] ${serial} -> ${data.id}`);

            // 봇 파일 배포
            await deployBotFiles(serial);
        }
    }

    console.log(`[Sync] ${serials.length}대 장치 동기화 완료`);
    return serials;
}

// =============================================
// 5. 작업 폴링 (Atomic Claiming)
// =============================================

async function pollForJobs() {
    try {
        // 연결된 기기 정보 수집
        const connectedSerials = await getConnectedDevices();
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

        // Atomic job claiming (RPC 사용)
        for (const deviceInfo of connectedDeviceIds) {
            // 기기가 idle 상태인지 확인
            const { data: device } = await supabase
                .from('devices')
                .select('status')
                .eq('id', deviceInfo.id)
                .single();

            if (!device || device.status !== 'idle') {
                continue; // busy 기기는 스킵
            }

            // claim_job RPC 호출 (race condition 방지)
            const { data: claimed, error } = await supabase
                .rpc('claim_job', {
                    p_pc_id: PC_ID,
                    p_device_id: deviceInfo.id
                })
                .single();

            if (error || !claimed) {
                continue; // 할당 가능한 작업 없음
            }

            console.log(`[Poll] 작업 할당: ${claimed.assignment_id} → ${deviceInfo.serial}`);

            // 큐에 추가
            if (!jobQueue.find(j => j.assignment_id === claimed.assignment_id)) {
                jobQueue.push({
                    assignment_id: claimed.assignment_id,
                    job_id: claimed.job_id,
                    device_id: deviceInfo.id,
                    device_serial: deviceInfo.serial,
                    keyword: claimed.keyword,
                    video_title: claimed.video_title,
                    duration_sec: claimed.duration_sec || 60
                });
            }
        }

        // 큐 처리 시작
        processQueue();

    } catch (err) {
        console.error('[Poll Exception]', err.message);
    }
}

// =============================================
// 6. 큐 처리 (Queue Management)
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
            console.error(`[Execute Error] ${assignment.assignment_id}:`, err.message);

            await supabase
                .from('job_assignments')
                .update({
                    status: 'failed',
                    error_log: err.message
                })
                .eq('id', assignment.assignment_id);
        }

        // 작업 간 딜레이 (1초)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessing = false;
}

// =============================================
// 7. 작업 실행 (WebView Bot)
// =============================================

async function executeJob(assignment) {
    const { assignment_id, device_id, device_serial, keyword, video_title, duration_sec } = assignment;

    console.log(`[Execute] 작업 시작: ${assignment_id}`);
    console.log(`[Execute] 기기: ${device_serial}, 검색어: "${keyword}"`);

    // 1. job.json 생성 (파라미터 전달)
    const evidencePath = `/sdcard/evidence_${assignment_id}.png`;
    const doneFlagPath = `/sdcard/done_${assignment_id}.flag`;

    const jobParams = {
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, // Anon key 사용 (봇은 service role 불필요)
        assignment_id: assignment_id,
        keyword: keyword || video_title || 'default search',
        video_title: video_title,
        duration_sec: duration_sec,
        evidence_path: evidencePath,
        done_flag_path: doneFlagPath
    };

    const jobFile = path.join(CLIENT_DIR, `job_${device_serial}.json`);
    fs.writeFileSync(jobFile, JSON.stringify(jobParams, null, 2));

    // 2. job.json 전송
    await runAdb(['-s', device_serial, 'push', jobFile, '/sdcard/job.json']);
    console.log(`[Execute] job.json 전송 완료`);

    // 3. 이전 flag 파일 정리
    try {
        await runAdb(['-s', device_serial, 'shell', 'rm', doneFlagPath]);
    } catch (e) {
        // 파일이 없으면 무시
    }

    // 4. WebView 봇 실행 (ADB broadcast)
    try {
        await runAdb([
            '-s', device_serial,
            'shell', 'am', 'broadcast',
            '-a', 'org.autojs.autojs.v6.action.startup',
            '-e', 'path', '/sdcard/Scripts/webview_bot.js'
        ]);
        console.log(`[Execute] WebView 봇 실행 완료`);
    } catch (error) {
        console.error(`[Execute] 봇 실행 실패:`, error.message);
        throw error;
    }

    // 5. 완료 대기 (flag 파일 감시)
    const completed = await waitForCompletion(device_serial, doneFlagPath, 120000);

    if (!completed) {
        console.warn(`[Execute] 작업 타임아웃: ${assignment_id}`);
        throw new Error('작업 타임아웃 (120초 초과)');
    }

    console.log(`[Execute] 작업 완료 시그널 수신`);

    // 6. 증거 파일 회수
    const localEvidencePath = path.join(SCREENSHOT_DIR, `proof_${assignment_id}.png`);
    try {
        await runAdb(['-s', device_serial, 'pull', evidencePath, localEvidencePath]);
        console.log(`[Execute] 증거 수집 완료: ${localEvidencePath}`);

        // 증거 파일 정리
        await runAdb(['-s', device_serial, 'shell', 'rm', evidencePath]);
        await runAdb(['-s', device_serial, 'shell', 'rm', doneFlagPath]);
    } catch (error) {
        console.warn(`[Execute] 증거 수집 실패:`, error.message);
        // 증거 수집 실패는 치명적이지 않으므로 계속 진행
    }

    // 7. 완료 처리 (Edge Function 호출)
    // Note: WebView 봇이 이미 complete-job-assignment를 호출했을 수 있음
    // 여기서는 로컬 상태만 정리

    // 8. 기기 상태 복구
    await supabase
        .from('devices')
        .update({ status: 'idle' })
        .eq('id', device_id);

    console.log(`[Execute] 작업 완료: ${assignment_id}`);
}

/**
 * 작업 완료 대기 (flag 파일 감시)
 */
async function waitForCompletion(serial, flagPath, timeoutMs = 120000) {
    const startTime = Date.now();
    const checkInterval = 3000; // 3초마다 체크

    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = await runAdb(['-s', serial, 'shell', 'ls', flagPath]);
            if (!result.includes('No such file')) {
                return true; // 완료 플래그 발견
            }
        } catch (error) {
            // ls 실패는 파일이 없다는 의미
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false; // 타임아웃
}

// =============================================
// 8. 메인 실행 루프
// =============================================

// 장치 동기화 (5초마다)
setInterval(syncDevices, config.scan_interval_ms || 5000);
syncDevices();

// 작업 폴링 (3초마다)
setInterval(pollForJobs, 3000);
pollForJobs();

console.log('[System] Worker v5.1 started. Polling for jobs...');
