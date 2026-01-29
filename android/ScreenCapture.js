/**
 * ScreenCapture.js - Android Screenshot Module
 *
 * UI 렌더링 완료 및 파일 쓰기 완료를 보장하는 동기화 로직
 *
 * Features:
 * 1. UI 안정화 대기 (waitForIdle)
 * 2. 스크린샷 캡처 후 파일 존재 확인
 * 3. 파일 크기 폴링 (0보다 클 때까지 대기)
 * 4. 파일 쓰기 완료 확인 (크기 안정화)
 */

// =============================================
// 설정 상수
// =============================================
var SCREENSHOT_CONFIG = {
    // 파일 쓰기 대기 설정
    FILE_WRITE_TIMEOUT_MS: 10000,      // 파일 쓰기 최대 대기 시간
    FILE_CHECK_INTERVAL_MS: 100,       // 파일 체크 간격
    MIN_FILE_SIZE_BYTES: 1000,         // 최소 파일 크기 (1KB)
    SIZE_STABLE_COUNT: 3,              // 크기 안정화 필요 횟수

    // [RACE CONDITION FIX] images.save() 직후 즉시 폴링 설정
    IMMEDIATE_POLL_TIMEOUT_MS: 3000,   // images.save() 직후 즉시 폴링 최대 대기 (3초)
    IMMEDIATE_POLL_INTERVAL_MS: 50,    // 즉시 폴링 체크 간격 (50ms - 더 촘촘하게)

    // UI 안정화 설정
    UI_STABLE_TIMEOUT_MS: 5000,        // UI 안정화 최대 대기
    UI_STABLE_DURATION_MS: 500,        // 변화 없음 판정 시간
    UI_CHECK_INTERVAL_MS: 100,         // UI 체크 간격

    // 스크린샷 저장 경로
    BASE_PATH: "/sdcard/Scripts/doai-bot/evidence/screenshots"
};

// =============================================
// UI 안정화 (waitForIdle)
// =============================================

/**
 * UI 안정화 대기 - 화면 변화가 멈출 때까지 대기
 * AccessibilityService 기반 idle 감지 또는 타임아웃 기반 대기
 *
 * @param {number} stableDurationMs - 안정화 판정 시간 (기본 500ms)
 * @param {number} timeoutMs - 최대 대기 시간 (기본 5000ms)
 * @returns {boolean} - 안정화 성공 여부
 */
function waitForUiIdle(stableDurationMs, timeoutMs) {
    stableDurationMs = stableDurationMs || SCREENSHOT_CONFIG.UI_STABLE_DURATION_MS;
    timeoutMs = timeoutMs || SCREENSHOT_CONFIG.UI_STABLE_TIMEOUT_MS;

    var startTime = Date.now();
    var lastChangeTime = Date.now();

    console.log("[ScreenCapture] Waiting for UI idle...");

    try {
        // 방법 1: AccessibilityService의 windowContentChanged 이벤트 모니터링
        if (typeof auto !== 'undefined' && auto.waitFor) {
            // AutoX.js의 auto.waitFor 사용
            auto.waitFor(function() {
                return Date.now() - lastChangeTime >= stableDurationMs;
            }, timeoutMs);
            console.log("[ScreenCapture] UI idle detected (auto.waitFor)");
            return true;
        }

        // 방법 2: device.isScreenOn() + sleep 기반 폴링
        while (Date.now() - startTime < timeoutMs) {
            // 화면이 켜져 있는지 확인
            if (typeof device !== 'undefined' && device.isScreenOn && device.isScreenOn()) {
                // Activity 전환 대기
                if (typeof currentActivity !== 'undefined') {
                    var prevActivity = currentActivity();
                    sleep(SCREENSHOT_CONFIG.UI_CHECK_INTERVAL_MS);
                    var currActivity = currentActivity();

                    if (prevActivity === currActivity) {
                        // Activity 변화 없음 - 안정화 시간 체크
                        if (Date.now() - lastChangeTime >= stableDurationMs) {
                            console.log("[ScreenCapture] UI idle detected (activity stable)");
                            return true;
                        }
                    } else {
                        // Activity 변경됨 - 타이머 리셋
                        lastChangeTime = Date.now();
                    }
                } else {
                    // currentActivity 사용 불가 - 단순 대기
                    sleep(stableDurationMs);
                    console.log("[ScreenCapture] UI idle assumed (sleep fallback)");
                    return true;
                }
            }
            sleep(SCREENSHOT_CONFIG.UI_CHECK_INTERVAL_MS);
        }

        // 타임아웃 - 기본 안정화 시간만큼 대기
        console.warn("[ScreenCapture] UI idle timeout, using fallback sleep");
        sleep(stableDurationMs);
        return false;

    } catch (e) {
        console.error("[ScreenCapture] waitForUiIdle error: " + e.message);
        sleep(stableDurationMs);
        return false;
    }
}

