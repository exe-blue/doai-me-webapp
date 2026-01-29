/**
 * test_logger.js
 * Logger 모듈 단위 테스트
 * 
 * 실행 방법:
 * 1. PC에서: node test_logger.js
 * 2. AutoX.js에서: 직접 실행
 */

// =============================================
// Mock 환경 설정 (Node.js용)
// =============================================
if (typeof files === 'undefined') {
    // Node.js 환경에서 files 모킹
    var fs = require('fs');
    var path = require('path');
    
    var testLogDir = path.join(__dirname, 'test_logs');
    
    global.files = {
        ensureDir: function(dir) {
            if (!fs.existsSync(testLogDir)) {
                fs.mkdirSync(testLogDir, { recursive: true });
            }
        },
        exists: function(filePath) {
            var localPath = filePath.replace('/sdcard/doai_logs', testLogDir);
            return fs.existsSync(localPath);
        },
        append: function(filePath, content) {
            var localPath = filePath.replace('/sdcard/doai_logs', testLogDir);
            fs.appendFileSync(localPath, content);
        },
        rename: function(oldPath, newPath) {
            var localOld = oldPath.replace('/sdcard/doai_logs', testLogDir);
            var localNew = newPath.replace('/sdcard/doai_logs', testLogDir);
            fs.renameSync(localOld, localNew);
        }
    };
    
    global.java = {
        io: {
            File: function(path) {
                var localPath = path.replace('/sdcard/doai_logs', testLogDir);
                return {
                    length: function() {
                        try {
                            return fs.statSync(localPath).size;
                        } catch (e) {
                            return 0;
                        }
                    }
                };
            }
        }
    };
    
    global.sleep = function(ms) {
        // Node.js에서는 실제 sleep 불가, 시뮬레이션
        console.log('[Mock] sleep(' + ms + 'ms)');
    };
}

// =============================================
// Logger 모듈 로드
// =============================================
var Logger;

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    // Node.js 환경
    Logger = require('../core/Logger.js');
} else {
    // AutoX.js 환경
    Logger = require('/sdcard/Scripts/doai-bot/core/Logger.js');
}

// =============================================
// 테스트 실행
// =============================================
console.log('========================================');
console.log('Logger 모듈 테스트 시작');
console.log('========================================\n');

// 1. 초기화 테스트
console.log('[Test 1] Logger 초기화');
var initResult = Logger.init();
console.log('결과: ' + (initResult ? '성공' : '실패'));
console.log('');

// 2. 세션 시작 테스트
console.log('[Test 2] 세션 시작');
Logger.startSession('test-job-001');
console.log('');

// 3. Step 로그 테스트
console.log('[Test 3] Step 로그');
Logger.step(0, '작업 시작: 테스트 영상');
Logger.step(1, 'YouTube 앱 실행');
Logger.step(2, '광고 스킵 스레드 시작');
Logger.step(3, 'URL 보정 완료: www.youtube.com/watch?v=test123');
Logger.step(4, '키워드 부재로 제목을 키워드로 설정');
Logger.step(5, '검색 수행: 테스트 키워드');
Logger.step(6, '영상 탐색 중... (Scroll 1/10)');
Logger.step(6, '영상 발견 및 클릭');
console.log('');

// 4. Delay 로그 테스트
console.log('[Test 4] Delay 로그');
Logger.delay(2400);
Logger.randomDelay(2000, 5000);
console.log('');

// 5. 시청 로그 테스트
console.log('[Test 5] 시청 로그');
Logger.step(8, '시청 시작 (예정: 142초)');
Logger.step(8, '앞으로가기 액션 (1/5)');
Logger.delay(3100);
Logger.step(8, '앞으로가기 액션 (2/5)');
console.log('');

// 6. Action 로그 테스트
console.log('[Test 6] Action 로그');
Logger.action('좋아요', '성공');
Logger.action('댓글', '시도 중...');
Logger.action('댓글', '성공: 좋은 영상이네요!');
console.log('');

// 7. Info/Error 로그 테스트
console.log('[Test 7] Info/Error 로그');
Logger.info('Result', 'Duration: 145s, Like: true, Comment: true');
Logger.error('테스트 에러 메시지');
console.log('');

// 8. Ads 로그 테스트
console.log('[Test 8] Ads 로그');
Logger.ads('광고 스킵 버튼 감지 및 클릭');
Logger.ads('광고 스킵 버튼 감지 및 클릭 (총 2회)');
console.log('');

// 9. 랜덤 서핑 로그 테스트
console.log('[Test 9] 랜덤 서핑 로그');
Logger.step(11, '추가 랜덤 시청 프로세스 진입');
Logger.step(11, "피드 영상 없음 -> '투자' 검색 시도");
Logger.step(11, '랜덤 영상 선택 및 시청 (인덱스: 2)');
console.log('');

// 10. 완료 로그 테스트
console.log('[Test 10] 완료 로그');
Logger.step(12, '모든 작업 완료. 결과 보고 전송');
console.log('');

// 11. 세션 종료 테스트
console.log('[Test 11] 세션 종료');
Logger.endSession();
console.log('');

// =============================================
// 결과 확인
// =============================================
console.log('========================================');
console.log('테스트 완료!');
console.log('========================================');

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    // Node.js: 로그 파일 내용 출력
    var fs = require('fs');
    var path = require('path');
    var logFile = path.join(__dirname, 'test_logs', 'bot_log.txt');
    
    if (fs.existsSync(logFile)) {
        console.log('\n[로그 파일 내용]\n');
        console.log(fs.readFileSync(logFile, 'utf8'));
    }
}
