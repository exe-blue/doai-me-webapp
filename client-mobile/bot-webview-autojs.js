"ui";

/**
 * WebView 기반 YouTube 검색 자동화 봇 (AutoX.js 호환)
 * Worker v5.1과 통합
 *
 * 변경사항:
 * - require() 제거 (AutoX.js 미지원)
 * - 모듈을 직접 인라인화
 * - job.json 파일에서 파라미터 읽기
 * - Supabase Edge Function 호출
 */

// Debug checkpoint helper (writes files for external monitoring)
// Uses setTimeout to work in UI mode when called before UI is ready
function checkpoint(name, data) {
    setTimeout(function() {
        try {
            files.write('/sdcard/checkpoint_' + name + '.txt',
                new Date().toISOString() + ' - ' + (data || 'OK'));
        } catch (e) {
            // Ignore checkpoint write errors
        }
    }, 100);
}

checkpoint('01_script_started');

console.log('[Bot] Starting WebView-based YouTube automation bot...');
console.log('[Bot] Device:', device.serial);

// =============================================
// 1. job.json 파라미터 로드
// =============================================

function loadJobParams() {
    try {
        const jobPath = '/sdcard/job.json';
        if (!files.exists(jobPath)) {
            throw new Error('job.json not found at /sdcard/job.json');
        }
        const jobData = files.read(jobPath);
        return JSON.parse(jobData);
    } catch (error) {
        console.error('[Bot] Failed to load job.json:', error);
        toast('작업 파라미터 로드 실패: ' + error.message);
        throw error;
    }
}

const JOB_PARAMS = loadJobParams();
checkpoint('02_job_loaded', JOB_PARAMS.assignment_id);
console.log('[Bot] Job loaded:', JOB_PARAMS.assignment_id);
console.log('[Bot] Keyword:', JOB_PARAMS.keyword);

// =============================================
// 2. WebView 초기화 (MOB-01 인라인)
// =============================================

// UI 레이아웃 생성
ui.layout(
    <vertical>
        <webview id="webView" layout_weight="1" w="*" h="*"/>
    </vertical>
);

const webView = ui.webView;
const settings = webView.getSettings();

// JavaScript 활성화
settings.setJavaScriptEnabled(true);
settings.setDomStorageEnabled(true);
settings.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);

// User Agent 설정
settings.setUserAgentString(
    "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
);
settings.setMediaPlaybackRequiresUserGesture(false);

// JavaScript Interface 등록
const AndroidBridge = {
    log: function(message) {
        console.log("[WebView]", message);
    },
    error: function(error) {
        console.error("[WebView Error]", error);
    },
    onPageLoaded: function(url) {
        console.log("[WebView] Page loaded:", url);
    }
};

webView.addJavascriptInterface(AndroidBridge, "AndroidBridge");
checkpoint('03_webview_initialized');

// WebView Client 설정
webView.setWebViewClient(new android.webkit.WebViewClient({
    onPageFinished: function(view, url) {
        console.log("[WebView] Page finished loading:", url);
    },
    onReceivedError: function(view, request, error) {
        console.error("[WebView] Page load error:", error.getDescription());
    }
}));

// Console 메시지 리스너
webView.setWebChromeClient(new android.webkit.WebChromeClient({
    onConsoleMessage: function(consoleMessage) {
        console.log("[WebView Console]", consoleMessage.message());
        return true;
    }
}));

console.log('[Bot] WebView initialized');

// =============================================
// 3. DOM 제어 헬퍼 함수 (MOB-02 인라인)
// =============================================

const SELECTORS = {
    search: {
        searchBox: [
            "input[aria-label='검색']",
            "input#search",
            "ytm-search input[type='text']"
        ],
        searchButton: [
            "button[aria-label='검색']",
            "button#search-icon",
            "ytm-search button.searchbox-button"
        ],
        resultVideo: [
            "ytm-video-with-context-renderer a.media-item-thumbnail-container",
            "ytm-compact-video-renderer a",
            ".compact-media-item a"
        ]
    },
    video: {
        player: [
            "video.html5-main-video",
            "#player video"
        ],
        likeButton: [
            "button[aria-label*='좋아요']",
            "ytm-like-button-renderer button"
        ]
    }
};

/**
 * JavaScript 실행 헬퍼
 */
function evaluateJS(jsCode, callback) {
    webView.evaluateJavascript(jsCode, callback || null);
}

