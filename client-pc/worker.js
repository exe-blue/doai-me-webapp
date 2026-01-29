/**
 * [Agent-Node] Worker Client v2.0
 * 역할: ADB 장치 감시, Supabase 등록, 작업 폴링 및 자동 실행
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
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

// 로컬 캐시: serial_number -> device UUID 매핑
const deviceIdCache = new Map();

// 로컬 작업 큐
const jobQueue = [];
let isProcessing = false;

console.log(`[System] PC-Client (${PC_ID}) Starting...`);
console.log(`[System] ADB Path: ${ADB_PATH}`);
console.log(`[System] Default Group: ${DEFAULT_GROUP}`);

// =============================================
// 2. ADB 유틸리티 함수
// =============================================

function getConnectedDevices() {
    return new Promise((resolve) => {
        exec(`"${ADB_PATH}" devices`, (error, stdout) => {
            if (error) {
                console.error(`[ADB Error] ${error.message}`);
                resolve([]);
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
            resolve(devices);
        });
    });
}

// serial 유효성 검증을 위한 정규식 (영숫자, 콜론, 하이픈, 언더스코어만 허용)
const SERIAL_REGEX = /^[a-zA-Z0-9:_-]+$/;

/**
 * serial 유효성 검증 함수
 * @param {string} serial - 검증할 시리얼 번호
 * @returns {boolean} - 유효하면 true
 */
function isValidSerial(serial) {
    return typeof serial === 'string' && 
           serial.length > 0 && 
           serial.length <= 64 && 
           SERIAL_REGEX.test(serial);
}

/**
 * 명령어 문자열을 안전한 인자 배열로 파싱
 * @param {string} command - 파싱할 명령어 문자열
 * @returns {string[]} - 인자 배열
 */
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
    
    // 닫히지 않은 따옴표 검출
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
        // serial 유효성 검증 (command injection 방지)
        if (!isValidSerial(serial)) {
            const error = new Error(`유효하지 않은 시리얼 번호: ${serial.substring(0, 20)}`);
            console.error(`[ADB Error] 시리얼 검증 실패`);
            reject(error);
            return;
        }
        
        // 명령어를 안전한 인자 배열로 변환
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
// 3. 장치 동기화 (Watchdog)
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
            // 캐시 업데이트
            deviceIdCache.set(serial, data.id);
        }
    }

    console.log(`[Sync] ${serials.length}대 장치 동기화 완료`);
    return serials;
}

// =============================================
// 4. 작업 폴링 (Polling Logic)
// =============================================

