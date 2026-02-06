/**
 * result-collector.js - Host-side Result Collection Module
 *
 * ADB pull 실행 전 파일 존재 확인 및 동기화 로직
 *
 * Features:
 * 1. ADB shell을 통한 원격 파일 존재 확인
 * 2. .ready 신호 파일 확인 (Android 측 쓰기 완료 신호)
 * 3. 파일 크기 검증 후 pull 실행
 * 4. 재시도 로직 포함
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execFileAsync = promisify(execFile);

// =============================================
// 설정 상수
// =============================================
const CONFIG = {
    FILE_CHECK_TIMEOUT_MS: 30000,    // 파일 확인 최대 대기 시간
    FILE_CHECK_INTERVAL_MS: 500,     // 파일 확인 간격
    MIN_FILE_SIZE_BYTES: 1000,       // 최소 파일 크기 (1KB)
    MAX_RETRY_COUNT: 3,              // 최대 재시도 횟수
    RETRY_DELAY_MS: 1000,            // 재시도 간격

    // 기본 경로
    REMOTE_EVIDENCE_PATH: '/sdcard/Scripts/doai-bot/evidence',
    LOCAL_EVIDENCE_PATH: './evidence'
};

// =============================================
// ADB 명령 실행
// =============================================

/**
 * ADB 명령 실행
 * @param {string} adbPath - ADB 실행 파일 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} command - 실행할 명령
 * @returns {Promise<string>} - 명령 출력
 */
async function executeAdbCommand(adbPath, deviceSerial, command) {
    try {
        const args = ['-s', deviceSerial, ...command.split(' ')];
        const { stdout } = await execFileAsync(adbPath, args, {
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024
        });
        return stdout;
    } catch (error) {
        console.error(`[ResultCollector] ADB error: ${error.message}`);
        throw error;
    }
}

/**
 * ADB shell 명령 실행
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} shellCommand - shell 명령
 * @returns {Promise<string>} - 명령 출력
 */
async function executeAdbShell(adbPath, deviceSerial, shellCommand) {
    return executeAdbCommand(adbPath, deviceSerial, `shell ${shellCommand}`);
}

// =============================================
// 파일 존재/크기 확인
// =============================================

/**
 * 원격 파일 존재 확인
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} remotePath - 원격 파일 경로
 * @returns {Promise<boolean>} - 파일 존재 여부
 */
async function checkRemoteFileExists(adbPath, deviceSerial, remotePath) {
    try {
        const result = await executeAdbShell(
            adbPath,
            deviceSerial,
            `"[ -f '${remotePath}' ] && echo EXISTS || echo NOTFOUND"`
        );
        return result.trim() === 'EXISTS';
    } catch (error) {
        console.error(`[ResultCollector] File check error: ${error.message}`);
        return false;
    }
}

/**
 * 원격 파일 크기 확인
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} remotePath - 원격 파일 경로
 * @returns {Promise<number>} - 파일 크기 (바이트), 실패 시 -1
 */
async function getRemoteFileSize(adbPath, deviceSerial, remotePath) {
    try {
        const result = await executeAdbShell(
            adbPath,
            deviceSerial,
            `stat -c %s '${remotePath}' 2>/dev/null || echo -1`
        );
        const size = parseInt(result.trim(), 10);
        return isNaN(size) ? -1 : size;
    } catch (error) {
        console.error(`[ResultCollector] Size check error: ${error.message}`);
        return -1;
    }
}

// =============================================
// .ready 신호 파일 확인
// =============================================

/**
 * .ready 신호 파일 확인 및 파싱
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} remotePath - 스크린샷 파일 경로
 * @returns {Promise<object>} - 준비 상태 정보
 */
async function checkReadySignal(adbPath, deviceSerial, remotePath) {
    const signalPath = remotePath + '.ready';

    try {
        // 신호 파일 존재 확인
        const exists = await checkRemoteFileExists(adbPath, deviceSerial, signalPath);
        if (!exists) {
            return { status: 'not_found' };
        }

        // 신호 파일 내용 읽기
        const content = await executeAdbShell(
            adbPath,
            deviceSerial,
            `cat '${signalPath}'`
        );

        if (!content || content.trim().length === 0) {
            return { status: 'empty' };
        }

        // JSON 파싱
        try {
            const signal = JSON.parse(content);
            return signal;
        } catch (parseError) {
            return { status: 'parse_error', error: parseError.message };
        }
    } catch (error) {
        return { status: 'error', error: error.message };
    }
}