/**
 * 특정 Activity가 로드될 때까지 대기
 *
 * @param {string} activityName - 대기할 Activity 이름 (부분 매칭)
 * @param {number} timeoutMs - 최대 대기 시간
 * @returns {boolean} - Activity 로드 성공 여부
 */
function waitForActivity(activityName, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var startTime = Date.now();

    console.log("[ScreenCapture] Waiting for activity: " + activityName);

    try {
        while (Date.now() - startTime < timeoutMs) {
            if (typeof currentActivity !== 'undefined') {
                var current = currentActivity();
                if (current && current.indexOf(activityName) !== -1) {
                    console.log("[ScreenCapture] Activity loaded: " + current);
                    // Activity 로드 후 추가 안정화 대기
                    sleep(300);
                    return true;
                }
            }
            sleep(200);
        }

        console.warn("[ScreenCapture] Activity timeout: " + activityName);
        return false;

    } catch (e) {
        console.error("[ScreenCapture] waitForActivity error: " + e.message);
        return false;
    }
}

// =============================================
// 파일 쓰기 완료 폴링
// =============================================

/**
 * [RACE CONDITION FIX] images.save() 직후 즉시 폴링
 * 파일이 존재하고 크기가 0보다 클 때까지 최대 3초 대기
 *
 * @param {string} filePath - 확인할 파일 경로
 * @param {number} timeoutMs - 최대 대기 시간 (기본 3000ms)
 * @returns {object} - { exists: boolean, size: number, duration: number }
 */
function waitForFileExistsAndNonZero(filePath, timeoutMs) {
    timeoutMs = timeoutMs || SCREENSHOT_CONFIG.IMMEDIATE_POLL_TIMEOUT_MS;
    var intervalMs = SCREENSHOT_CONFIG.IMMEDIATE_POLL_INTERVAL_MS;
    var startTime = Date.now();

    console.log("[ScreenCapture] [RACE FIX] Immediate polling for file: " + filePath);

    while (Date.now() - startTime < timeoutMs) {
        // 1. 파일 존재 확인
        if (files.exists(filePath)) {
            try {
                var file = new java.io.File(filePath);
                var currentSize = file.length();

                // 2. 파일 크기가 0보다 큰지 확인
                if (currentSize > 0) {
                    var duration = Date.now() - startTime;
                    console.log("[ScreenCapture] [RACE FIX] File exists and non-zero: " + currentSize + " bytes (" + duration + "ms)");
                    return {
                        exists: true,
                        size: currentSize,
                        duration: duration
                    };
                }
            } catch (e) {
                // 파일 접근 오류 - 계속 폴링
            }
        }

        sleep(intervalMs);
    }

    // 타임아웃
    var elapsed = Date.now() - startTime;
    console.warn("[ScreenCapture] [RACE FIX] Immediate poll timeout after " + elapsed + "ms");

    return {
        exists: files.exists(filePath),
        size: 0,
        duration: elapsed
    };
}

/**
 * 파일 존재 및 크기 확인 (폴링)
 * - 파일이 존재할 때까지 대기
 * - 파일 크기가 최소 크기 이상일 때까지 대기
 * - 파일 크기가 안정화될 때까지 대기 (쓰기 완료)
 *
 * @param {string} filePath - 확인할 파일 경로
 * @param {number} minSizeBytes - 최소 파일 크기
 * @param {number} timeoutMs - 최대 대기 시간
 * @returns {object} - { success: boolean, size: number, duration: number }
 */
