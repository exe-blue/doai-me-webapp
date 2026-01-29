/**
 * ScreenCapture Stress Test - Race Condition 검증
 *
 * 목적: 화면 캡처 완료 시점과 파일 회수 시점 간의 경쟁 상태 해결 검증
 *
 * 테스트 내용:
 * - 스크린샷 10회 연속 빠른 요청
 * - 0byte 파일 발생 여부 확인
 * - 깨진 이미지 발생 여부 확인
 *
 * 실행 방법: AutoX.js에서 실행 또는 ADB broadcast로 실행
 */

// 모듈 로드 (AutoX.js 환경)
var ScreenCapture;
try {
    ScreenCapture = require('../ScreenCapture.js');
} catch (e) {
    // AutoX.js 환경에서 직접 실행 시
    console.log("[StressTest] Direct execution mode");
    var ScreenCapture = null;
}

// =============================================
// 테스트 설정
// =============================================
var TEST_CONFIG = {
    ITERATION_COUNT: 10,           // 연속 스크린샷 횟수
    DELAY_BETWEEN_CAPTURES_MS: 100, // 캡처 간 딜레이 (빠른 연속 요청 시뮬레이션)
    TEST_OUTPUT_DIR: "/sdcard/Scripts/doai-bot/evidence/stress-test",
    MIN_VALID_FILE_SIZE: 1000      // 유효 파일 최소 크기 (1KB)
};

// =============================================
// 테스트 결과 저장용
// =============================================
var testResults = {
    totalCaptures: 0,
    successCount: 0,
    failCount: 0,
    zeroByteCount: 0,
    corruptedCount: 0,
    results: [],
    startTime: null,
    endTime: null
};

// =============================================
// 유틸리티 함수
// =============================================

/**
 * PNG 파일 헤더 검증 (간단한 무결성 체크)
 * PNG 시그니처: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
 */
function isPngValid(filePath) {
    try {
        var file = new java.io.File(filePath);
        if (!file.exists() || file.length() < 8) {
            return false;
        }

        var fis = new java.io.FileInputStream(file);
        var header = [];
        for (var i = 0; i < 8; i++) {
            header.push(fis.read());
        }
        fis.close();

        // PNG 시그니처 확인
        var pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (var j = 0; j < 8; j++) {
            if (header[j] !== pngSignature[j]) {
                return false;
            }
        }

        return true;
    } catch (e) {
        console.error("[StressTest] PNG validation error: " + e.message);
        return false;
    }
}

/**
 * 디렉토리 생성
 */
function ensureDir(dirPath) {
    if (!files.exists(dirPath)) {
        files.createWithDirs(dirPath + "/.placeholder");
        files.remove(dirPath + "/.placeholder");
    }
}

/**
 * 단일 스크린샷 캡처 테스트
 */
function captureAndValidate(iteration) {
    var result = {
        iteration: iteration,
        success: false,
        filePath: null,
        fileSize: 0,
        captureTimeMs: 0,
        isZeroByte: false,
        isCorrupted: false,
        error: null
    };

    var filePath = TEST_CONFIG.TEST_OUTPUT_DIR + "/stress_test_" + iteration + "_" + Date.now() + ".png";
    result.filePath = filePath;

    var startTime = Date.now();

    try {
        // ScreenCapture 모듈 사용 또는 직접 캡처
        if (ScreenCapture && ScreenCapture.captureScreenSafe) {
            var captureResult = ScreenCapture.captureScreenSafe(filePath, {
                waitForUi: false,  // UI 안정화 대기 생략 (빠른 테스트)
                fileTimeout: 5000  // 파일 쓰기 타임아웃
            });

            result.captureTimeMs = Date.now() - startTime;
            result.success = captureResult.success;
            result.fileSize = captureResult.size;

            if (!captureResult.success) {
                result.error = captureResult.error || "Capture failed";
            }
        } else {
            // 직접 캡처 (ScreenCapture 모듈 없는 경우)
            if (typeof images !== 'undefined' && images.captureScreen) {
                var img = images.captureScreen();
                if (img) {
                    images.save(img, filePath);
                    img.recycle();

                    // [RACE CONDITION FIX 테스트] 파일 존재 및 크기 확인
                    var pollStart = Date.now();
                    var maxPollTime = 3000; // 3초

                    while (Date.now() - pollStart < maxPollTime) {
                        if (files.exists(filePath)) {
                            var file = new java.io.File(filePath);
                            var size = file.length();
                            if (size > 0) {
                                result.fileSize = size;
                                result.success = true;
                                break;
                            }
                        }
                        sleep(50);
                    }

                    result.captureTimeMs = Date.now() - startTime;

                    if (!result.success) {
                        result.error = "File polling timeout";
                    }
                } else {
                    result.error = "captureScreen returned null";
                }
            } else {
                result.error = "Screenshot API not available";
            }
        }

        // 결과 검증
        if (files.exists(filePath)) {
            var file = new java.io.File(filePath);
            result.fileSize = file.length();

            // 0byte 체크
            if (result.fileSize === 0) {
                result.isZeroByte = true;
                result.success = false;
                result.error = "File is 0 bytes";
            }
            // 최소 크기 체크
            else if (result.fileSize < TEST_CONFIG.MIN_VALID_FILE_SIZE) {
                result.success = false;
                result.error = "File too small: " + result.fileSize + " bytes";
            }
            // PNG 무결성 체크
            else if (!isPngValid(filePath)) {
                result.isCorrupted = true;
                result.success = false;
                result.error = "PNG header invalid (corrupted)";
            }
        } else if (result.success) {
            result.success = false;
            result.error = "File does not exist after capture";
        }

    } catch (e) {
        result.error = e.message;
        result.captureTimeMs = Date.now() - startTime;
    }

    return result;
}

