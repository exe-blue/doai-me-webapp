"ui";

/**
 * MOB-01: WebView Setup Module
 * WebView 초기화 및 JavaScript Interface 설정
 */

/**
 * WebView UI 레이아웃 생성
 * - 전체 화면 WebView 컴포넌트 배치
 * - w="*" h="*" 로 화면 전체 사용
 */
function createWebViewLayout() {
    ui.layout(
        <vertical>
            <webview id="webView" layout_weight="1" w="*" h="*"/>
        </vertical>
    );
}

/**
 * WebView 설정 초기화
 * @param {WebView} webView - AutoX.js WebView 객체
 */
function configureWebView(webView) {
    const settings = webView.getSettings();

    // JavaScript 활성화 (DOM 제어를 위해 필수)
    settings.setJavaScriptEnabled(true);

    // DOM Storage 활성화 (YouTube SPA 동작에 필요)
    settings.setDomStorageEnabled(true);

    // 캐시 비활성화 (항상 최신 콘텐츠 로드)
    settings.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);

    // User Agent 설정 (모바일 YouTube 페이지 로드 유도)
    // Chrome 120+ 버전 사용 (봇 탐지 회피)
    settings.setUserAgentString(
        "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );

    // 미디어 자동 재생 허용
    settings.setMediaPlaybackRequiresUserGesture(false);
}

/**
 * JavaScript Interface 등록
 * - WebView -> AutoX.js 양방향 통신 브릿지
 * @param {WebView} webView - WebView 객체
 */
function setupJavaScriptInterface(webView) {
    /**
     * JavaScriptInterface 클래스
     * WebView 내 JavaScript에서 window.AndroidBridge로 접근 가능
     */
    const AndroidBridge = {
        /**
         * 로그 메시지를 AutoX.js 콘솔로 전달
         * @param {string} message - 로그 메시지
         */
        log: function(message) {
            console.log("[WebView Log]", message);
        },

        /**
         * 에러 메시지를 AutoX.js 콘솔로 전달
         * @param {string} error - 에러 메시지
         */
        error: function(error) {
            console.error("[WebView Error]", error);
        },

        /**
         * 페이지 로드 완료 알림
         * @param {string} url - 로드된 페이지 URL
         */
        onPageLoaded: function(url) {
            console.log("[WebView] Page loaded:", url);
        },

        /**
         * 동영상 재생 시작 알림
         * @param {string} videoId - YouTube 동영상 ID
         */
        onVideoStarted: function(videoId) {
            console.log("[WebView] Video started:", videoId);
        },

        /**
         * 동영상 진행률 보고
         * @param {number} percentage - 재생 진행률 (0-100)
         * @param {number} currentTime - 현재 재생 시간 (초)
         * @param {number} duration - 전체 동영상 길이 (초)
         */
        onVideoProgress: function(percentage, currentTime, duration) {
            console.log(`[WebView] Video progress: ${percentage}% (${currentTime}s / ${duration}s)`);
        }
    };

    // WebView에 JavaScriptInterface 등록
    // WebView 내에서 window.AndroidBridge.log("message") 형태로 호출 가능
    webView.addJavascriptInterface(AndroidBridge, "AndroidBridge");
}

/**
 * WebView 페이지 로드 완료 이벤트 핸들러 설정
 * @param {WebView} webView - WebView 객체
 * @param {function} callback - 로드 완료 시 실행할 콜백 함수
 */
function setPageLoadListener(webView, callback) {
    webView.setWebViewClient(new android.webkit.WebViewClient({
        onPageFinished: function(view, url) {
            console.log("[WebView] Page finished loading:", url);
            if (callback && typeof callback === 'function') {
                callback(url);
            }
        },

        onReceivedError: function(view, request, error) {
            console.error("[WebView] Page load error:", error.getDescription());
        }
    }));
}

/**
 * WebView 콘솔 메시지 리스너 설정 (디버깅용)
 * @param {WebView} webView - WebView 객체
 */
function setConsoleMessageListener(webView) {
    webView.setWebChromeClient(new android.webkit.WebChromeClient({
        onConsoleMessage: function(consoleMessage) {
            const level = consoleMessage.messageLevel();
            const message = consoleMessage.message();
            const source = consoleMessage.sourceId();
            const line = consoleMessage.lineNumber();

            console.log(`[WebView Console] [${level}] ${message} (${source}:${line})`);
            return true;
        }
    }));
}

/**
 * WebView 초기화 메인 함수
 * @returns {object} - { webView, loadUrl, evaluateJS }
 */
function initializeWebView() {
    // 1. UI 레이아웃 생성
    createWebViewLayout();

    // 2. WebView 컴포넌트 참조
    const webView = ui.webView;

    // 3. WebView 설정
    configureWebView(webView);

    // 4. JavaScript Interface 등록
    setupJavaScriptInterface(webView);

    // 5. 콘솔 메시지 리스너 설정
    setConsoleMessageListener(webView);

    // 6. 페이지 로드 리스너 설정 (기본 핸들러)
    setPageLoadListener(webView, (url) => {
        // 페이지 로드 완료 시 AndroidBridge.onPageLoaded 호출
        webView.evaluateJavascript(
            `if (window.AndroidBridge) { window.AndroidBridge.onPageLoaded('${url}'); }`,
            null
        );
    });

    /**
     * URL 로드 헬퍼 함수
     * @param {string} url - 로드할 URL
     * @param {function} callback - 로드 완료 콜백 (선택사항)
     */
    const loadUrl = function(url, callback) {
        if (callback) {
            setPageLoadListener(webView, callback);
        }
        webView.loadUrl(url);
        console.log("[WebView] Loading URL:", url);
    };

    /**
     * JavaScript 실행 헬퍼 함수
     * @param {string} jsCode - 실행할 JavaScript 코드
     * @param {function} callback - 실행 결과 콜백 (선택사항)
     */
    const evaluateJS = function(jsCode, callback) {
        webView.evaluateJavascript(jsCode, callback || null);
    };

    console.log("[MOB-01] WebView initialized successfully");

    return {
        webView: webView,
        loadUrl: loadUrl,
        evaluateJS: evaluateJS
    };
}

// 모듈 Export
module.exports = {
    initializeWebView: initializeWebView,
    createWebViewLayout: createWebViewLayout,
    configureWebView: configureWebView,
    setupJavaScriptInterface: setupJavaScriptInterface,
    setPageLoadListener: setPageLoadListener,
    setConsoleMessageListener: setConsoleMessageListener
};