function waitForFileReady(filePath, minSizeBytes, timeoutMs) {
    minSizeBytes = minSizeBytes || SCREENSHOT_CONFIG.MIN_FILE_SIZE_BYTES;
    timeoutMs = timeoutMs || SCREENSHOT_CONFIG.FILE_WRITE_TIMEOUT_MS;

    var startTime = Date.now();
    var lastSize = -1;
    var stableCount = 0;

    console.log("[ScreenCapture] Waiting for file: " + filePath);

    while (Date.now() - startTime < timeoutMs) {
        // 1. 파일 존재 확인
        if (!files.exists(filePath)) {
            sleep(SCREENSHOT_CONFIG.FILE_CHECK_INTERVAL_MS);
            continue;
        }

        // 2. 파일 크기 확인
        try {
            var file = new java.io.File(filePath);
            var currentSize = file.length();

            // 크기가 0이면 아직 쓰기 시작 안됨
            if (currentSize === 0) {
                sleep(SCREENSHOT_CONFIG.FILE_CHECK_INTERVAL_MS);
                continue;
            }

            // 최소 크기 미달
            if (currentSize < minSizeBytes) {
                lastSize = currentSize;
                stableCount = 0;
                sleep(SCREENSHOT_CONFIG.FILE_CHECK_INTERVAL_MS);
                continue;
            }

            // 3. 크기 안정화 확인 (쓰기 완료 판정)
            if (currentSize === lastSize) {
                stableCount++;
                if (stableCount >= SCREENSHOT_CONFIG.SIZE_STABLE_COUNT) {
                    var duration = Date.now() - startTime;
                    console.log("[ScreenCapture] File ready: " + currentSize + " bytes (" + duration + "ms)");
                    return {
                        success: true,
                        size: currentSize,
                        duration: duration
                    };
                }
            } else {
                stableCount = 0;
            }

            lastSize = currentSize;

        } catch (e) {
            console.warn("[ScreenCapture] File check error: " + e.message);
        }

        sleep(SCREENSHOT_CONFIG.FILE_CHECK_INTERVAL_MS);
    }

    // 타임아웃
    var elapsed = Date.now() - startTime;
    console.error("[ScreenCapture] File timeout after " + elapsed + "ms: " + filePath);

    return {
        success: false,
        size: lastSize,
        duration: elapsed
    };
}

// =============================================
// 스크린샷 캡처 (통합)
// =============================================

/**
 * 안전한 스크린샷 캡처
 * 1. UI 안정화 대기
 * 2. 스크린샷 캡처
 * 3. 파일 쓰기 완료 대기
 *
 * @param {string} filePath - 저장할 파일 경로
 * @param {object} options - 옵션 { waitForUi: boolean, uiTimeout: number, fileTimeout: number }
 * @returns {object} - { success: boolean, path: string, size: number, error?: string }
 */
function captureScreenSafe(filePath, options) {
    options = options || {};
    var waitForUi = options.waitForUi !== false; // 기본값 true
    var uiTimeout = options.uiTimeout || SCREENSHOT_CONFIG.UI_STABLE_TIMEOUT_MS;
    var fileTimeout = options.fileTimeout || SCREENSHOT_CONFIG.FILE_WRITE_TIMEOUT_MS;

    var result = {
        success: false,
        path: filePath,
        size: 0,
        uiStabilized: false,
        captureTime: 0,
        writeTime: 0
    };

    try {
        // 1. UI 안정화 대기
        if (waitForUi) {
            console.log("[ScreenCapture] Step 1: Waiting for UI idle...");
            result.uiStabilized = waitForUiIdle(
                SCREENSHOT_CONFIG.UI_STABLE_DURATION_MS,
                uiTimeout
            );
        }

        // 2. 디렉토리 생성
        var dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (!files.exists(dir)) {
            files.createWithDirs(dir + "/.placeholder");
            files.remove(dir + "/.placeholder");
            console.log("[ScreenCapture] Created directory: " + dir);
        }

        // 3. 스크린샷 캡처
        console.log("[ScreenCapture] Step 2: Capturing screenshot...");
        var captureStart = Date.now();
        var captureSuccess = false;

        // AutoX.js 스크린샷 API 호출
        if (typeof captureScreen === 'function') {
            captureSuccess = captureScreen(filePath);
        } else if (typeof images !== 'undefined' && images.captureScreen) {
            var img = images.captureScreen();
            if (img) {
                images.save(img, filePath);
                img.recycle();
                captureSuccess = true;
            }
        } else {
            result.error = "Screenshot API not available";
            return result;
        }

        result.captureTime = Date.now() - captureStart;

        if (!captureSuccess) {
            result.error = "captureScreen returned false";
            return result;
        }

        // 3.5 [RACE CONDITION FIX] images.save() 직후 즉시 폴링 (최대 3초)
        // 파일이 존재하고 크기가 0보다 클 때까지 대기
        console.log("[ScreenCapture] Step 3.5: Immediate polling after images.save()...");
        var immediatePollResult = waitForFileExistsAndNonZero(filePath);

        if (!immediatePollResult.exists || immediatePollResult.size === 0) {
            result.error = "Immediate poll failed: file not created or 0 bytes after " + immediatePollResult.duration + "ms";
            console.error("[ScreenCapture] " + result.error);
            return result;
        }

        // 4. 파일 쓰기 완료 대기 (폴링) - 크기 안정화 확인
        console.log("[ScreenCapture] Step 3: Waiting for file write...");
        var writeStart = Date.now();
        var fileResult = waitForFileReady(filePath, SCREENSHOT_CONFIG.MIN_FILE_SIZE_BYTES, fileTimeout);

        result.writeTime = Date.now() - writeStart;
        result.size = fileResult.size;

        if (!fileResult.success) {
            result.error = "File write timeout";
            return result;
        }

        // 5. 최종 검증
        if (files.exists(filePath)) {
            var file = new java.io.File(filePath);
            var finalSize = file.length();

            if (finalSize >= SCREENSHOT_CONFIG.MIN_FILE_SIZE_BYTES) {
                result.success = true;
                result.size = finalSize;
                console.log("[ScreenCapture] SUCCESS: " + filePath + " (" + finalSize + " bytes)");
            } else {
                result.error = "File too small: " + finalSize + " bytes";
            }
        } else {
            result.error = "File disappeared after write";
        }

    } catch (e) {
        result.error = e.message;
        console.error("[ScreenCapture] Error: " + e.message);
    }

    return result;
}