// =============================================
// 파일 준비 완료 대기 (핵심 로직)
// =============================================

/**
 * 파일 준비 완료까지 대기 (폴링)
 * - .ready 신호 파일 확인 (우선)
 * - 직접 파일 존재/크기 확인 (폴백)
 *
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} remotePath - 원격 파일 경로
 * @param {number} timeoutMs - 타임아웃 (밀리초)
 * @returns {Promise<object>} - { success, fileSize, duration, method, error }
 */
async function waitForFileReady(adbPath, deviceSerial, remotePath, timeoutMs = CONFIG.FILE_CHECK_TIMEOUT_MS) {
    const startTime = Date.now();

    console.log(`[ResultCollector] Waiting for file: ${remotePath}`);

    while (Date.now() - startTime < timeoutMs) {
        // 1. .ready 신호 파일 확인 (우선)
        const signal = await checkReadySignal(adbPath, deviceSerial, remotePath);

        if (signal.status === 'ready') {
            const duration = Date.now() - startTime;
            console.log(`[ResultCollector] File ready (signal): ${signal.file_size} bytes`);
            return {
                success: true,
                fileSize: signal.file_size,
                duration: duration,
                method: 'signal_file'
            };
        }

        if (signal.status === 'failed') {
            console.log(`[ResultCollector] File failed (signal): ${signal.error}`);
            return {
                success: false,
                error: signal.error || 'Remote capture failed',
                duration: Date.now() - startTime,
                method: 'signal_file'
            };
        }

        // 2. 직접 파일 확인 (신호 파일 없는 경우)
        const exists = await checkRemoteFileExists(adbPath, deviceSerial, remotePath);

        if (exists) {
            const size = await getRemoteFileSize(adbPath, deviceSerial, remotePath);

            if (size >= CONFIG.MIN_FILE_SIZE_BYTES) {
                // 크기 안정화 확인 (1초 후 재확인)
                await sleep(1000);
                const size2 = await getRemoteFileSize(adbPath, deviceSerial, remotePath);

                if (size2 === size) {
                    const duration = Date.now() - startTime;
                    console.log(`[ResultCollector] File ready (direct): ${size} bytes`);
                    return {
                        success: true,
                        fileSize: size,
                        duration: duration,
                        method: 'direct_check'
                    };
                }
            }
        }

        await sleep(CONFIG.FILE_CHECK_INTERVAL_MS);
    }

    // 타임아웃
    console.log(`[ResultCollector] File timeout: ${remotePath}`);
    return {
        success: false,
        error: 'Timeout waiting for file',
        duration: Date.now() - startTime
    };
}

// =============================================
// 안전한 ADB Pull
// =============================================

/**
 * 안전한 ADB Pull (파일 준비 확인 후 실행)
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} remotePath - 원격 파일 경로
 * @param {string} localPath - 로컬 저장 경로 (null이면 자동 생성)
 * @returns {Promise<object>} - Pull 결과
 */
