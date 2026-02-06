/**
 * core/AdSkipper.js
 * 광고 스킵 백그라운드 스레드
 * 영상 재생 중 광고가 나타나면 자동으로 스킵
 *
 * @module AdSkipper
 * @version 1.0.0
 */

var AdSkipper = (function() {

    // ==========================================
    // 설정
    // ==========================================
    var CONFIG = {
        CHECK_INTERVAL: 1000,        // 광고 체크 주기 (ms)
        SKIP_BUTTON_TIMEOUT: 1000,   // 스킵 버튼 탐색 타임아웃
        POST_SKIP_DELAY: 1000        // 스킵 후 대기 시간
    };

    // 스레드 상태
    var _skipperThread = null;
    var _isRunning = false;
    var _skipCount = 0;

    // ==========================================
    // 광고 스킵 버튼 탐색 패턴
    // ==========================================
    var SKIP_PATTERNS = [
        // 한국어
        { type: 'textMatches', pattern: /(광고 건너뛰기|건너뛰기)/ },
        { type: 'text', pattern: '광고 건너뛰기' },
        { type: 'text', pattern: '건너뛰기' },
        
        // 영어
        { type: 'textMatches', pattern: /(Skip Ad|Skip Ads|Skip)/ },
        { type: 'text', pattern: 'Skip Ad' },
        { type: 'text', pattern: 'Skip Ads' },
        { type: 'text', pattern: 'Skip' },
        
        // Description 기반
        { type: 'desc', pattern: 'Skip Ad' },
        { type: 'descContains', pattern: 'Skip' },
        { type: 'descContains', pattern: '건너뛰기' },
        
        // ID 기반 (YouTube 앱 내부 ID)
        { type: 'id', pattern: 'skip_ad_button' },
        { type: 'id', pattern: 'ad_skip_button' }
    ];

    // ==========================================
    // 광고 스킵 버튼 찾기
    // ==========================================

    /**
     * 화면에서 광고 스킵 버튼 탐색
     * @returns {object|null} UI 요소 또는 null
     */
    function findSkipButton() {
        for (var i = 0; i < SKIP_PATTERNS.length; i++) {
            var pattern = SKIP_PATTERNS[i];
            var btn = null;

            try {
                switch (pattern.type) {
                    case 'textMatches':
                        if (typeof textMatches !== 'undefined') {
                            btn = textMatches(pattern.pattern).findOne(CONFIG.SKIP_BUTTON_TIMEOUT);
                        }
                        break;
                    case 'text':
                        if (typeof text !== 'undefined') {
                            btn = text(pattern.pattern).findOne(CONFIG.SKIP_BUTTON_TIMEOUT);
                        }
                        break;
                    case 'desc':
                        if (typeof desc !== 'undefined') {
                            btn = desc(pattern.pattern).findOne(CONFIG.SKIP_BUTTON_TIMEOUT);
                        }
                        break;
                    case 'descContains':
                        if (typeof descContains !== 'undefined') {
                            btn = descContains(pattern.pattern).findOne(CONFIG.SKIP_BUTTON_TIMEOUT);
                        }
                        break;
                    case 'id':
                        if (typeof id !== 'undefined') {
                            btn = id(pattern.pattern).findOne(CONFIG.SKIP_BUTTON_TIMEOUT);
                        }
                        break;
                }
            } catch (e) {
                // 탐색 실패 무시
            }

            if (btn) {
                return btn;
            }
        }

        return null;
    }

    // ==========================================
    // 광고 스킵 스레드
    // ==========================================

    /**
     * 광고 스킵 스레드 시작
     * @param {function} onSkip - 스킵 발생 시 콜백 (선택)
     */
    function start(onSkip) {
        if (_isRunning) {
            console.log('[AdSkipper] 이미 실행 중');
            return;
        }

        _isRunning = true;
        _skipCount = 0;

        console.log('[AdSkipper] 광고 스킵 스레드 시작');

        if (typeof threads !== 'undefined') {
            _skipperThread = threads.start(function() {
                while (_isRunning) {
                    try {
                        var skipBtn = findSkipButton();
                        
                        if (skipBtn) {
                            console.log('[AdSkipper] 광고 스킵 버튼 감지!');
                            skipBtn.click();
                            _skipCount++;
                            
                            if (typeof onSkip === 'function') {
                                onSkip(_skipCount);
                            }
                            
                            if (typeof sleep !== 'undefined') {
                                sleep(CONFIG.POST_SKIP_DELAY);
                            }
                        }
                    } catch (e) {
                        // 에러 무시 (스레드 안정성)
                    }

                    if (typeof sleep !== 'undefined') {
                        sleep(CONFIG.CHECK_INTERVAL);
                    }
                }
                console.log('[AdSkipper] 스레드 종료');
            });
        } else {
            console.log('[AdSkipper] threads 모듈 없음 - 스레드 미지원');
            _isRunning = false;
        }
    }

    /**
     * 광고 스킵 스레드 중지
     */
    function stop() {
        _isRunning = false;
        
        if (_skipperThread) {
            try {
                _skipperThread.interrupt();
            } catch (e) {
                // 인터럽트 실패 무시
            }
            _skipperThread = null;
        }

        console.log('[AdSkipper] 중지됨. 총 스킵 횟수: ' + _skipCount);
    }

    /**
     * 즉시 한 번 스킵 시도
     * @returns {boolean} 스킵 성공 여부
     */
    function trySkipOnce() {
        var skipBtn = findSkipButton();
        if (skipBtn) {
            skipBtn.click();
            _skipCount++;
            console.log('[AdSkipper] 즉시 스킵 성공');
            return true;
        }
        return false;
    }

    // ==========================================
    // 상태 조회
    // ==========================================

    /**
     * 실행 상태 확인
     * @returns {boolean}
     */
    function isRunning() {
        return _isRunning;
    }

    /**
     * 스킵 횟수 조회
     * @returns {number}
     */
    function getSkipCount() {
        return _skipCount;
    }

    // ==========================================
    // Public API
    // ==========================================
    return {
        start: start,
        stop: stop,
        trySkipOnce: trySkipOnce,
        isRunning: isRunning,
        getSkipCount: getSkipCount,
        CONFIG: CONFIG
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = AdSkipper;
}
