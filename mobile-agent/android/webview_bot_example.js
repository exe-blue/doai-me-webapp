/**
 * webview_bot.js 통합 예제
 * EvidenceManager를 사용한 스크린샷 캡처 및 result.json 생성
 *
 * 이 파일은 실제 webview_bot.js에서 EvidenceManager를 사용하는 방법을 보여줍니다.
 */

// 모듈 로드 (AutoX.js 환경 + Node.js 환경 호환)
var Utils, EvidenceManager;
var BASE_PATH = '/sdcard/Scripts/doai-bot';

(function loadModules() {
    // 1. AutoX.js 환경 (절대 경로)
    if (typeof files !== 'undefined' && files.exists) {
        var utilsPath = BASE_PATH + '/shared/Utils.js';
        var evidencePath = BASE_PATH + '/android/EvidenceManager.js';

        if (files.exists(utilsPath)) {
            try {
                Utils = require(utilsPath);
                console.log('[Bot] Utils 로드 성공 (AutoX.js)');
            } catch (e) {
                console.error('[Bot] Utils 로드 실패: ' + e);
            }
        }

        if (files.exists(evidencePath)) {
            try {
                EvidenceManager = require(evidencePath);
                console.log('[Bot] EvidenceManager 로드 성공 (AutoX.js)');
            } catch (e) {
                console.error('[Bot] EvidenceManager 로드 실패: ' + e);
            }
        }

        if (Utils && EvidenceManager) return;
    }

    // 2. Node.js 환경 (상대 경로)
    try {
        Utils = require('../shared/Utils.js');
        EvidenceManager = require('./EvidenceManager.js');
        console.log('[Bot] 모듈 로드 성공 (Node.js)');
    } catch (e) {
        console.error('[Bot] 모듈 로드 실패: ' + e);
    }
})();

/**
 * WebView 기반 YouTube 검색 봇 (예제)
 */
function runWebViewBot() {
    // 1. job.json 읽기
    var jobPath = '/sdcard/Scripts/doai-bot/job.json';
    var job = Utils.readJsonFile(jobPath);

    if (!job) {
        console.error('[Bot] job.json을 찾을 수 없습니다');
        return;
    }

    console.log('[Bot] 작업 시작:', job.assignment_id);
    console.log('[Bot] 검색어:', job.keyword);
    console.log('[Bot] 타겟 영상:', job.video_title);

    // 2. EvidenceManager 초기화
    EvidenceManager.startJob(job.assignment_id);

    var searchSuccess = false;
    var watchDuration = 0;
    var errorMsg = null;

    try {
        // =============================================
        // Step 1: YouTube 앱 실행 및 검색
        // =============================================
        console.log('[Bot] Step 1: YouTube 검색 시작');

        // YouTube 앱 실행
        // app.launch('com.google.android.youtube');
        // sleep(3000);

        // 검색창 클릭
        // click(...);

        // 스크린샷 캡처: 검색 화면
        EvidenceManager.captureOnSearch();

        // 검색어 입력
        // setText(job.keyword);
        // sleep(1000);

        // =============================================
        // Step 2: 검색 결과에서 영상 찾기
        // =============================================
        console.log('[Bot] Step 2: 영상 검색 중...');

        // 영상 찾기 로직...
        var videoFound = true; // 시뮬레이션

        if (videoFound) {
            searchSuccess = true;

            // 스크린샷 캡처: 영상 발견
            EvidenceManager.captureOnVideoFound();

            // =============================================
            // Step 3: 영상 클릭 및 재생
            // =============================================
            console.log('[Bot] Step 3: 영상 클릭');

            // click(videoElement);
            // sleep(2000);

            // 스크린샷 캡처: 클릭 시점
            EvidenceManager.captureOnClick();

            // =============================================
            // Step 4: 영상 시청
            // =============================================
            console.log('[Bot] Step 4: 영상 시청 시작');

            // 스크린샷 캡처: 시청 시작
            EvidenceManager.captureOnWatchStart();

            var startTime = Date.now();
            var targetDuration = job.duration_sec || 60;

            // 시청 루프 (시뮬레이션)
            // while ((Date.now() - startTime) / 1000 < targetDuration) {
            //     sleep(10000);
            // }

            watchDuration = targetDuration; // 시뮬레이션

            // 스크린샷 캡처: 시청 완료
            EvidenceManager.captureOnWatchEnd();

            console.log('[Bot] 시청 완료:', watchDuration + '초');

        } else {
            errorMsg = '영상을 찾을 수 없음: ' + job.video_title;
            console.error('[Bot]', errorMsg);

            // 에러 스크린샷
            EvidenceManager.captureOnError(errorMsg);
        }

    } catch (e) {
        errorMsg = String(e);
        console.error('[Bot] 오류 발생:', errorMsg);

        // 에러 스크린샷
        EvidenceManager.captureOnError(errorMsg);
    }

    // =============================================
    // Step 5: 결과 저장 (result.json)
    // =============================================
    console.log('[Bot] Step 5: 결과 저장');

    var finishResult = EvidenceManager.finishJob({
        success: searchSuccess && !errorMsg,
        searchSuccess: searchSuccess,
        watchDuration: watchDuration,
        error: errorMsg
    });

    console.log('[Bot] 작업 완료');
    console.log('[Bot] result.json 경로:', finishResult.resultPath);
    console.log('[Bot] 증거 파일 수:', finishResult.result.evidence_count);

    // 호스트(PC Worker)가 Pull해야 할 파일 목록 출력
    console.log('\n[Bot] === 증거 파일 목록 (호스트가 Pull 필요) ===');
    finishResult.result.evidence_files.forEach(function(f) {
        console.log('  - ' + f.path);
    });

    return finishResult.result;
}

// 테스트 실행
if (typeof require !== 'undefined' && require.main === module) {
    // Node.js에서 직접 실행 시 테스트
    console.log('╔════════════════════════════════════════╗');
    console.log('║  WebView Bot Integration Example       ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Mock job.json
    var mockJob = {
        assignment_id: 'test-integration-001',
        keyword: '테스트 검색어',
        video_title: '테스트 영상 제목',
        duration_sec: 60
    };

    // Utils.readJsonFile을 mock으로 대체
    var originalReadJsonFile = Utils.readJsonFile;
    Utils.readJsonFile = function(path) {
        if (path.includes('job.json')) {
            return mockJob;
        }
        return originalReadJsonFile(path);
    };

    // 실행
    var result = runWebViewBot();

    console.log('\n[Final result.json]');
    console.log(JSON.stringify(result, null, 2));
}

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = { runWebViewBot: runWebViewBot };
}
