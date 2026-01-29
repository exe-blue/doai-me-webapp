/**
 * Evidence Manager Module for AutoX.js
 * Issue 3: 증거 파일(스크린샷/로그) 고유 경로 생성
 * Issue 4: 스크린샷 Race Condition 해결
 *
 * 파일명 패턴: {JobID}_{Timestamp}_{ActionType}.{ext}
 */

// =============================================
// 설정 상수
// =============================================
var EVIDENCE_BASE_PATH = "/sdcard/Scripts/doai-bot/evidence";
var SCREENSHOT_SUBDIR = "screenshots";
var LOG_SUBDIR = "logs";

var FILE_WRITE_TIMEOUT_MS = 5000;
var FILE_WRITE_CHECK_INTERVAL_MS = 100;
var MIN_SCREENSHOT_SIZE_BYTES = 1000; // 최소 1KB

// =============================================
// 유틸리티 함수
// =============================================

/**
 * 타임스탬프 문자열 생성 (밀리초 포함)
 * @returns {string} - "20260129_131234_567" 형식
 */
function getTimestamp() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    var h = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    var ms = String(now.getMilliseconds()).padStart(3, '0');

    return y + m + d + "_" + h + min + s + "_" + ms;
}

/**
 * 안전한 파일명 생성 (특수문자 제거)
 * @param {string} str - 원본 문자열
 * @returns {string} - 안전한 파일명
 */
function sanitizeFilename(str) {
    if (!str) return "unknown";
    return String(str)
        .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
        .substring(0, 50);
}

/**
 * 디렉토리 생성 (재귀)
 * @param {string} dirPath - 생성할 디렉토리 경로
 */
function ensureDirectory(dirPath) {
    if (!files.exists(dirPath)) {
        files.createWithDirs(dirPath + "/.placeholder");
        files.remove(dirPath + "/.placeholder");
        console.log("[Evidence] Created directory: " + dirPath);
    }
}

// =============================================
// 고유 파일 경로 생성
// =============================================

/**
 * 고유 파일 경로 생성
 * @param {string} jobId - 작업 ID
 * @param {string} actionType - 액션 타입 (예: "search", "click", "watch")
 * @param {string} extension - 파일 확장자 (예: "png", "log")
 * @param {string} subdir - 서브디렉토리 (예: "screenshots", "logs")
 * @returns {string} - 전체 파일 경로
 */
function generateFilePath(jobId, actionType, extension, subdir) {
    var safeJobId = sanitizeFilename(jobId);
    var safeAction = sanitizeFilename(actionType);
    var timestamp = getTimestamp();

    var filename = safeJobId + "_" + timestamp + "_" + safeAction + "." + extension;
    var dirPath = EVIDENCE_BASE_PATH + "/" + (subdir || "");

    ensureDirectory(dirPath);

    return dirPath + "/" + filename;
}

/**
 * 스크린샷 파일 경로 생성
 * @param {string} jobId - 작업 ID
 * @param {string} actionType - 액션 타입
 * @returns {string} - 스크린샷 파일 경로
 */
function generateScreenshotPath(jobId, actionType) {
    return generateFilePath(jobId, actionType, "png", SCREENSHOT_SUBDIR);
}

/**
 * 로그 파일 경로 생성
 * @param {string} jobId - 작업 ID
 * @param {string} actionType - 액션 타입
 * @returns {string} - 로그 파일 경로
 */
function generateLogPath(jobId, actionType) {
    return generateFilePath(jobId, actionType, "log", LOG_SUBDIR);
}

// =============================================
// 스크린샷 캡처 (Race Condition 해결)
// =============================================

/**
 * 파일 쓰기 완료 대기 (폴링)
 * @param {string} filePath - 확인할 파일 경로
 * @param {number} minSize - 최소 파일 크기 (bytes)
 * @param {number} timeoutMs - 타임아웃 (밀리초)
 * @returns {boolean} - 파일 쓰기 완료 여부
 */
function waitForFileWrite(filePath, minSize, timeoutMs) {
    minSize = minSize || MIN_SCREENSHOT_SIZE_BYTES;
    timeoutMs = timeoutMs || FILE_WRITE_TIMEOUT_MS;

    var startTime = Date.now();
    var lastSize = 0;
    var stableCount = 0;

    while (Date.now() - startTime < timeoutMs) {
        if (!files.exists(filePath)) {
            sleep(FILE_WRITE_CHECK_INTERVAL_MS);
            continue;
        }

        try {
            var file = new java.io.File(filePath);
            var currentSize = file.length();

            if (currentSize >= minSize) {
                // 파일 크기가 안정화되었는지 확인 (2회 연속 동일)
                if (currentSize === lastSize) {
                    stableCount++;
                    if (stableCount >= 2) {
                        console.log("[Evidence] File write complete: " + filePath + " (" + currentSize + " bytes)");
                        return true;
                    }
                } else {
                    stableCount = 0;
                }
                lastSize = currentSize;
            }
        } catch (e) {
            console.warn("[Evidence] Error checking file: " + e.message);
        }

        sleep(FILE_WRITE_CHECK_INTERVAL_MS);
    }

    console.error("[Evidence] File write timeout: " + filePath);
    return false;
}