/**
 * 요소 찾기 (우선순위 기반)
 */
function findElement(category, element, callback) {
    const selectors = SELECTORS[category][element];
    const jsCode = `
    (function() {
        const selectors = ${JSON.stringify(selectors)};
        for (let selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                window.__lastFoundElement = el;
                return true;
            }
        }
        return false;
    })();
    `;
    evaluateJS(jsCode, callback);
}

/**
 * 텍스트 입력 (React 호환)
 */
function inputText(category, element, text, callback) {
    findElement(category, element, function(found) {
        if (found !== 'true') {
            console.error('[DOM] Element not found:', category, element);
            if (callback) callback(false);
            return;
        }

        // 텍스트 이스케이프
        const escapedText = text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');

        const jsCode = `
        (function() {
            const el = window.__lastFoundElement;
            if (!el) return false;

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            ).set;
            nativeInputValueSetter.call(el, '${escapedText}');

            const inputEvent = new Event('input', { bubbles: true });
            el.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', { bubbles: true });
            el.dispatchEvent(changeEvent);

            if (window.AndroidBridge) {
                window.AndroidBridge.log('Text input successful');
            }
            return true;
        })();
        `;
        evaluateJS(jsCode, callback);
    });
}

/**
 * 요소 클릭
 */
function clickElement(category, element, callback) {
    findElement(category, element, function(found) {
        if (found !== 'true') {
            console.error('[DOM] Element not found:', category, element);
            if (callback) callback(false);
            return;
        }

        const jsCode = `
        (function() {
            const el = window.__lastFoundElement;
            if (!el) return false;

            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            el.dispatchEvent(clickEvent);

            if (el.focus) {
                el.focus();
            }

            if (window.AndroidBridge) {
                window.AndroidBridge.log('Element clicked');
            }
            return true;
        })();
        `;
        evaluateJS(jsCode, callback);
    });
}

/**
 * 동영상 재생 시간 가져오기
 */
function getVideoTime(callback) {
    const jsCode = `
    (function() {
        const video = document.querySelector('video.html5-main-video');
        if (!video) {
            return JSON.stringify({ error: 'Video not found' });
        }
        return JSON.stringify({
            currentTime: Math.floor(video.currentTime),
            duration: Math.floor(video.duration),
            percentage: Math.floor((video.currentTime / video.duration) * 100)
        });
    })();
    `;
    evaluateJS(jsCode, callback);
}

console.log('[Bot] DOM helpers loaded');

// =============================================
// 4. 검색 & 시청 시나리오 (MOB-03 인라인)
// =============================================

function randomSleep(minMs, maxMs) {
    const duration = minMs + Math.random() * (maxMs - minMs);
    return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * 검색 실행
 */
async function performSearch(keyword) {
    console.log('[Search] Starting search for:', keyword);

    // 검색창 대기 (최대 10초)
    let searchBoxFound = false;
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => {
            findElement('search', 'searchBox', function(result) {
                searchBoxFound = (result === 'true');
                resolve();
            });
        });
        if (searchBoxFound) break;
        await sleep(1000);
    }

    if (!searchBoxFound) {
        throw new Error('Search box not found');
    }

    // 검색창 클릭
    await randomSleep(500, 1000);
    await new Promise(resolve => {
        clickElement('search', 'searchBox', resolve);
    });

    // 검색어 입력
    await randomSleep(500, 1000);
    await new Promise(resolve => {
        inputText('search', 'searchBox', keyword, resolve);
    });

    // 검색 버튼 클릭
    await randomSleep(1000, 2000);
    await new Promise(resolve => {
        clickElement('search', 'searchButton', resolve);
    });

    console.log('[Search] Search executed');
}

/**
 * 검색 결과 클릭
 */
async function clickSearchResult(index) {
    console.log('[Search] Waiting for results...');
    await randomSleep(3000, 4000);

    const jsCode = `
    (function() {
        const selectors = ${JSON.stringify(SELECTORS.search.resultVideo)};
        let videos = null;

        for (let selector of selectors) {
            videos = document.querySelectorAll(selector);
            if (videos && videos.length > 0) break;
        }

        if (!videos || videos.length === 0) {
            if (window.AndroidBridge) {
                window.AndroidBridge.error('No search results found');
            }
            return false;
        }

        const targetIndex = ${index};
        if (targetIndex >= videos.length) {
            if (window.AndroidBridge) {
                window.AndroidBridge.error('Video index out of range');
            }
            return false;
        }

        videos[targetIndex].click();
        if (window.AndroidBridge) {
            window.AndroidBridge.log('Clicked video #' + targetIndex);
        }
        return true;
    })();
    `;

    return new Promise(resolve => {
        evaluateJS(jsCode, function(result) {
            resolve(result === 'true');
        });
    });
}

