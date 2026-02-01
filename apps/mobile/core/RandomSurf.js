/**
 * core/RandomSurf.js
 * 랜덤 피드 서핑 (Warm-up / Cool-down)
 * 자연스러운 시청 패턴 시뮬레이션
 *
 * @module RandomSurf
 * @version 1.0.0
 */

var RandomSurf = (function() {

    // ==========================================
    // 설정
    // ==========================================
    var CONFIG = {
        FEED_WATCH_MIN: 30000,       // 피드 영상 최소 시청 시간 (ms)
        FEED_WATCH_MAX: 60000,       // 피드 영상 최대 시청 시간 (ms)
        MAX_FEED_VIDEOS: 3,          // 최대 피드 영상 시청 수
        FALLBACK_KEYWORDS: ['투자', '뉴스', '음악', '요리', '게임'],
        NAVIGATION_TIMEOUT: 3000
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
            console.log('[RandomSurf] [Step ' + step + '] ' + msg);
        }
    }

    // ==========================================
    // 플레이어 최소화
    // ==========================================

    /**
     * 미니 플레이어로 축소
     * @returns {boolean} 성공 여부
     */
    function minimizePlayer() {
        console.log('[RandomSurf] 플레이어 최소화 시도');

        // 방법 1: 축소 버튼 클릭
        if (typeof desc !== 'undefined') {
            var minimizeBtn = desc('축소').findOne(2000);
            if (!minimizeBtn) {
                minimizeBtn = desc('Minimize').findOne(1000);
            }
            if (minimizeBtn) {
                minimizeBtn.click();
                _randomDelay(1000, 2000);
                return true;
            }
        }

        // 방법 2: 아래로 스와이프
        if (typeof swipe !== 'undefined' && typeof device !== 'undefined') {
            swipe(
                device.width / 2,
                device.height * 0.3,
                device.width / 2,
                device.height * 0.8,
                300
            );
            _randomDelay(1000, 2000);
            return true;
        }

        // 방법 3: 뒤로가기
        if (typeof back !== 'undefined') {
            back();
            _randomDelay(1000, 2000);
            return true;
        }

        return false;
    }

    // ==========================================
    // 홈 탭 이동
    // ==========================================

    /**
     * YouTube 홈 탭으로 이동
     * @returns {boolean} 성공 여부
     */
    function goToHome() {
        console.log('[RandomSurf] 홈 탭 이동');

        // 방법 1: 홈 탭 클릭
        if (typeof desc !== 'undefined') {
            var homeTab = desc('홈').findOne(CONFIG.NAVIGATION_TIMEOUT);
            if (!homeTab && typeof text !== 'undefined') {
                homeTab = text('Home').findOne(2000);
            }
            if (homeTab) {
                homeTab.click();
                _randomDelay(2000, 3000);
                return true;
            }
        }

        // 방법 2: ID로 찾기
        if (typeof id !== 'undefined') {
            var homeBtn = id('home').findOne(2000);
            if (homeBtn) {
                homeBtn.click();
                _randomDelay(2000, 3000);
                return true;
            }
        }

        console.log('[RandomSurf] 홈 탭을 찾을 수 없음');
        return false;
    }

    // ==========================================
    // 피드 영상 선택
    // ==========================================

    /**
     * 피드에서 랜덤 영상 선택
     * @param {number} maxRank - 최대 순위 (0부터 시작)
     * @returns {boolean} 성공 여부
     */
    function selectRandomFeedVideo(maxRank) {
        maxRank = maxRank || 4; // 기본: 상위 5개 중 선택

        console.log('[RandomSurf] 피드 영상 탐색 (상위 ' + (maxRank + 1) + '개)');

        // 영상 썸네일 리스트 찾기
        var feedVideos = [];

        // 방법 1: 시간 표시가 있는 요소 찾기 ('분 전', 'minutes ago' 등)
        if (typeof descContains !== 'undefined') {
            var videos1 = descContains('분 전').find();
            if (videos1 && videos1.length > 0) {
                feedVideos = videos1;
            }
            if (feedVideos.length === 0) {
                var videos2 = descContains('ago').find();
                if (videos2 && videos2.length > 0) {
                    feedVideos = videos2;
                }
            }
        }

        // 방법 2: className으로 영상 카드 찾기
        if (feedVideos.length === 0 && typeof className !== 'undefined') {
            var viewGroups = className('android.view.ViewGroup').find();
            // 특정 크기 이상의 뷰만 필터링 (썸네일 추정)
            for (var i = 0; i < viewGroups.length && feedVideos.length < 10; i++) {
                var vg = viewGroups[i];
                var bounds = vg.bounds();
                if (bounds && bounds.width() > 200 && bounds.height() > 100) {
                    feedVideos.push(vg);
                }
            }
        }

        if (feedVideos.length === 0) {
            console.log('[RandomSurf] 피드 영상을 찾을 수 없음');
            return false;
        }

        // 랜덤 선택
        var targetIndex = Math.floor(Math.random() * Math.min(maxRank + 1, feedVideos.length));
        var targetVideo = feedVideos[targetIndex];

        console.log('[RandomSurf] 영상 선택 (인덱스: ' + targetIndex + '/' + feedVideos.length + ')');
        
        try {
            targetVideo.click();
            _randomDelay(3000, 5000); // 영상 로딩 대기
            return true;
        } catch (e) {
            console.log('[RandomSurf] 영상 클릭 실패: ' + e.message);
            return false;
        }
    }

    // ==========================================
    // Fallback 검색
    // ==========================================

    /**
     * 피드가 없을 경우 키워드 검색으로 영상 찾기
     * @returns {boolean} 성공 여부
     */
    function searchFallback() {
        var keyword = CONFIG.FALLBACK_KEYWORDS[
            Math.floor(Math.random() * CONFIG.FALLBACK_KEYWORDS.length)
        ];

        console.log('[RandomSurf] Fallback 검색: ' + keyword);

        // 검색 버튼 찾기
        var searchIcon = null;
        if (typeof id !== 'undefined') {
            searchIcon = id('menu_item_search').findOne(3000);
        }
        if (!searchIcon && typeof desc !== 'undefined') {
            searchIcon = desc('Search').findOne(2000);
            if (!searchIcon) {
                searchIcon = desc('검색').findOne(2000);
            }
        }

        if (!searchIcon) {
            console.log('[RandomSurf] 검색 버튼을 찾을 수 없음');
            return false;
        }

        searchIcon.click();
        _randomDelay(1000, 2000);

        if (typeof setText !== 'undefined') {
            setText(keyword);
        }
        _randomDelay(1000, 2000);

        if (typeof press !== 'undefined') {
            press(66, 1); // Enter
        }
        _randomDelay(2000, 3000);

        // 첫 번째 결과 클릭
        return selectRandomFeedVideo(2);
    }

    // ==========================================
    // 피드 시청
    // ==========================================

    /**
     * 피드 영상 랜덤 시간 시청
     * @param {number} minMs - 최소 시청 시간
     * @param {number} maxMs - 최대 시청 시간
     * @returns {number} 실제 시청 시간 (ms)
     */
    function watchFeedVideo(minMs, maxMs) {
        minMs = minMs || CONFIG.FEED_WATCH_MIN;
        maxMs = maxMs || CONFIG.FEED_WATCH_MAX;

        var watchTime = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        console.log('[RandomSurf] 피드 시청: ' + (watchTime / 1000).toFixed(1) + '초');

        if (typeof sleep !== 'undefined') {
            sleep(watchTime);
        }

        return watchTime;
    }

    // ==========================================
    // 전체 서핑 플로우
    // ==========================================

    /**
     * 랜덤 서핑 실행
     * @param {object} options - 옵션
     * @param {number} options.videoCount - 시청할 피드 영상 수 (기본: 1)
     * @param {number} options.watchTimeMin - 최소 시청 시간 (ms)
     * @param {number} options.watchTimeMax - 최대 시청 시간 (ms)
     * @returns {object} { success, videosWatched, totalWatchTime }
     */
    function executeSurfFlow(options) {
        options = options || {};
        var videoCount = options.videoCount || 1;
        var watchTimeMin = options.watchTimeMin || CONFIG.FEED_WATCH_MIN;
        var watchTimeMax = options.watchTimeMax || CONFIG.FEED_WATCH_MAX;

        console.log('[RandomSurf] 서핑 시작 (목표: ' + videoCount + '개)');

        var result = {
            success: false,
            videosWatched: 0,
            totalWatchTime: 0
        };

        // 1. 플레이어 최소화
        minimizePlayer();

        // 2. 홈으로 이동
        var homeSuccess = goToHome();

        for (var i = 0; i < videoCount; i++) {
            console.log('[RandomSurf] 영상 ' + (i + 1) + '/' + videoCount);

            // 3. 피드 영상 선택
            var selected = false;
            if (homeSuccess) {
                selected = selectRandomFeedVideo(4);
            }

            // 4. 실패 시 Fallback 검색
            if (!selected) {
                selected = searchFallback();
            }

            if (selected) {
                // 5. 시청
                var watchTime = watchFeedVideo(watchTimeMin, watchTimeMax);
                result.videosWatched++;
                result.totalWatchTime += watchTime;

                // 다음 영상을 위해 뒤로가기
                if (i < videoCount - 1) {
                    minimizePlayer();
                    _randomDelay(1000, 2000);
                }
            }
        }

        result.success = result.videosWatched > 0;
        console.log('[RandomSurf] 완료. 시청: ' + result.videosWatched + '개, 총 시간: ' + (result.totalWatchTime / 1000).toFixed(1) + '초');

        return result;
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
        minimizePlayer: minimizePlayer,
        goToHome: goToHome,
        selectRandomFeedVideo: selectRandomFeedVideo,
        searchFallback: searchFallback,
        watchFeedVideo: watchFeedVideo,

        // 통합 플로우
        executeSurfFlow: executeSurfFlow,

        // 설정
        CONFIG: CONFIG
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = RandomSurf;
}