/**
 * UI 안정화 대기 (화면 변화 멈출 때까지)
 * @param {number} stableTimeMs - 안정화 판정 시간 (밀리초)
 * @param {number} timeoutMs - 최대 대기 시간 (밀리초)
 */
function waitForUiStable(stableTimeMs, timeoutMs) {
    stableTimeMs = stableTimeMs || 500;
    timeoutMs = timeoutMs || 3000;

    var startTime = Date.now();

    try {
        // AutoX.js의 waitForActivity 또는 sleep으로 대기
        // 실제 UI 변화 감지는 AutoX.js의 기능에 따라 다름
        while (Date.now() - startTime < timeoutMs) {
            // idle 상태 체크 (가능한 경우)
            if (typeof device !== 'undefined' && device.isScreenOn && device.isScreenOn()) {
                sleep(stableTimeMs);
                console.log("[Evidence] UI stabilized");
                return;
            }
            sleep(200);
        }
    } catch (e) {
        console.warn("[Evidence] UI stable wait error: " + e.message);
    }

    // 타임아웃 시에도 안정화 시간만큼 대기
    sleep(stableTimeMs);
}

/**
 * 안전한 스크린샷 캡처
 * UI 안정화 대기 + 파일 쓰기 완료 확인
 *
 * @param {string} jobId - 작업 ID
 * @param {string} actionType - 액션 타입
 * @returns {object} - { success: boolean, path: string, error?: string }
 */
function captureScreenshot(jobId, actionType) {
    var filePath = generateScreenshotPath(jobId, actionType);

    try {
        // 1. UI 안정화 대기
        console.log("[Evidence] Waiting for UI to stabilize...");
        waitForUiStable(300, 2000);

        // 2. 스크린샷 캡처
        console.log("[Evidence] Capturing screenshot: " + filePath);

        // AutoX.js 스크린샷 API 호출
        var captureResult = false;
        if (typeof captureScreen === 'function') {
            captureResult = captureScreen(filePath);
        } else if (typeof images !== 'undefined' && images.captureScreen) {
            var img = images.captureScreen();
            if (img) {
                images.save(img, filePath);
                img.recycle();
                captureResult = true;
            }
        }

        if (!captureResult) {
            return {
                success: false,
                path: filePath,
                error: "Screenshot capture returned false"
            };
        }

        // 3. 파일 쓰기 완료 대기 (Race Condition 방지)
        var writeComplete = waitForFileWrite(filePath, MIN_SCREENSHOT_SIZE_BYTES, FILE_WRITE_TIMEOUT_MS);

        if (!writeComplete) {
            return {
                success: false,
                path: filePath,
                error: "File write timeout or incomplete"
            };
        }

        return {
            success: true,
            path: filePath
        };

    } catch (e) {
        console.error("[Evidence] Screenshot error: " + e.message);
        return {
            success: false,
            path: filePath,
            error: e.message
        };
    }
}

// =============================================
// 결과 JSON 생성
// =============================================

/**
 * 결과 JSON 파일 생성 (Host가 Pull할 파일 목록 포함)
 * @param {string} jobId - 작업 ID
 * @param {object} result - 작업 결과 데이터
 * @param {string[]} evidenceFiles - 증거 파일 경로 목록
 * @returns {string} - 결과 JSON 파일 경로
 */
function writeResultJson(jobId, result, evidenceFiles) {
    var resultPath = EVIDENCE_BASE_PATH + "/" + sanitizeFilename(jobId) + "_result.json";

    var resultData = {
        job_id: jobId,
        timestamp: new Date().toISOString(),
        result: result || {},
        evidence_files: evidenceFiles || [],
        evidence_count: (evidenceFiles || []).length
    };

    try {
        ensureDirectory(EVIDENCE_BASE_PATH);
        files.write(resultPath, JSON.stringify(resultData, null, 2));
        console.log("[Evidence] Result JSON written: " + resultPath);
        return resultPath;
    } catch (e) {
        console.error("[Evidence] Failed to write result JSON: " + e.message);
        return null;
    }
}

// =============================================
// 모듈 Export
// =============================================
module.exports = {
    // 경로 생성
    generateFilePath: generateFilePath,
    generateScreenshotPath: generateScreenshotPath,
    generateLogPath: generateLogPath,

    // 스크린샷 캡처
    captureScreenshot: captureScreenshot,
    waitForFileWrite: waitForFileWrite,
    waitForUiStable: waitForUiStable,

    // 결과 관리
    writeResultJson: writeResultJson,

    // 유틸리티
    getTimestamp: getTimestamp,
    sanitizeFilename: sanitizeFilename,
    ensureDirectory: ensureDirectory,

    // 상수
    EVIDENCE_BASE_PATH: EVIDENCE_BASE_PATH
};