async function pollForJobs() {
    try {
        // 연결된 기기의 device ID 목록 가져오기
        const connectedSerials = await getConnectedDevices();
        const connectedDeviceIds = [];
        
        for (const serial of connectedSerials) {
            let deviceId = deviceIdCache.get(serial);
            
            if (!deviceId) {
                // 캐시에 없으면 DB에서 조회
                const { data } = await supabase
                    .from('devices')
                    .select('id')
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

        // pending 상태의 assignments 조회
        const { data: assignments, error } = await supabase
            .from('job_assignments')
            .select(`
                id,
                job_id,
                device_id,
                status,
                jobs (
                    id,
                    target_url,
                    duration_min_pct,
                    duration_max_pct,
                    prob_like
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

        // serial_number 정보 추가하여 큐에 추가
        for (const assignment of assignments) {
            const deviceInfo = connectedDeviceIds.find(d => d.id === assignment.device_id);
            if (deviceInfo && !jobQueue.find(j => j.id === assignment.id)) {
                jobQueue.push({
                    ...assignment,
                    device_serial: deviceInfo.serial
                });
                console.log(`[Queue] 작업 추가: ${assignment.id} (${deviceInfo.serial})`);
            }
        }

        // 큐 처리 시작
        processQueue();

    } catch (err) {
        console.error('[Poll Exception]', err.message);
    }
}

// =============================================
// 5. 큐 처리 (Queue Management)
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

        // 작업 간 딜레이 (1초)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessing = false;
}

// =============================================
// 6. 작업 실행 (Command Execution)
// =============================================

// URL 허용 패턴 (YouTube 도메인만 허용)
const YOUTUBE_URL_REGEX = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\/.*/i;

/**
 * YouTube URL 검증 및 sanitize
 * @param {string} url - 검증할 URL
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
function validateAndSanitizeUrl(url) {
    try {
        // URL 파싱 (유효하지 않으면 예외 발생)
        const parsedUrl = new URL(url);
        
        // 프로토콜 검증 (http/https만 허용)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, sanitized: '', error: '허용되지 않은 프로토콜' };
        }
        
        // YouTube 도메인 허용 목록
        const allowedHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
        if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
            return { valid: false, sanitized: '', error: '허용되지 않은 도메인' };
        }
        
        // URL 전체 패턴 검증
        if (!YOUTUBE_URL_REGEX.test(url)) {
            return { valid: false, sanitized: '', error: 'YouTube URL 형식이 아닙니다' };
        }
        
        // encodeURI로 안전하게 인코딩하고 위험 문자 제거/인코딩
        let sanitized = parsedUrl.href;
        // 쉘 명령 주입에 사용될 수 있는 문자 인코딩
        // 참고: '&'는 YouTube 쿼리 문자열에서 파라미터 구분에 사용되므로 인코딩하지 않음
        // (YouTube URL 패턴 검증을 이미 통과했으므로 안전)
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
        return;
    }

    console.log(`[Execute] 작업 시작: ${id}`);
    console.log(`[Execute] 기기: ${device_serial}, URL: ${job.target_url}`);

    // 1. 상태를 running으로 업데이트 (에러 처리 포함)
    let assignmentUpdated = false;
    let deviceUpdated = false;
    
    try {
        const { error: assignmentError } = await supabase
            .from('job_assignments')
            .update({ 
                status: 'running',
                started_at: new Date().toISOString()
            })
            .eq('id', id);

        if (assignmentError) {
            console.error(`[DB Error] job_assignments 업데이트 실패: ${assignmentError.message}`);
            throw new Error(`job_assignments 업데이트 실패: ${assignmentError.message}`);
        }
        assignmentUpdated = true;

        // 2. 기기 상태를 busy로 업데이트
        const { error: deviceError } = await supabase
            .from('devices')
            .update({ status: 'busy' })
            .eq('id', device_id);

        if (deviceError) {
            console.error(`[DB Error] devices 업데이트 실패: ${deviceError.message}`);
            // assignment 상태 롤백 (롤백 실패도 별도 처리)
            let rollbackError = null;
            try {
                const { error: rbError } = await supabase
                    .from('job_assignments')
                    .update({ status: 'pending', started_at: null })
                    .eq('id', id);
                if (rbError) {
                    rollbackError = rbError;
                    console.error(`[DB Error] job_assignments 롤백 실패: ${rbError.message}`);
                }
            } catch (rbException) {
                rollbackError = rbException;
                console.error(`[DB Error] job_assignments 롤백 예외: ${rbException.message}`);
            }
            
            // 원본 에러와 롤백 에러를 모두 포함한 에러 throw
            if (rollbackError) {
                throw new Error(`devices 업데이트 실패: ${deviceError.message} (롤백도 실패: ${rollbackError.message})`);
            }
            throw new Error(`devices 업데이트 실패: ${deviceError.message}`);
        }
        deviceUpdated = true;
    } catch (dbError) {
        console.error(`[Execute] DB 초기화 실패: ${dbError.message}`);
        throw dbError;
    }

    try {
        // 3. 화면 깨우기
        await executeAdbCommand(device_serial, 'shell input keyevent 26');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. 유튜브 실행 - URL 검증 및 sanitize
        const urlValidation = validateAndSanitizeUrl(job.target_url);
        if (!urlValidation.valid) {
            throw new Error(`유효하지 않은 URL: ${urlValidation.error}`);
        }
        const videoUrl = urlValidation.sanitized;
        
        // execFile을 통해 실행되므로 shell 해석 없이 안전하게 전달
        await executeAdbCommand(
            device_serial,
            `shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n com.google.android.youtube/.UrlActivity`
        );

        // 5. 시청 시간 계산 (불확실성 적용)
        const minPct = job.duration_min_pct;
        const maxPct = job.duration_max_pct;
        const randomPct = Math.floor(Math.random() * (maxPct - minPct + 1)) + minPct;
        const baseDuration = 300; // 기본 5분 가정
        const watchDuration = Math.floor(baseDuration * (randomPct / 100));

        console.log(`[Execute] 시청 시간: ${watchDuration}초 (${randomPct}%)`);

        // 6. 시청 시뮬레이션 (10초마다 진행률 업데이트)
        let elapsed = 0;
        while (elapsed < watchDuration) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            elapsed += 10;

            const progressPct = Math.min(100, Math.round((elapsed / watchDuration) * 100));
            
            await supabase
                .from('job_assignments')
                .update({ progress_pct: progressPct })
                .eq('id', id);

            console.log(`[Execute] ${device_serial}: ${elapsed}s / ${watchDuration}s (${progressPct}%)`);
        }

        // 7. 좋아요 처리 (확률 기반)
        if (job.prob_like > 0) {
            const shouldLike = Math.random() * 100 < job.prob_like;
            if (shouldLike) {
                console.log(`[Execute] ${device_serial}: 좋아요 시도`);
                await executeAdbCommand(device_serial, 'shell input tap 100 600');
            }
        }

        // 8. 완료 처리
        await supabase
            .from('job_assignments')
            .update({ 
                status: 'completed',
                progress_pct: 100,
                final_duration_sec: watchDuration,
                completed_at: new Date().toISOString()
            })
            .eq('id', id);

        console.log(`[Execute] 작업 완료: ${id}`);

    } catch (err) {
        throw err;
    } finally {
        // 9. 기기 상태를 idle로 복구
        await supabase
            .from('devices')
            .update({ status: 'idle' })
            .eq('id', device_id);
    }
}

// =============================================
// 7. 메인 실행 루프
// =============================================

// 장치 동기화 (5초마다)
setInterval(syncDevices, config.scan_interval_ms || 5000);
syncDevices();

// 작업 폴링 (3초마다)
setInterval(pollForJobs, 3000);
pollForJobs();

console.log('[System] Worker started. Polling for jobs...');
