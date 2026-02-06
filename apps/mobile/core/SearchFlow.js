/**
 * core/SearchFlow.js
 * 키워드 검색 워크플로우
 * YouTube 검색 → 영상 찾기 → 클릭
 *
 * @module SearchFlow
 * @version 1.0.0
 */

var SearchFlow = (function() {

    // ==========================================
    // 설정
    // ==========================================
    var CONFIG = {
        MAX_SCROLL_ATTEMPTS: 10,     // 최대 스크롤 횟수
        SEARCH_TIMEOUT: 5000,        // 검색 버튼 탐색 타임아웃
        VIDEO_FIND_TIMEOUT: 2000,    // 영상 탐색 타임아웃
        SCROLL_DELAY_MIN: 1500,      // 스크롤 후 최소 대기
        SCROLL_DELAY_MAX: 3000       // 스크롤 후 최대 대기
    };
    
    // Logger 참조 (외부에서 주입)
    var _Logger = null;
    
    function setLogger(logger) {
        _Logger = logger;
    }
    
    function _log(step, msg) {
        if (_Logger) {
            _Logger.step(step, msg);
        } else {
            console.log('[SearchFlow] [Step ' + step + '] ' + msg);
        }
    }

    // ==========================================
    // URL 보정
    // ==========================================

    /**
     * youtu.be 단축 URL을 youtube.com 형식으로 변환
     * @param {string} url - 원본 URL
     * @returns {string} 변환된 URL
     */
    function normalizeUrl(url) {
        if (!url) return url;
        
        if (url.includes('youtu.be/')) {
            var videoId = url.split('youtu.be/')[1];
            if (videoId) {
                // 쿼리 파라미터 제거
                videoId = videoId.split('?')[0].split('&')[0];
                return 'https://www.youtube.com/watch?v=' + videoId;
            }
        }
        
        // m.youtube.com -> www.youtube.com
        if (url.includes('m.youtube.com')) {
            return url.replace('m.youtube.com', 'www.youtube.com');
        }
        
        return url;
    }

    // ==========================================
    // 검색 실행
    // ==========================================

    /**
     * YouTube 검색 실행
     * @param {string} keyword - 검색 키워드
     * @returns {boolean} 성공 여부
     */
    function performSearch(keyword) {
        if (!keyword || keyword.trim() === '') {
            console.log('[SearchFlow] 키워드 없음');
            return false;
        }

        console.log('[SearchFlow] 검색 시작: ' + keyword);

        // 검색 버튼 찾기
        var searchIcon = null;

        // 방법 1: id로 찾기
        if (typeof id !== 'undefined') {
            searchIcon = id('menu_item_search').findOne(CONFIG.SEARCH_TIMEOUT);
        }

        // 방법 2: description으로 찾기
        if (!searchIcon && typeof desc !== 'undefined') {
            searchIcon = desc('Search').findOne(3000);
            if (!searchIcon) {
                searchIcon = desc('검색').findOne(2000);
            }
        }

        if (!searchIcon) {
            console.log('[SearchFlow] 검색 버튼을 찾을 수 없음');
            return false;
        }

        // 검색 버튼 클릭
        searchIcon.click();
        _randomDelay(1000, 2000);

        // 검색어 입력
        if (typeof setText !== 'undefined') {
            setText(keyword);
        } else if (typeof className !== 'undefined') {
            var editText = className('EditText').findOne(3000);
            if (editText) {
                editText.setText(keyword);
            }
        }
        
        _randomDelay(1000, 2000);

        // Enter 키 입력 (검색 실행)
        if (typeof press !== 'undefined') {
            press(66, 1); // KEYCODE_ENTER
        } else if (typeof KeyEvent !== 'undefined') {
            KeyEvent(66);
        }

        _randomDelay(2000, 3000);
        console.log('[SearchFlow] 검색 완료');
        return true;
    }

    // ==========================================
    // 영상 찾기
    // ==========================================

    /**
     * 검색 결과에서 타겟 영상 찾기 및 클릭
     * @param {string} videoTitle - 찾을 영상 제목 (부분 일치)
     * @returns {boolean} 성공 여부
     */
    function findAndClickVideo(videoTitle) {
        if (!videoTitle) {
            console.log('[SearchFlow] 영상 제목 없음');
            return false;
        }

        console.log('[SearchFlow] 영상 탐색: ' + videoTitle);

        // 제목의 앞부분만 사용 (부분 일치)
        var searchText = videoTitle.length > 15 
            ? videoTitle.substring(0, 15) 
            : videoTitle;

        var targetVideo = null;

        for (var i = 0; i < CONFIG.MAX_SCROLL_ATTEMPTS; i++) {
            console.log('[SearchFlow] 스크롤 탐색 ' + (i + 1) + '/' + CONFIG.MAX_SCROLL_ATTEMPTS);

            // 방법 1: textContains로 찾기
            if (typeof textContains !== 'undefined') {
                targetVideo = textContains(searchText).findOne(CONFIG.VIDEO_FIND_TIMEOUT);
            }

            // 방법 2: descContains로 찾기
            if (!targetVideo && typeof descContains !== 'undefined') {
                targetVideo = descContains(searchText).findOne(1000);
            }

            if (targetVideo) {
                console.log('[SearchFlow] 영상 발견!');
                
                // 부모 뷰 클릭 (썸네일 영역)
                var clickTarget = targetVideo.parent();
                if (clickTarget) {
                    clickTarget.click();
                } else {
                    targetVideo.click();
                }
                
                _randomDelay(5000, 8000); // 영상 로딩 대기
                console.log('[SearchFlow] 영상 클릭 완료');
                return true;
            }

            // 스크롤 다운
            if (typeof scrollDown !== 'undefined') {
                scrollDown();
            } else if (typeof swipe !== 'undefined' && typeof device !== 'undefined') {
                swipe(
                    device.width / 2,
                    device.height * 0.7,
                    device.width / 2,
                    device.height * 0.3,
                    500
                );
            }

            _randomDelay(CONFIG.SCROLL_DELAY_MIN, CONFIG.SCROLL_DELAY_MAX);
        }

        console.log('[SearchFlow] 영상을 찾지 못함');
        return false;
    }

    // ==========================================
    // URL 직접 진입 (Fallback)
    // ==========================================

    /**
     * URL로 직접 영상 진입
     * @param {string} videoUrl - 영상 URL
     * @returns {boolean} 성공 여부
     */
    function openVideoByUrl(videoUrl) {
        if (!videoUrl) return false;

        var normalizedUrl = normalizeUrl(videoUrl);
        console.log('[SearchFlow] URL 직접 진입: ' + normalizedUrl);

        if (typeof app !== 'undefined') {
            app.startActivity({
                action: 'android.intent.action.VIEW',
                data: normalizedUrl,
                packageName: 'com.google.android.youtube'
            });
            _randomDelay(5000, 8000);
            return true;
        }

        return false;
    }

    // ==========================================
    // 전체 검색 플로우
    // ==========================================

    /**
     * 검색 → 영상 찾기 → 클릭 (실패 시 URL Fallback)
     * @param {object} options - 옵션
     * @param {string} options.keyword - 검색 키워드
     * @param {string} options.videoTitle - 영상 제목
     * @param {string} options.videoUrl - Fallback URL
     * @returns {object} { success, method: 'search'|'url' }
     */
    function executeSearchFlow(options) {
        var keyword = options.keyword;
        var videoTitle = options.videoTitle;
        var videoUrl = options.videoUrl;

        // 키워드가 없으면 제목 사용
        if (!keyword || keyword.trim() === '') {
            keyword = videoTitle;
            console.log('[SearchFlow] 키워드 없음 → 제목을 키워드로 사용');
        }

        // 1. 검색 시도
        if (keyword && performSearch(keyword)) {
            // 2. 영상 찾기 및 클릭
            if (findAndClickVideo(videoTitle || keyword)) {
                return { success: true, method: 'search' };
            }
        }

        // 3. 실패 시 URL 직접 진입
        console.log('[SearchFlow] 검색 실패 → URL Fallback');
        if (videoUrl && openVideoByUrl(videoUrl)) {
            return { success: true, method: 'url' };
        }

        return { success: false, method: null };
    }

    // ==========================================
    // 유틸리티
    // ==========================================

    /**
     * 랜덤 대기 (+3000ms 범위 추가로 노드별 다른 대기시간)
     * @param {number} min - 최소 대기시간 (ms)
     * @param {number} max - 최대 대기시간 (ms)
     * @returns {number} 실제 대기시간
     */
    function _randomDelay(min, max) {
        // +3000ms 랜덤 범위 추가
        var extendedMax = max + 3000;
        var delay = Math.floor(Math.random() * (extendedMax - min + 1)) + min;
        if (typeof sleep !== 'undefined') {
            sleep(delay);
        }
        return delay;
    }

    // ==========================================
    // Public API
    // ==========================================
    return {
        // Logger 설정
        setLogger: setLogger,
        
        // 개별 함수
        normalizeUrl: normalizeUrl,
        performSearch: performSearch,
        findAndClickVideo: findAndClickVideo,
        openVideoByUrl: openVideoByUrl,

        // 통합 플로우
        executeSearchFlow: executeSearchFlow,

        // 설정
        CONFIG: CONFIG
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = SearchFlow;
}
