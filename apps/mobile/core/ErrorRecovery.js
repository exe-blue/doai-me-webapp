/**
 * core/ErrorRecovery.js
 * 에러 복구 및 장애 대응 모듈
 *
 * 주요 기능:
 * - 앱 크래시 감지 및 복구
 * - 네트워크 단절 처리
 * - 재생 교착 상태 감지
 * - 재시도 로직 (exponential backoff)
 * - 로컬 상태 저장/복원
 *
 * @module ErrorRecovery
 */

var ErrorRecovery = (function() {
    var BASE_PATH = '/sdcard/Scripts/doai-bot';

    // 에러 코드 정의
    var ErrorCodes = {
        // Network (E1xxx)
        NETWORK_DISCONNECTED: 'E1001',
        REQUEST_TIMEOUT: 'E1002',
        RATE_LIMITED: 'E1003',

        // YouTube (E2xxx)
        VIDEO_UNAVAILABLE: 'E2001',
        VIDEO_REGION_BLOCKED: 'E2002',
        VIDEO_AGE_RESTRICTED: 'E2003',
        PLAYBACK_STALLED: 'E2004',

        // Device (E3xxx)
        APP_CRASH: 'E3001',
        MEMORY_LOW: 'E3002',
        SCREEN_LOCKED: 'E3003',
        BATTERY_LOW: 'E3004',

        // System (E4xxx)
        UNKNOWN: 'E4001'
    };

    // 재시도 가능 에러 목록
    var RETRYABLE_ERRORS = [
        ErrorCodes.NETWORK_DISCONNECTED,
        ErrorCodes.REQUEST_TIMEOUT,
        ErrorCodes.RATE_LIMITED,
        ErrorCodes.PLAYBACK_STALLED,
        ErrorCodes.APP_CRASH,
        ErrorCodes.SCREEN_LOCKED,
        ErrorCodes.UNKNOWN
    ];

    // 재시도 불가 에러 (즉시 실패 처리)
    var NON_RETRYABLE_ERRORS = [
        ErrorCodes.VIDEO_UNAVAILABLE,
        ErrorCodes.VIDEO_REGION_BLOCKED,
        ErrorCodes.MEMORY_LOW,
        ErrorCodes.BATTERY_LOW
    ];

    // 최대 재시도 횟수
    var MAX_RETRY_COUNT = 3;

    // 상태 저장 경로
    var STATE_FILE = BASE_PATH + '/recovery_state.json';

    // 현재 복구 상태
    var recoveryState = {
        assignmentId: null,
        progress: 0,
        retryCount: 0,
        lastError: null,
        savedAt: null
    };

    // ==========================================
    // 에러 분류 및 판단
    // ==========================================

    /**
     * 에러 코드로 재시도 가능 여부 확인
     * @param {string} errorCode
     * @returns {boolean}
     */
    function isRetryable(errorCode) {
        return RETRYABLE_ERRORS.indexOf(errorCode) !== -1;
    }

    /**
     * 에러 코드로 즉시 실패 여부 확인
     * @param {string} errorCode
     * @returns {boolean}
     */
    function shouldFailImmediately(errorCode) {
        return NON_RETRYABLE_ERRORS.indexOf(errorCode) !== -1;
    }

    /**
     * 재시도 가능 횟수 확인
     * @param {number} currentRetryCount
     * @returns {boolean}
     */
    function canRetry(currentRetryCount) {
        return currentRetryCount < MAX_RETRY_COUNT;
    }

    /**
     * 재시도 대기 시간 계산 (exponential backoff)
     * @param {number} retryCount - 현재 재시도 횟수 (0-based)
     * @returns {number} 대기 시간 (ms)
     */
    function getRetryDelay(retryCount) {
        // 5초, 10초, 20초, 40초, 60초(max)
        var delay = 5000 * Math.pow(2, retryCount);
        return Math.min(delay, 60000);
    }

    // ==========================================
    // 앱 크래시 감지 및 복구
    // ==========================================

    /**
     * YouTube 앱 실행 상태 확인
     * @returns {boolean}
     */
    function isYouTubeRunning() {
        if (typeof currentPackage !== 'undefined') {
            var pkg = currentPackage();
            return pkg === 'com.google.android.youtube';
        }

        // AutoX.js 환경
        if (typeof app !== 'undefined' && app.getPackageName) {
            try {
                var topPkg = app.getPackageName('com.google.android.youtube');
                return topPkg !== null;
            } catch (e) {
                return false;
            }
        }

        return true; // 확인 불가 시 실행 중으로 가정
    }

    /**
     * YouTube 앱 강제 종료
     */
    function forceStopYouTube() {
        console.log('[ErrorRecovery] YouTube 앱 강제 종료');

        if (typeof shell !== 'undefined') {
            shell('am force-stop com.google.android.youtube', true);
        }

        // 3초 대기
        if (typeof sleep !== 'undefined') {
            sleep(3000);
        }
    }

    /**
     * YouTube 앱 캐시 정리
     */
    function clearYouTubeCache() {
        console.log('[ErrorRecovery] YouTube 캐시 정리');

        if (typeof shell !== 'undefined') {
            shell('pm clear com.google.android.youtube', true);
        }
    }

    /**
     * YouTube 앱 재시작
     * @returns {boolean} 성공 여부
     */
    function restartYouTube() {
        console.log('[ErrorRecovery] YouTube 앱 재시작');

        forceStopYouTube();

        if (typeof app !== 'undefined' && app.launch) {
            app.launch('com.google.android.youtube');

            if (typeof sleep !== 'undefined') {
                sleep(5000); // 앱 로딩 대기
            }

            return isYouTubeRunning();
        }

        return false;
    }

    /**
     * 앱 크래시 복구 시도
     * @param {number} retryCount
     * @returns {object} { success, shouldRetry, newRetryCount }
     */
    function recoverFromCrash(retryCount) {
        console.log('[ErrorRecovery] 앱 크래시 복구 시도 (시도:', retryCount + 1 + ')');

        if (!canRetry(retryCount)) {
            console.log('[ErrorRecovery] 최대 재시도 횟수 초과');
            return { success: false, shouldRetry: false, newRetryCount: retryCount };
        }

        // 1. 앱 재시작
        var restarted = restartYouTube();

        if (restarted) {
            console.log('[ErrorRecovery] 앱 재시작 성공');
            return { success: true, shouldRetry: true, newRetryCount: retryCount + 1 };
        }

        // 2. 캐시 정리 후 재시도 (2회 이상 실패 시)
        if (retryCount >= 1) {
            console.log('[ErrorRecovery] 캐시 정리 후 재시도');
            clearYouTubeCache();

            if (typeof sleep !== 'undefined') {
                sleep(2000);
            }

            restarted = restartYouTube();
        }

        return {
            success: restarted,
            shouldRetry: restarted,
            newRetryCount: retryCount + 1
        };
    }

    // ==========================================
    // 네트워크 단절 처리
    // ==========================================

    /**
     * 네트워크 연결 상태 확인
     * @returns {boolean}
     */
    function isNetworkAvailable() {
        // AutoX.js 환경
        if (typeof device !== 'undefined' && device.isConnected) {
            return device.isConnected();
        }

        // shell 명령으로 확인
        if (typeof shell !== 'undefined') {
            try {
                var result = shell('ping -c 1 -W 2 8.8.8.8', true);
                return result.code === 0;
            } catch (e) {
                return false;
            }
        }

        return true; // 확인 불가 시 연결됨으로 가정
    }

    /**
     * 네트워크 복구 대기
     * @param {number} maxWaitMs - 최대 대기 시간
     * @param {number} checkIntervalMs - 확인 간격
     * @returns {boolean} 복구 성공 여부
     */
    function waitForNetwork(maxWaitMs, checkIntervalMs) {
        maxWaitMs = maxWaitMs || 300000; // 5분
        checkIntervalMs = checkIntervalMs || 10000; // 10초

        console.log('[ErrorRecovery] 네트워크 복구 대기 (최대', maxWaitMs / 1000 + '초)');

        var startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            if (isNetworkAvailable()) {
                console.log('[ErrorRecovery] 네트워크 복구됨');
                return true;
            }

            if (typeof sleep !== 'undefined') {
                sleep(checkIntervalMs);
            } else {
                break; // Node.js 환경에서는 즉시 반환
            }
        }

        console.log('[ErrorRecovery] 네트워크 복구 타임아웃');
        return false;
    }

    // ==========================================
    // 재생 교착 상태 감지
    // ==========================================

    /**
     * 재생 교착 상태 모니터 생성
     * @param {number} timeoutMs - 교착 판정 시간
     * @returns {object} 모니터 객체
     */
    function createStallMonitor(timeoutMs) {
        timeoutMs = timeoutMs || 120000; // 2분

        return {
            lastProgress: 0,
            lastUpdateTime: Date.now(),
            timeoutMs: timeoutMs,

            /**
             * 진행률 업데이트
             * @param {number} progress
             */
            update: function(progress) {
                if (progress !== this.lastProgress) {
                    this.lastProgress = progress;
                    this.lastUpdateTime = Date.now();
                }
            },

            /**
             * 교착 상태 확인
             * @returns {boolean}
             */
            isStalled: function() {
                return Date.now() - this.lastUpdateTime > this.timeoutMs;
            },

            /**
             * 경과 시간 반환
             * @returns {number} ms
             */
            getElapsedSinceUpdate: function() {
                return Date.now() - this.lastUpdateTime;
            },

            /**
             * 리셋
             */
            reset: function() {
                this.lastProgress = 0;
                this.lastUpdateTime = Date.now();
            }
        };
    }

    // ==========================================
    // 로컬 상태 저장/복원
    // ==========================================

    /**
     * 복구 상태 저장
     * @param {object} state - 저장할 상태
     */
    function saveRecoveryState(state) {
        recoveryState = {
            assignmentId: state.assignmentId || null,
            progress: state.progress || 0,
            retryCount: state.retryCount || 0,
            lastError: state.lastError || null,
            savedAt: new Date().toISOString()
        };

        try {
            var content = JSON.stringify(recoveryState, null, 2);

            if (typeof files !== 'undefined' && files.write) {
                files.write(STATE_FILE, content);
                console.log('[ErrorRecovery] 복구 상태 저장:', STATE_FILE);
            }
        } catch (e) {
            console.error('[ErrorRecovery] 상태 저장 실패:', e);
        }
    }

    /**
     * 복구 상태 로드
     * @returns {object|null}
     */
    function loadRecoveryState() {
        try {
            if (typeof files !== 'undefined' && files.exists(STATE_FILE)) {
                var content = files.read(STATE_FILE);
                recoveryState = JSON.parse(content);
                console.log('[ErrorRecovery] 복구 상태 로드:', recoveryState.assignmentId);
                return recoveryState;
            }
        } catch (e) {
            console.error('[ErrorRecovery] 상태 로드 실패:', e);
        }

        return null;
    }

    /**
     * 복구 상태 삭제
     */
    function clearRecoveryState() {
        recoveryState = {
            assignmentId: null,
            progress: 0,
            retryCount: 0,
            lastError: null,
            savedAt: null
        };

        try {
            if (typeof files !== 'undefined' && files.exists(STATE_FILE)) {
                files.remove(STATE_FILE);
                console.log('[ErrorRecovery] 복구 상태 삭제');
            }
        } catch (e) {
            console.error('[ErrorRecovery] 상태 삭제 실패:', e);
        }
    }

    // ==========================================
    // 통합 에러 핸들러
    // ==========================================

    /**
     * 에러 처리 및 복구 결정
     * @param {string} errorCode - 에러 코드
     * @param {object} context - 현재 컨텍스트
     * @returns {object} { action, delay, newRetryCount }
     *   action: 'retry' | 'fail' | 'wait_network' | 'restart_app'
     */
    function handleError(errorCode, context) {
        context = context || {};
        var retryCount = context.retryCount || 0;

        console.log('[ErrorRecovery] 에러 처리:', errorCode, '(재시도:', retryCount + ')');

        // 1. 즉시 실패 에러
        if (shouldFailImmediately(errorCode)) {
            console.log('[ErrorRecovery] 재시도 불가 에러 - 즉시 실패');
            return { action: 'fail', delay: 0, newRetryCount: retryCount };
        }

        // 2. 최대 재시도 초과
        if (!canRetry(retryCount)) {
            console.log('[ErrorRecovery] 최대 재시도 횟수 초과');
            return { action: 'fail', delay: 0, newRetryCount: retryCount };
        }

        // 3. 에러 유형별 처리
        var delay = getRetryDelay(retryCount);

        switch (errorCode) {
            case ErrorCodes.NETWORK_DISCONNECTED:
            case ErrorCodes.REQUEST_TIMEOUT:
                return {
                    action: 'wait_network',
                    delay: delay,
                    newRetryCount: retryCount + 1
                };

            case ErrorCodes.RATE_LIMITED:
                // Rate limit은 더 긴 대기
                return {
                    action: 'retry',
                    delay: Math.max(delay, 60000),
                    newRetryCount: retryCount + 1
                };

            case ErrorCodes.APP_CRASH:
            case ErrorCodes.PLAYBACK_STALLED:
                return {
                    action: 'restart_app',
                    delay: delay,
                    newRetryCount: retryCount + 1
                };

            case ErrorCodes.SCREEN_LOCKED:
                return {
                    action: 'unlock_screen',
                    delay: 5000,
                    newRetryCount: retryCount + 1
                };

            default:
                return {
                    action: 'retry',
                    delay: delay,
                    newRetryCount: retryCount + 1
                };
        }
    }

    /**
     * 복구 액션 실행
     * @param {string} action - 액션 타입
     * @returns {boolean} 성공 여부
     */
    function executeRecoveryAction(action) {
        console.log('[ErrorRecovery] 복구 액션 실행:', action);

        switch (action) {
            case 'wait_network':
                return waitForNetwork(300000, 10000); // 5분, 10초 간격

            case 'restart_app':
                return restartYouTube();

            case 'unlock_screen':
                return unlockScreen();

            case 'retry':
                return true; // 단순 재시도

            case 'fail':
                return false;

            default:
                return true;
        }
    }

    /**
     * 화면 잠금 해제
     * @returns {boolean}
     */
    function unlockScreen() {
        console.log('[ErrorRecovery] 화면 잠금 해제 시도');

        if (typeof device !== 'undefined') {
            device.wakeUp();

            if (typeof sleep !== 'undefined') {
                sleep(500);
            }

            if (typeof swipe !== 'undefined') {
                // 스와이프로 잠금 해제
                swipe(500, 1500, 500, 500, 300);
            }

            return true;
        }

        return false;
    }

    // ==========================================
    // 유틸리티
    // ==========================================

    /**
     * 에러 코드로 메시지 생성
     * @param {string} errorCode
     * @returns {string}
     */
    function getErrorMessage(errorCode) {
        var messages = {
            'E1001': '네트워크 연결 끊김',
            'E1002': '요청 타임아웃',
            'E1003': 'API 호출 한도 초과',
            'E2001': '영상을 찾을 수 없음',
            'E2002': '지역 제한된 영상',
            'E2003': '연령 제한 영상',
            'E2004': '재생 멈춤 (교착 상태)',
            'E3001': '앱 비정상 종료',
            'E3002': '메모리 부족',
            'E3003': '화면 잠금',
            'E3004': '배터리 부족',
            'E4001': '알 수 없는 오류'
        };

        return messages[errorCode] || '알 수 없는 오류';
    }

    // Public API
    return {
        // 에러 코드
        ErrorCodes: ErrorCodes,

        // 에러 분류
        isRetryable: isRetryable,
        shouldFailImmediately: shouldFailImmediately,
        canRetry: canRetry,
        getRetryDelay: getRetryDelay,

        // 앱 크래시 복구
        isYouTubeRunning: isYouTubeRunning,
        forceStopYouTube: forceStopYouTube,
        clearYouTubeCache: clearYouTubeCache,
        restartYouTube: restartYouTube,
        recoverFromCrash: recoverFromCrash,

        // 네트워크
        isNetworkAvailable: isNetworkAvailable,
        waitForNetwork: waitForNetwork,

        // 교착 상태 모니터
        createStallMonitor: createStallMonitor,

        // 상태 저장/복원
        saveRecoveryState: saveRecoveryState,
        loadRecoveryState: loadRecoveryState,
        clearRecoveryState: clearRecoveryState,

        // 통합 핸들러
        handleError: handleError,
        executeRecoveryAction: executeRecoveryAction,
        getErrorMessage: getErrorMessage
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = ErrorRecovery;
}
