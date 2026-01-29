/**
 * core/Logger.js
 * 로그 파일 관리 모듈
 * /sdcard/doai_logs/bot_log.txt에 단계별 로그 기록
 *
 * 로그 형식:
 * [2026. 1. 30. 오전 10:00:05] [Step 0] 작업 시작: 짐승남의 투자 비법
 * [2026. 1. 30. 오전 10:00:10] [Delay] Sleeping for 2.4s...
 *
 * @module Logger
 * @version 1.0.0
 */

var Logger = (function() {

    // ==========================================
    // 설정
    // ==========================================
    var CONFIG = {
        LOG_DIR: '/sdcard/doai_logs',
        LOG_FILE: '/sdcard/doai_logs/bot_log.txt',
        MAX_FILE_SIZE: 5 * 1024 * 1024,  // 5MB 초과 시 로테이션
        CONSOLE_OUTPUT: true              // 콘솔에도 출력
    };

    // 현재 작업 ID (로그 그룹핑용)
    var _currentJobId = null;
    var _sessionStartTime = null;

    // ==========================================
    // 초기화
    // ==========================================

    /**
     * 로그 디렉토리 생성
     */
    function init() {
        try {
            if (typeof files !== 'undefined') {
                files.ensureDir(CONFIG.LOG_DIR + '/');
                
                // 세션 시작 시간 기록
                _sessionStartTime = new Date();
                
                console.log('[Logger] 초기화 완료: ' + CONFIG.LOG_FILE);
                return true;
            }
        } catch (e) {
            console.error('[Logger] 초기화 실패:', e.message);
        }
        return false;
    }

    /**
     * 작업 세션 시작
     * @param {string} jobId - 작업 ID
     */
    function startSession(jobId) {
        _currentJobId = jobId;
        _sessionStartTime = new Date();
        
        // 세션 구분선 추가
        _writeToFile('\n' + '='.repeat(60));
        _writeToFile('[SESSION START] Job: ' + jobId);
        _writeToFile('='.repeat(60));
    }

    /**
     * 작업 세션 종료
     */
    function endSession() {
        _writeToFile('='.repeat(60));
        _writeToFile('[SESSION END] Duration: ' + _getSessionDuration());
        _writeToFile('='.repeat(60) + '\n');
        
        _currentJobId = null;
    }

    // ==========================================
    // 타임스탬프 포맷팅
    // ==========================================

    /**
     * 한국어 형식 타임스탬프 생성
     * 형식: 2026. 1. 30. 오전 10:00:05
     * @returns {string}
     */
    function _getFormattedTimestamp() {
        var now = new Date();
        
        var year = now.getFullYear();
        var month = now.getMonth() + 1;
        var day = now.getDate();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        
        // 오전/오후 변환
        var ampm = hours < 12 ? '오전' : '오후';
        var displayHours = hours % 12;
        if (displayHours === 0) displayHours = 12;
        
        // 분/초 패딩
        var pad = function(n) { return n < 10 ? '0' + n : String(n); };
        
        return year + '. ' + month + '. ' + day + '. ' + 
               ampm + ' ' + displayHours + ':' + pad(minutes) + ':' + pad(seconds);
    }

    /**
     * 세션 경과 시간
     * @returns {string}
     */
    function _getSessionDuration() {
        if (!_sessionStartTime) return '0s';
        
        var elapsed = Math.round((Date.now() - _sessionStartTime.getTime()) / 1000);
        
        if (elapsed < 60) return elapsed + 's';
        if (elapsed < 3600) return Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's';
        return Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm';
    }

    // ==========================================
    // 로그 작성
    // ==========================================

    /**
     * 파일에 로그 기록
     * @param {string} message - 로그 메시지
     */
    function _writeToFile(message) {
        try {
            if (typeof files !== 'undefined') {
                // 파일 크기 체크 (로테이션)
                if (files.exists(CONFIG.LOG_FILE)) {
                    var fileInfo = new java.io.File(CONFIG.LOG_FILE);
                    if (fileInfo.length() > CONFIG.MAX_FILE_SIZE) {
                        _rotateLogFile();
                    }
                }
                
                // 로그 추가
                files.append(CONFIG.LOG_FILE, message + '\n');
            }
        } catch (e) {
            console.error('[Logger] 파일 쓰기 실패:', e.message);
        }
    }

    /**
     * 로그 파일 로테이션
     */
    function _rotateLogFile() {
        try {
            var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            var backupFile = CONFIG.LOG_DIR + '/bot_log_' + timestamp + '.txt';
            
            if (typeof files !== 'undefined' && files.exists(CONFIG.LOG_FILE)) {
                files.rename(CONFIG.LOG_FILE, backupFile);
                console.log('[Logger] 로그 파일 로테이션: ' + backupFile);
            }
        } catch (e) {
            console.error('[Logger] 로테이션 실패:', e.message);
        }
    }

    // ==========================================
    // 공개 로그 함수
    // ==========================================

    /**
     * Step 로그 (단계별 진행 상황)
     * @param {number|string} step - 단계 번호 또는 이름
     * @param {string} message - 로그 메시지
     */
    function step(stepNum, message) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [Step ' + stepNum + '] ' + message;
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.log(logMsg);
        }
    }

    /**
     * Delay 로그 (대기 시간)
     * @param {number} delayMs - 대기 시간 (밀리초)
     * @returns {number} 실제 대기 시간
     */
    function delay(delayMs) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [Delay] Sleeping for ' + delayMs + 'ms...';
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.log(logMsg);
        }
        
        // 실제 대기 실행
        if (typeof sleep !== 'undefined') {
            sleep(delayMs);
        }
        
        return delayMs;
    }

    /**
     * 랜덤 Delay 로그
     * @param {number} minMs - 최소 대기 시간
     * @param {number} maxMs - 최대 대기 시간
     * @returns {number} 실제 대기 시간
     */
    function randomDelay(minMs, maxMs) {
        var actualDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        return delay(actualDelay);
    }

    /**
     * Info 로그 (일반 정보)
     * @param {string} tag - 태그
     * @param {string} message - 메시지
     */
    function info(tag, message) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [' + tag + '] ' + message;
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.log(logMsg);
        }
    }

    /**
     * Error 로그
     * @param {string} message - 에러 메시지
     */
    function error(message) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [ERROR] ' + message;
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.error(logMsg);
        }
    }

    /**
     * Action 로그 (상호작용)
     * @param {string} action - 액션 이름
     * @param {string} result - 결과
     */
    function action(actionName, result) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [Action] ' + actionName + ': ' + result;
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.log(logMsg);
        }
    }

    /**
     * Ads 로그 (광고 스킵)
     * @param {string} message - 메시지
     */
    function ads(message) {
        var logMsg = '[' + _getFormattedTimestamp() + '] [Ads] ' + message;
        
        _writeToFile(logMsg);
        
        if (CONFIG.CONSOLE_OUTPUT) {
            console.log(logMsg);
        }
    }

    // ==========================================
    // Public API
    // ==========================================
    return {
        // 초기화
        init: init,
        startSession: startSession,
        endSession: endSession,
        
        // 로그 함수
        step: step,
        delay: delay,
        randomDelay: randomDelay,
        info: info,
        error: error,
        action: action,
        ads: ads,
        
        // 설정
        CONFIG: CONFIG
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = Logger;
}
