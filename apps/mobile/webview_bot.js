/**
 * [Agent-Mob] WebView YouTube Bot v4.0
 * WebView 기반 유튜브 검색 및 시청 자동화
 *
 * v4.0 Changes:
 * - job-loader.js 모듈 사용 (job.json 파일 기반 통신)
 * - evidence-manager.js 모듈 사용 (스크린샷 Race Condition 해결)
 */
"ui"; // UI mode

// Module loader for absolute path resolution
const moduleLoader = require('./modules/module-loader.js');

// Load modules using absolute paths
const { initializeWebView } = moduleLoader.loadModule('webview-setup');
const { getInjectionCode } = moduleLoader.loadModule('dom_utils');
const config = moduleLoader.loadModule('config');
const jobLoader = moduleLoader.loadModule('job-loader');
const evidenceManager = moduleLoader.loadModule('evidence-manager');

// =============================================
// 1. 파라미터 설정 (job-loader.js 사용)
// =============================================
// execArgv와 job.json 파일 모두 지원
var params = jobLoader.loadJobParams(engines.myEngine().execArgv);

// 작업 상태 추적
var jobState = {
    currentStep: 0,
    totalSteps: 5,
    videoFound: false,
    videoStarted: false,
    errors: [],
    evidenceFiles: []  // 증거 파일 목록 (v4.0)
};

// WebView 인스턴스
var webViewInstance = null;

console.log("=== WebView Bot v4.0 Started ===");
console.log("Assignment ID: " + params.assignment_id);
console.log("Job ID: " + params.job_id);
console.log("Keyword: " + params.keyword);
console.log("Duration Range: " + params.duration_min_pct + "% - " + params.duration_max_pct + "%");

// =============================================
// 2. Helper Functions
// =============================================

/**
 * Promise 기반 대기 함수
 * @param {number} ms - 대기 시간 (밀리초)
 * @returns {Promise} - 대기 완료 Promise
 */