/**
 * 동영상 시청
 */
async function watchVideo(durationSec) {
    console.log('[Watch] Starting video watch...');
    await randomSleep(3000, 5000);

    // 시청 시작
    const watchStartTime = Date.now();
    const targetWatchMs = durationSec * 1000;

    while (Date.now() - watchStartTime < targetWatchMs) {
        await sleep(5000); // 5초마다 체크

        // 진행률 확인
        await new Promise(resolve => {
            getVideoTime(function(result) {
                try {
                    const data = JSON.parse(result);
                    if (!data.error) {
                        console.log(`[Watch] Progress: ${data.percentage}% (${data.currentTime}s / ${data.duration}s)`);
                    }
                } catch (e) {
                    // 파싱 실패 무시
                }
                resolve();
            });
        });
    }

    console.log('[Watch] Video watch completed');
}

console.log('[Bot] Scenario functions loaded');

// =============================================
// 5. 메인 실행
// =============================================

async function main() {
    try {
        checkpoint('04_main_started');
        console.log('[Main] ========== Starting Job Execution ==========');

        // 1. YouTube 모바일 홈 로드
        console.log('[Main] Loading YouTube mobile...');
        webView.loadUrl('https://m.youtube.com');
        await randomSleep(3000, 5000);
        checkpoint('05_youtube_loaded');

        // 2. 검색 실행
        await performSearch(JOB_PARAMS.keyword);
        checkpoint('06_search_completed');

        // 3. 검색 결과 클릭 (첫 번째 결과)
        await randomSleep(2000, 3000);
        const clickSuccess = await clickSearchResult(0);
        if (!clickSuccess) {
            throw new Error('Failed to click search result');
        }
        checkpoint('07_video_clicked');

        // 4. 동영상 시청
        await randomSleep(2000, 3000);
        await watchVideo(JOB_PARAMS.duration_sec);
        checkpoint('08_video_watched');

        // 5. 증거 스크린샷 저장
        console.log('[Main] Capturing evidence screenshot...');
        const screenshot = captureScreen();
        if (screenshot) {
            images.save(screenshot, JOB_PARAMS.evidence_path);
            console.log('[Main] Screenshot saved:', JOB_PARAMS.evidence_path);
        } else {
            console.warn('[Main] Screenshot capture failed');
        }

        // 6. 완료 시그널 생성 (flag 파일)
        console.log('[Main] Creating completion flag...');
        files.write(JOB_PARAMS.done_flag_path, 'DONE');

        // 7. Supabase Edge Function 호출 (작업 완료 처리)
        console.log('[Main] Calling complete-job-assignment...');
        const response = http.postJson(
            JOB_PARAMS.supabase_url + '/functions/v1/complete-job-assignment',
            {
                assignment_id: JOB_PARAMS.assignment_id,
                watch_percentage: 100,
                actual_duration_sec: JOB_PARAMS.duration_sec
            },
            {
                headers: {
                    'apikey': JOB_PARAMS.supabase_key,
                    'Authorization': 'Bearer ' + JOB_PARAMS.supabase_key,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.statusCode === 200) {
            console.log('[Main] Job completed successfully');
        } else {
            console.warn('[Main] Edge function call failed:', response.statusCode);
        }

        console.log('[Main] ========== Job Execution Complete ==========');
        toast('작업 완료!');

    } catch (error) {
        checkpoint('99_error', error.message || error.toString());
        console.error('[Main] Job execution failed:', error);
        toast('작업 실패: ' + error.message);

        // 에러 발생 시에도 flag 파일 생성 (Worker가 타임아웃 대기하지 않도록)
        try {
            files.write(JOB_PARAMS.done_flag_path, 'ERROR: ' + error.message);
        } catch (e) {
            // flag 파일 쓰기 실패 무시
        }
    }
}

// UI 스레드에서 메인 실행
ui.run(() => {
    main().catch(error => {
        console.error('[Fatal]', error);
        toast('치명적 오류: ' + error.message);
    });
});

console.log('[Bot] Bot initialized and running...');
