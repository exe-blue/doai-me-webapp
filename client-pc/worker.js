/**
 * [Agent-Node] Worker Client v2.0
 * 역할: ADB 장치 감시, Supabase 등록, 작업 폴링 및 자동 실행
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// v5.1: 결과 수집 모듈 (파일 존재 확인 후 Pull)
const resultCollector = require('../backend/result-collector.js');

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

/**
 * 연결된 ADB 기기 목록 조회
 * @returns {Promise<{devices: string[], error: Error|null}>} - 기기 목록 및 에러
 */
function getConnectedDevices() {
    return new Promise((resolve) => {
        exec(`"${ADB_PATH}" devices`, (error, stdout) => {
            if (error) {
                console.error(`[ADB Error] ${error.message}`);
                // 에러와 빈 배열 함께 반환 - 호출자가 구분 가능
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
    const { devices: serials, error: adbError } = await getConnectedDevices();

    if (adbError) {
        console.error(`[Watchdog] ADB 조회 실패: ${adbError.message}`);
        return [];
    }

    if (serials.length === 0) {
        console.log(`[Watchdog] 연결된 기기 없음. 대기중...`);
        return [];
    }

    for (const serial of serials) {
        const groupId = config.groups.mappings[serial] || DEFAULT_GROUP;

        // Upsert 기기 정보 (serial_number 기준으로 upsert, id는 자동 생성)
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
            // 캐시 업데이트: serial_number -> UUID id 매핑
            deviceIdCache.set(serial, data.id);
            console.log(`[Sync] ${serial} -> ${data.id}`);
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
        // 연결된 기기의 UUID device_id 목록 가져오기
        const { devices: connectedSerials, error: adbError } = await getConnectedDevices();
        
        if (adbError) {
            console.error(`[Poll] ADB 조회 실패: ${adbError.message}`);
            return; // ADB 에러 시 이번 폴링 건너뛰기
        }
        
        const connectedDeviceIds = [];

        for (const serial of connectedSerials) {
            let deviceId = deviceIdCache.get(serial);

            if (!deviceId) {
                // 캐시에 없으면 DB에서 조회 (serial_number로 검색 -> id 획득)
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

        // pending 상태의 assignments 조회 (device_id는 이제 UUID FK)
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

        // serial_number 정보 추가하여 큐에 추가
        for (const assignment of assignments) {
            const deviceInfo = connectedDeviceIds.find(d => d.id === assignment.device_id);
            if (deviceInfo && !jobQueue.find(j => j.id === assignment.id)) {
                jobQueue.push({
                    ...assignment,
                    device_serial: deviceInfo.serial
                });
                console.log(`[Queue] 작업 추가: ${assignment.id} (device_id: ${assignment.device_id}, serial: ${deviceInfo.serial})`);
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
        // Job 정보 없음 에러를 DB에 기록
        await supabase
            .from('job_assignments')
            .update({
                status: 'failed',
                error_log: 'Job 정보를 찾을 수 없음'
            })
            .eq('id', id);
        return;
    }

    // 검색어 결정: keyword가 있으면 사용, 없으면 title로 fallback
    const searchKeyword = job.keyword || job.title;
    const scriptType = job.script_type || 'youtube_watch';

    console.log(`[Execute] 작업 시작: ${id}`);
    console.log(`[Execute] 기기: ${device_serial} (device_id: ${device_id})`);
    console.log(`[Execute] 스크립트: ${scriptType}, 검색어: "${searchKeyword}", 제목: "${job.title}"`);

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

        // 2. 기기 상태를 busy로 업데이트 (device_id는 UUID FK)
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

        // 4. 시청 시간: DB에서 가져온 duration_sec 사용 (기본값 60초)
        const watchDuration = job.duration_sec || 60;

        // 5. 스크립트 타입에 따른 실행 분기
        if (scriptType === 'youtube_search') {
            // ===== 검색 유입 모드 =====
            console.log(`[Execute] 검색 유입 모드 - 키워드: "${searchKeyword}"`);

            // Mobile Agent용 job.json 생성 (데이터 매핑 규칙 준수)
            // DB -> Worker -> Mobile Agent 매핑:
            // jobs.keyword -> keyword -> keyword
            // jobs.title -> video_title -> video_title
            // jobs.duration_sec -> duration_sec -> duration_sec
            // job_assignments.id -> assignment_id -> assignment_id
            const jobConfig = {
                assignment_id: id,
                keyword: searchKeyword,         // jobs.keyword (fallback: jobs.title)
                video_title: job.title,         // jobs.title
                duration_sec: watchDuration,    // jobs.duration_sec
                prob_like: job.prob_like || 0,
                prob_comment: job.prob_comment || 0,
                prob_playlist: job.prob_playlist || 0
            };

            // job.json을 기기에 푸시 (job-loader.js와 동일한 경로 사용)
            const jobJsonPath = `/sdcard/Scripts/doai-bot/job.json`;
            const tempJobFile = path.join(__dirname, `temp_job_${device_serial}.json`);

            // 로컬에 임시 파일 생성
            fs.writeFileSync(tempJobFile, JSON.stringify(jobConfig, null, 2));

            // ADB로 기기에 푸시 (디렉토리 생성 포함)
            await executeAdbCommand(device_serial, `shell mkdir -p /sdcard/Scripts/doai-bot`);
            await executeAdbCommand(device_serial, `push "${tempJobFile}" ${jobJsonPath}`);

            // 임시 파일 삭제
            fs.unlinkSync(tempJobFile);

            console.log(`[Execute] job.json 푸시 완료: ${jobJsonPath}`);
            console.log(`[Execute] job.json 내용:`, JSON.stringify(jobConfig));

            // AutoX.js WebView Bot 실행 (am start via RunIntentActivity)
            await executeAdbCommand(
                device_serial,
                `shell am start -n org.autojs.autoxjs.v6/org.autojs.autojs.external.open.RunIntentActivity -d "file:///sdcard/Scripts/doai-bot/webview_bot.js" -t "text/javascript"`
            );

        } else {
            // ===== 직접 URL 모드 (기존 방식) =====
            console.log(`[Execute] 직접 URL 모드 - ${job.target_url}`);

            // URL 검증 및 sanitize
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
        }

        console.log(`[Execute] 시청 시간: ${watchDuration}초`);

        // 6. 시청 시뮬레이션 (10초마다 진행률 업데이트)
        let elapsed = 0;
        while (elapsed < watchDuration) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            elapsed += 10;

            const progressPct = Math.min(100, Math.round((elapsed / watchDuration) * 100));
            
            // 진행률 업데이트 에러 핸들링 추가
            const { error: progressError } = await supabase
                .from('job_assignments')
                .update({ progress_pct: progressPct })
                .eq('id', id);
            
            if (progressError) {
                console.error(`[Execute] ${device_serial}: 진행률 업데이트 실패 (${progressPct}%) - ${progressError.message}`);
            }

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

        // 8. 증거 파일 수집 (v5.1: 파일 준비 확인 후 Pull)
        console.log(`[Execute] ${device_serial}: 증거 파일 수집 중...`);

        try {
            // 결과 JSON 및 스크린샷 수집
            const jobResult = await resultCollector.collectJobResult(
                ADB_PATH,
                device_serial,
                id  // job_id로 assignment_id 사용
            );

            if (jobResult.success !== false) {
                console.log(`[Execute] 증거 파일 수집 완료: ${jobResult.evidence_count || 0}개`);

                // 수집된 파일 정보 업데이트
                const evidenceCount = jobResult.evidencePullResults ?
                    jobResult.evidencePullResults.filter(r => r.success).length : 0;

                // 증거 수집 DB 업데이트 에러 핸들링 추가
                const { error: evidenceUpdateError } = await supabase
                    .from('job_assignments')
                    .update({
                        evidence_collected: true,
                        evidence_count: evidenceCount,
                        evidence_local_path: jobResult.localResultPath
                    })
                    .eq('id', id);
                
                if (evidenceUpdateError) {
                    console.error(`[Execute] ${device_serial}: 증거 정보 DB 업데이트 실패 - ${evidenceUpdateError.message}`);
                }
            } else {
                console.warn(`[Execute] 증거 파일 수집 실패: ${jobResult.error}`);
            }
        } catch (collectErr) {
            console.error(`[Execute] 증거 수집 오류: ${collectErr.message}`);
            // 증거 수집 실패해도 작업은 완료로 처리
        }

        // 9. 완료 처리 (에러 핸들링 추가)
        const { error: completionError } = await supabase
            .from('job_assignments')
            .update({
                status: 'completed',
                progress_pct: 100,
                final_duration_sec: watchDuration,
                completed_at: new Date().toISOString()
            })
            .eq('id', id);

        if (completionError) {
            console.error(`[Execute] ${device_serial}: 작업 완료 DB 업데이트 실패 - ${completionError.message}`);
            // 작업 완료 기록 실패는 심각하므로 재시도 로직 추가 가능
        } else {
            console.log(`[Execute] 작업 완료: ${id}`);
        }

    } catch (err) {
        throw err;
    } finally {
        // 10. 기기 상태를 idle로 복구 (에러 핸들링 추가)
        const { error: deviceResetError } = await supabase
            .from('devices')
            .update({ status: 'idle' })
            .eq('id', device_id);
        
        if (deviceResetError) {
            console.error(`[Execute] 기기 상태 리셋 실패 (device_id: ${device_id}) - ${deviceResetError.message}`);
            // 심각: 기기가 busy 상태로 고정될 수 있음. 재시도 필요.
        }
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