function waitFor(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

/**
 * evaluateJavascript 래퍼 (결과 콜백 포함)
 * @param {string} jsCode - 실행할 JavaScript 코드
 * @returns {Promise<string>} - 실행 결과
 */
function injectAndRun(jsCode) {
    return new Promise(function(resolve, reject) {
        if (!webViewInstance || !webViewInstance.evaluateJS) {
            reject(new Error("WebView not initialized"));
            return;
        }

        try {
            webViewInstance.evaluateJS(jsCode, function(result) {
                resolve(result);
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Supabase 진행률 보고
 * @param {number} pct - 진행률 (0-100)
 */
function reportProgress(pct) {
    if (!params.supabase_url || !params.supabase_key) {
        console.log("[Progress] " + pct + "% (Supabase 미설정)");
        return;
    }

    try {
        var url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
        var response = http.patch(url, JSON.stringify({
            "progress_pct": pct,
            "status": "running",
            "current_step": jobState.currentStep
        }), {
            headers: {
                "apikey": params.supabase_key,
                "Authorization": "Bearer " + params.supabase_key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
        });

        if (response && response.statusCode >= 200 && response.statusCode < 300) {
            console.log("[Progress] Reported: " + pct + "%");
        } else {
            console.error("[Progress] Report failed: HTTP " + (response ? response.statusCode : "unknown"));
        }
    } catch (e) {
        console.error("[Progress] Report error: " + e.message);
    }
}

/**
 * 작업 완료 보고
 */
function completeJob() {
    console.log("=== Job Completed ===");
    console.log("Video Found: " + jobState.videoFound);
    console.log("Video Started: " + jobState.videoStarted);
    console.log("Evidence Files: " + jobState.evidenceFiles.length);
    console.log("Errors: " + (jobState.errors.length > 0 ? jobState.errors.join(", ") : "None"));

    // v4.0: 결과 JSON 파일 생성 (PC Worker가 Pull할 수 있도록)
    var resultData = {
        video_found: jobState.videoFound,
        video_started: jobState.videoStarted,
        errors: jobState.errors
    };
    var resultPath = evidenceManager.writeResultJson(params.job_id, resultData, jobState.evidenceFiles);
    if (resultPath) {
        console.log("[Complete] Result JSON: " + resultPath);
    }

    // v4.0: job.json 파일 정리
    jobLoader.finalizeJob(params);

    if (!params.supabase_url || !params.supabase_key) {
        console.log("[Complete] Supabase 미설정, 로컬 완료");
        return;
    }

    try {
        var url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
        var response = http.patch(url, JSON.stringify({
            "status": "completed",
            "progress_pct": 100,
            "completed_at": new Date().toISOString(),
            "video_found": jobState.videoFound,
            "video_started": jobState.videoStarted,
            "evidence_count": jobState.evidenceFiles.length,
            "error_log": jobState.errors.length > 0 ? jobState.errors.join("; ") : null
        }), {
            headers: {
                "apikey": params.supabase_key,
                "Authorization": "Bearer " + params.supabase_key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
        });

        if (response && response.statusCode >= 200 && response.statusCode < 300) {
            console.log("[Complete] Successfully reported to Supabase");
        } else {
            console.error("[Complete] Report failed: HTTP " + (response ? response.statusCode : "unknown"));
        }
    } catch (e) {
        console.error("[Complete] Report error: " + e.message);
    }
}

// =============================================
// 3. Main Sequence
// =============================================

/**
 * 메인 실행 함수
 */
function main() {
    console.log("[Main] Initializing WebView...");

    // WebView 초기화
    webViewInstance = initializeWebView();

    if (!webViewInstance) {
        console.error("[Main] Failed to initialize WebView");
        jobState.errors.push("WebView initialization failed");
        return;
    }

    console.log("[Main] WebView initialized, loading YouTube...");

    // 페이지 로드 완료 후 시퀀스 시작
    webViewInstance.loadUrl(config.urls.youtube_mobile, function(url) {
        console.log("[Main] YouTube loaded: " + url);

        // 메인 스레드에서 시퀀스 실행
        threads.start(function() {
            try {
                runSequence();
            } catch (e) {
                console.error("[Main] Sequence error: " + e.message);
                jobState.errors.push("Sequence error: " + e.message);
                completeJob();
            }
        });
    });
}

/**
 * 자동화 시퀀스 실행
 */
function runSequence() {
    console.log("[Sequence] Starting automation sequence...");

    // 초기 로딩 대기
    sleep(config.timeouts.page_load);

    // Step 1: DOM 헬퍼 주입
    console.log("[Step 1/5] Injecting DOM helpers...");
    jobState.currentStep = 1;
    reportProgress(10);

    var injectionCode = getInjectionCode();

    try {
        webViewInstance.evaluateJS(injectionCode, function(result) {
            console.log("[Step 1] Injection result: " + result);
        });
    } catch (e) {
        console.error("[Step 1] Injection failed: " + e.message);
        jobState.errors.push("DOM injection failed");
    }

    sleep(config.timeouts.action_delay);

    // Step 2: 검색 아이콘 클릭
    console.log("[Step 2/5] Clicking search icon...");
    jobState.currentStep = 2;
    reportProgress(20);

    var searchIconSelectors = config.selectors.search_icon.split(", ");
    var searchClicked = false;

    for (var i = 0; i < searchIconSelectors.length && !searchClicked; i++) {
        var selector = searchIconSelectors[i].trim();
        var clickCode = "window.DOMUtils.click('" + selector.replace(/'/g, "\\'") + "')";

        try {
            webViewInstance.evaluateJS(clickCode, function(result) {
                if (result === 'true' || result === true) {
                    searchClicked = true;
                    console.log("[Step 2] Search icon clicked: " + selector);
                }
            });
        } catch (e) {
            console.log("[Step 2] Selector failed: " + selector);
        }
        sleep(500);
    }

    if (!searchClicked) {
        console.log("[Step 2] Trying direct URL navigation to search...");
        webViewInstance.loadUrl(config.urls.youtube_search + encodeURIComponent(params.keyword), function(url) {
            console.log("[Step 2] Direct search navigation: " + url);
        });
        sleep(config.timeouts.search_result);
    } else {
        sleep(config.timeouts.action_delay * 2);
    }

    // Step 3: 검색어 입력
    console.log("[Step 3/5] Typing search keyword...");
    jobState.currentStep = 3;
    reportProgress(40);

    var searchInputSelectors = config.selectors.search_input.split(", ");
    var keywordTyped = false;

    for (var j = 0; j < searchInputSelectors.length && !keywordTyped; j++) {
        var inputSelector = searchInputSelectors[j].trim();
        var typeCode = "window.DOMUtils.type('" + inputSelector.replace(/'/g, "\\'") + "', '" + params.keyword.replace(/'/g, "\\'") + "')";

        try {
            webViewInstance.evaluateJS(typeCode, function(result) {
                if (result === 'true' || result === true) {
                    keywordTyped = true;
                    console.log("[Step 3] Keyword typed: " + inputSelector);
                }
            });
        } catch (e) {
            console.log("[Step 3] Type failed: " + inputSelector);
        }
        sleep(500);
    }

    // 검색 결과 로딩 대기
    sleep(config.timeouts.search_result);

    // Step 4: 동영상 찾기
    console.log("[Step 4/5] Finding video by keyword...");
    jobState.currentStep = 4;
    reportProgress(60);

    // DOM 헬퍼 재주입 (페이지 변경으로 인해 필요할 수 있음)
    webViewInstance.evaluateJS(injectionCode, null);
    sleep(500);

    var maxScrollAttempts = 5;
    var videoFound = false;

    for (var scrollAttempt = 0; scrollAttempt < maxScrollAttempts && !videoFound; scrollAttempt++) {
        console.log("[Step 4] Search attempt " + (scrollAttempt + 1) + "/" + maxScrollAttempts);

        // 동영상 찾기
        var findCode = "JSON.stringify({ found: window.DOMUtils.findVideoByTitle('" + params.keyword.replace(/'/g, "\\'") + "') !== null })";

        webViewInstance.evaluateJS(findCode, function(result) {
            try {
                var parsed = JSON.parse(result);
                if (parsed && parsed.found) {
                    videoFound = true;
                    jobState.videoFound = true;
                    console.log("[Step 4] Video found!");
                }
            } catch (e) {
                console.log("[Step 4] Parse error: " + e.message);
            }
        });

        sleep(config.timeouts.action_delay);

        if (!videoFound) {
            // 스크롤 후 재시도
            console.log("[Step 4] Scrolling to find more videos...");
            webViewInstance.evaluateJS("window.scrollBy(0, 500)", null);
            sleep(config.timeouts.scroll_delay);
        }
    }

    if (!videoFound) {
        console.log("[Step 4] Video not found after " + maxScrollAttempts + " attempts");
        jobState.errors.push("Video not found for keyword: " + params.keyword);

        // v4.0: 실패 시 스크린샷 캡처
        var failScreenshot = evidenceManager.captureScreenshot(params.job_id, "search_failed");
        if (failScreenshot.success) {
            jobState.evidenceFiles.push(failScreenshot.path);
            console.log("[Step 4] Failure screenshot: " + failScreenshot.path);
        }

        completeJob();
        return;
    }

    // v4.0: 동영상 발견 시 스크린샷 캡처
    var foundScreenshot = evidenceManager.captureScreenshot(params.job_id, "video_found");
    if (foundScreenshot.success) {
        jobState.evidenceFiles.push(foundScreenshot.path);
        console.log("[Step 4] Found screenshot: " + foundScreenshot.path);
    }

    // Step 5: 동영상 클릭
    console.log("[Step 5/5] Clicking found video...");
    jobState.currentStep = 5;
    reportProgress(80);

    var clickVideoCode = "window.DOMUtils.clickVideoByTitle('" + params.keyword.replace(/'/g, "\\'") + "')";

    webViewInstance.evaluateJS(clickVideoCode, function(result) {
        if (result === 'true' || result === true) {
            jobState.videoStarted = true;
            console.log("[Step 5] Video clicked successfully");
        } else {
            console.log("[Step 5] Video click failed");
            jobState.errors.push("Video click failed");
        }
    });

    sleep(config.timeouts.video_load);

    // v4.0: 동영상 재생 시작 시 스크린샷 캡처
    var playScreenshot = evidenceManager.captureScreenshot(params.job_id, "video_playing");
    if (playScreenshot.success) {
        jobState.evidenceFiles.push(playScreenshot.path);
        console.log("[Step 5] Playing screenshot: " + playScreenshot.path);
    }

    // 동영상 시청 (시청 시간 계산)
    var randomPct = Math.floor(Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)) + params.duration_min_pct;
    var targetDurationSec = Math.floor(params.base_duration_sec * (randomPct / 100));

    console.log("[Watch] Target duration: " + targetDurationSec + "s (" + randomPct + "%)");

    var watchStartTime = Date.now();
    var watchElapsed = 0;

    while (watchElapsed < targetDurationSec) {
        sleep(10000); // 10초마다 체크
        watchElapsed = Math.floor((Date.now() - watchStartTime) / 1000);

        var watchProgress = Math.min(100, Math.round((watchElapsed / targetDurationSec) * 100));
        var overallProgress = 80 + Math.floor(watchProgress * 0.2); // 80-100% 범위

        console.log("[Watch] " + watchElapsed + "s / " + targetDurationSec + "s (" + watchProgress + "%)");
        reportProgress(overallProgress);
    }

    console.log("[Watch] Watch completed");

    // v4.0: 시청 완료 시 스크린샷 캡처
    var completeScreenshot = evidenceManager.captureScreenshot(params.job_id, "watch_complete");
    if (completeScreenshot.success) {
        jobState.evidenceFiles.push(completeScreenshot.path);
        console.log("[Watch] Complete screenshot: " + completeScreenshot.path);
    }

    reportProgress(100);
    completeJob();

    // 스크립트 종료
    sleep(2000);
    engines.myEngine().forceStop();
}

// =============================================
// 4. 실행
// =============================================
main();