async function safePull(adbPath, deviceSerial, remotePath, localPath = null) {
    const result = {
        deviceSerial,
        remotePath,
        startTime: new Date().toISOString()
    };

    try {
        // 1. 파일 준비 완료 대기
        console.log(`[ResultCollector] SafePull: Checking file ready...`);
        const readyResult = await waitForFileReady(adbPath, deviceSerial, remotePath);

        if (!readyResult.success) {
            result.success = false;
            result.error = readyResult.error;
            return result;
        }

        // 2. 로컬 경로 결정
        if (!localPath) {
            const fileName = path.basename(remotePath);
            const subDir = path.join(CONFIG.LOCAL_EVIDENCE_PATH, deviceSerial);

            await fs.mkdir(subDir, { recursive: true });
            localPath = path.join(subDir, fileName);
        }

        result.localPath = localPath;

        // 3. ADB Pull 실행 (재시도 로직)
        for (let retry = 0; retry < CONFIG.MAX_RETRY_COUNT; retry++) {
            try {
                console.log(`[ResultCollector] Pulling file (attempt ${retry + 1})...`);

                await executeAdbCommand(
                    adbPath,
                    deviceSerial,
                    `pull "${remotePath}" "${localPath}"`
                );

                // Pull 성공 확인
                try {
                    const stats = await fs.stat(localPath);

                    if (stats.size >= CONFIG.MIN_FILE_SIZE_BYTES) {
                        result.success = true;
                        result.fileSize = stats.size;
                        result.endTime = new Date().toISOString();

                        console.log(`[ResultCollector] Pull SUCCESS: ${localPath} (${stats.size} bytes)`);
                        return result;
                    }
                } catch (statError) {
                    // 파일 없음
                }

                console.log(`[ResultCollector] Pull incomplete, retrying...`);
                await sleep(CONFIG.RETRY_DELAY_MS);
            } catch (pullError) {
                console.log(`[ResultCollector] Pull attempt ${retry + 1} failed: ${pullError.message}`);
                await sleep(CONFIG.RETRY_DELAY_MS);
            }
        }

        result.success = false;
        result.error = 'Max retries exceeded';
    } catch (error) {
        result.success = false;
        result.error = error.message;
        console.error(`[ResultCollector] SafePull error: ${error.message}`);
    }

    result.endTime = new Date().toISOString();
    return result;
}

/**
 * 여러 파일 일괄 Pull
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string[]} remotePaths - 원격 파일 경로 목록
 * @returns {Promise<object>} - Batch Pull 결과
 */
async function batchPull(adbPath, deviceSerial, remotePaths) {
    const batchResult = {
        deviceSerial,
        startTime: new Date().toISOString(),
        results: []
    };

    for (const remotePath of remotePaths) {
        const result = await safePull(adbPath, deviceSerial, remotePath);
        batchResult.results.push(result);
    }

    batchResult.endTime = new Date().toISOString();
    batchResult.successCount = batchResult.results.filter(r => r.success).length;
    batchResult.failCount = remotePaths.length - batchResult.successCount;

    console.log(`[ResultCollector] Batch complete: ${batchResult.successCount}/${remotePaths.length} succeeded`);

    return batchResult;
}

// =============================================
// Job 결과 수집 (통합)
// =============================================

/**
 * Job 결과 JSON 파일 Pull 및 파싱
 * @param {string} adbPath - ADB 경로
 * @param {string} deviceSerial - 기기 시리얼
 * @param {string} jobId - 작업 ID
 * @returns {Promise<object>} - Job 결과
 */
async function collectJobResult(adbPath, deviceSerial, jobId) {
    const remotePath = `${CONFIG.REMOTE_EVIDENCE_PATH}/${jobId}_result.json`;

    try {
        // 1. 결과 JSON Pull
        const pullResult = await safePull(adbPath, deviceSerial, remotePath);

        if (!pullResult.success) {
            return {
                jobId,
                success: false,
                error: pullResult.error
            };
        }

        // 2. JSON 파싱
        const content = await fs.readFile(pullResult.localPath, 'utf-8');
        const jobResult = JSON.parse(content);

        jobResult.localResultPath = pullResult.localPath;

        // 3. 증거 파일 Pull
        if (jobResult.evidence_files && jobResult.evidence_files.length > 0) {
            console.log(`[ResultCollector] Collecting ${jobResult.evidence_files.length} evidence files...`);
            const evidenceBatch = await batchPull(adbPath, deviceSerial, jobResult.evidence_files);
            jobResult.evidencePullResults = evidenceBatch.results;
        }

        return jobResult;
    } catch (error) {
        return {
            jobId,
            success: false,
            error: error.message
        };
    }
}

// =============================================
// 유틸리티
// =============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================
// 모듈 Export
// =============================================
module.exports = {
    // 파일 확인
    checkRemoteFileExists,
    getRemoteFileSize,
    checkReadySignal,

    // 파일 대기 (핵심)
    waitForFileReady,

    // ADB Pull
    safePull,
    batchPull,

    // Job 결과 수집
    collectJobResult,

    // ADB 명령
    executeAdbCommand,
    executeAdbShell,

    // 설정
    CONFIG
};