/**
 * 결과 신호 파일 생성
 * Host가 Pull하기 전 완료 상태를 알 수 있도록 신호 파일 생성
 *
 * [RACE CONDITION FIX] 파일 저장이 완벽히 끝난 후에만 job_finished 상태 파일을 생성
 * - 신호 파일 생성 전에 스크린샷 파일 존재 및 크기를 다시 한번 확인
 * - 이 함수가 호출되면 Host는 파일이 완전히 저장되었음을 신뢰할 수 있음
 *
 * @param {string} screenshotPath - 스크린샷 파일 경로
 * @param {object} captureResult - captureScreenSafe 결과
 * @returns {string} - 신호 파일 경로
 */
function writeReadySignal(screenshotPath, captureResult) {
    var signalPath = screenshotPath + ".ready";

    // [RACE CONDITION FIX] 신호 파일 생성 전 최종 확인
    // 파일이 실제로 존재하고 크기가 유효한지 다시 확인
    if (captureResult.success) {
        console.log("[ScreenCapture] [SIGNAL] Pre-signal verification...");

        if (!files.exists(screenshotPath)) {
            console.error("[ScreenCapture] [SIGNAL] CRITICAL: Screenshot file disappeared!");
            captureResult.success = false;
            captureResult.error = "File disappeared before signal write";
        } else {
            try {
                var file = new java.io.File(screenshotPath);
                var finalSize = file.length();

                if (finalSize === 0) {
                    console.error("[ScreenCapture] [SIGNAL] CRITICAL: Screenshot file is 0 bytes!");
                    captureResult.success = false;
                    captureResult.error = "File is 0 bytes at signal write time";
                } else if (finalSize !== captureResult.size) {
                    // 크기가 변경됨 - 최신 크기로 업데이트
                    console.warn("[ScreenCapture] [SIGNAL] File size changed: " + captureResult.size + " -> " + finalSize);
                    captureResult.size = finalSize;
                }
            } catch (e) {
                console.error("[ScreenCapture] [SIGNAL] Pre-signal check error: " + e.message);
            }
        }
    }

    var signalData = {
        status: captureResult.success ? "ready" : "failed",
        screenshot_path: screenshotPath,
        file_size: captureResult.size,
        timestamp: new Date().toISOString(),
        capture_time_ms: captureResult.captureTime,
        write_time_ms: captureResult.writeTime,
        error: captureResult.error || null,
        // [RACE CONDITION FIX] 추가 메타데이터
        verified_at_signal: captureResult.success,  // 신호 생성 시점에 파일 검증됨
        signal_version: "2.0"  // Race condition fix 버전
    };

    try {
        files.write(signalPath, JSON.stringify(signalData, null, 2));
        console.log("[ScreenCapture] [SIGNAL] Signal file written: " + signalPath + " (status=" + signalData.status + ")");
        return signalPath;
    } catch (e) {
        console.error("[ScreenCapture] [SIGNAL] Failed to write signal: " + e.message);
        return null;
    }
}

// =============================================
// 모듈 Export
// =============================================
module.exports = {
    // UI 안정화
    waitForUiIdle: waitForUiIdle,
    waitForActivity: waitForActivity,

    // 파일 대기
    waitForFileReady: waitForFileReady,
    waitForFileExistsAndNonZero: waitForFileExistsAndNonZero, // [RACE CONDITION FIX]

    // 스크린샷 캡처
    captureScreenSafe: captureScreenSafe,
    writeReadySignal: writeReadySignal,

    // 설정
    SCREENSHOT_CONFIG: SCREENSHOT_CONFIG
};