// =============================================
// 메인 테스트 실행
// =============================================
function runStressTest() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  ScreenCapture Race Condition Stress Test             ║');
    console.log('║  iterations: ' + TEST_CONFIG.ITERATION_COUNT + ', delay: ' + TEST_CONFIG.DELAY_BETWEEN_CAPTURES_MS + 'ms              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // 테스트 디렉토리 생성
    ensureDir(TEST_CONFIG.TEST_OUTPUT_DIR);

    testResults.startTime = Date.now();

    // 10회 연속 캡처 실행
    for (var i = 1; i <= TEST_CONFIG.ITERATION_COUNT; i++) {
        console.log("\n[StressTest] === Iteration " + i + "/" + TEST_CONFIG.ITERATION_COUNT + " ===");

        var result = captureAndValidate(i);
        testResults.results.push(result);
        testResults.totalCaptures++;

        if (result.success) {
            testResults.successCount++;
            console.log("[StressTest] ✅ SUCCESS: " + result.fileSize + " bytes (" + result.captureTimeMs + "ms)");
        } else {
            testResults.failCount++;
            if (result.isZeroByte) {
                testResults.zeroByteCount++;
                console.log("[StressTest] ❌ FAIL (0 BYTE): " + result.error);
            } else if (result.isCorrupted) {
                testResults.corruptedCount++;
                console.log("[StressTest] ❌ FAIL (CORRUPTED): " + result.error);
            } else {
                console.log("[StressTest] ❌ FAIL: " + result.error);
            }
        }

        // 다음 캡처 전 짧은 딜레이
        if (i < TEST_CONFIG.ITERATION_COUNT) {
            sleep(TEST_CONFIG.DELAY_BETWEEN_CAPTURES_MS);
        }
    }

    testResults.endTime = Date.now();

    // 결과 출력
    printResults();

    // 결과 파일 저장
    saveResults();

    return testResults;
}

/**
 * 테스트 결과 출력
 */
function printResults() {
    var totalTime = testResults.endTime - testResults.startTime;

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                   TEST RESULTS                         ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('Total captures: ' + testResults.totalCaptures);
    console.log('Success count:  ' + testResults.successCount);
    console.log('Fail count:     ' + testResults.failCount);
    console.log('0-byte files:   ' + testResults.zeroByteCount);
    console.log('Corrupted:      ' + testResults.corruptedCount);
    console.log('Total time:     ' + totalTime + 'ms');
    console.log('Avg time/cap:   ' + Math.round(totalTime / testResults.totalCaptures) + 'ms');
    console.log('');

    // Race Condition 해결 여부 판정
    if (testResults.zeroByteCount === 0 && testResults.corruptedCount === 0) {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║  ✅✅✅ RACE CONDITION FIX VERIFIED ✅✅✅              ║');
        console.log('║  No 0-byte or corrupted files detected!               ║');
        console.log('╚════════════════════════════════════════════════════════╝');
    } else {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║  ❌❌❌ RACE CONDITION STILL EXISTS ❌❌❌              ║');
        console.log('║  0-byte: ' + testResults.zeroByteCount + ', Corrupted: ' + testResults.corruptedCount + '                              ║');
        console.log('╚════════════════════════════════════════════════════════╝');
    }
}

/**
 * 결과 JSON 파일 저장
 */
function saveResults() {
    var resultPath = TEST_CONFIG.TEST_OUTPUT_DIR + "/stress_test_result_" + Date.now() + ".json";

    var summary = {
        test_type: "race_condition_stress_test",
        test_config: TEST_CONFIG,
        summary: {
            total_captures: testResults.totalCaptures,
            success_count: testResults.successCount,
            fail_count: testResults.failCount,
            zero_byte_count: testResults.zeroByteCount,
            corrupted_count: testResults.corruptedCount,
            pass_rate: (testResults.successCount / testResults.totalCaptures * 100).toFixed(2) + '%',
            race_condition_resolved: (testResults.zeroByteCount === 0 && testResults.corruptedCount === 0)
        },
        timing: {
            start_time: new Date(testResults.startTime).toISOString(),
            end_time: new Date(testResults.endTime).toISOString(),
            total_duration_ms: testResults.endTime - testResults.startTime,
            avg_capture_time_ms: Math.round((testResults.endTime - testResults.startTime) / testResults.totalCaptures)
        },
        individual_results: testResults.results
    };

    try {
        files.write(resultPath, JSON.stringify(summary, null, 2));
        console.log('\n[StressTest] Results saved to: ' + resultPath);
    } catch (e) {
        console.error('[StressTest] Failed to save results: ' + e.message);
    }
}

// =============================================
// 실행
// =============================================

// AutoX.js 환경 또는 Node.js 환경에서 실행
if (typeof module !== 'undefined' && module.exports) {
    // Node.js에서 require 시
    module.exports = {
        runStressTest: runStressTest,
        TEST_CONFIG: TEST_CONFIG
    };
} else {
    // AutoX.js에서 직접 실행 시
    runStressTest();
}
