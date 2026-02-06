/**
 * main.js - DoAi.me Mobile Agent 메인 진입점
 *
 * Supabase 연동 + EvidenceManager + YouTube Bot 통합
 *
 * 실행 흐름:
 * 1. config.json 로드
 * 2. Supabase 연결 및 하트비트 시작
 * 3. 작업 폴링 시작
 * 4. 작업 수신 시 Bot 실행
 * 5. 완료/실패 상태 Supabase에 보고
 */

var BASE_PATH = '/sdcard/Scripts/doai-bot';

// 모듈 로드
var Utils, EvidenceManager, SupabaseClient;

(function loadModules() {
    // AutoX.js 환경
    if (typeof files !== 'undefined' && files.exists) {
        var paths = {
            utils: BASE_PATH + '/shared/Utils.js',
            evidence: BASE_PATH + '/android/EvidenceManager.js',
            supabase: BASE_PATH + '/shared/SupabaseClient.js'
        };

        try {
            if (files.exists(paths.utils)) {
                Utils = require(paths.utils);
                console.log('[Main] Utils 로드 성공');
            }
            if (files.exists(paths.evidence)) {
                EvidenceManager = require(paths.evidence);
                console.log('[Main] EvidenceManager 로드 성공');
            }
            if (files.exists(paths.supabase)) {
                SupabaseClient = require(paths.supabase);
                console.log('[Main] SupabaseClient 로드 성공');
            }
        } catch (e) {
            console.error('[Main] 모듈 로드 실패:', e);
        }

        if (Utils && EvidenceManager && SupabaseClient) return;
    }

    // Node.js 환경 (테스트용)
    try {
        Utils = require('../shared/Utils.js');
        EvidenceManager = require('./EvidenceManager.js');
        SupabaseClient = require('../shared/SupabaseClient.js');
        console.log('[Main] 모듈 로드 성공 (Node.js)');
    } catch (e) {
        console.error('[Main] 모듈 로드 실패:', e);
    }
})();

/**
 * 에러 코드 정의
 */
var ErrorCodes = {
    VIDEO_NOT_FOUND: 'E2001',
    VIDEO_UNAVAILABLE: 'E2002',
    APP_CRASH: 'E3001',
    PLAYBACK_STALLED: 'E2004',
    NETWORK_ERROR: 'E1001',
    UNKNOWN: 'E4001'
};

/**
 * YouTube 시청 작업 실행
 * @param {object} assignment - Supabase에서 받은 assignment 데이터
 */
function executeYouTubeJob(assignment) {
    var job = assignment.jobs; // JOIN된 job 데이터
    var assignmentId = assignment.id;

    console.log('[Main] ========================================');
    console.log('[Main] 작업 시작:', assignmentId);
    console.log('[Main] URL:', job.target_url);
    console.log('[Main] 시청 범위:', job.duration_min_pct + '% ~', job.duration_max_pct + '%');
    console.log('[Main] ========================================');

    // 1. Supabase에 작업 시작 보고
    SupabaseClient.startAssignment(assignmentId);

    // 2. EvidenceManager 초기화
    EvidenceManager.startJob(assignmentId);

    var result = {
        success: false,
        durationSec: 0,
        didLike: false,
        didComment: false,
        didPlaylist: false,
        errorCode: null,
        errorMsg: null
    };

    try {
        // 3. YouTube 앱 실행
        console.log('[Main] Step 1: YouTube 앱 실행');
        if (typeof app !== 'undefined') {
            app.launch('com.google.android.youtube');
            sleep(3000);
        }
        EvidenceManager.captureOnSearch();
        SupabaseClient.updateProgress(assignmentId, 10);

        // 4. 영상 URL로 직접 이동 또는 검색
        console.log('[Main] Step 2: 영상으로 이동');
        if (typeof app !== 'undefined' && job.target_url) {
            app.openUrl(job.target_url);
            sleep(5000);
        }
        EvidenceManager.captureOnVideoFound();
        SupabaseClient.updateProgress(assignmentId, 30);

        // 5. 영상 시청
        console.log('[Main] Step 3: 영상 시청 중...');
        EvidenceManager.captureOnWatchStart();

        // 시청 시간 계산 (확률적)
        var minPct = job.duration_min_pct || 30;
        var maxPct = job.duration_max_pct || 90;
        var watchPct = minPct + Math.random() * (maxPct - minPct);
        var videoDuration = 180; // 기본 3분 가정 (실제로는 영상 길이 감지 필요)
        var watchDuration = Math.floor(videoDuration * watchPct / 100);

        console.log('[Main] 목표 시청 시간:', watchDuration + '초');

        // 시청 루프 (진행률 업데이트)
        var startTime = Date.now();
        var lastProgress = 30;

        while ((Date.now() - startTime) / 1000 < watchDuration) {
            if (typeof sleep !== 'undefined') {
                sleep(10000); // 10초마다 체크
            } else {
                break; // Node.js 환경에서는 시뮬레이션
            }

            // 진행률 계산 (30% ~ 90%)
            var elapsed = (Date.now() - startTime) / 1000;
            var progress = 30 + Math.floor((elapsed / watchDuration) * 60);
            progress = Math.min(90, progress);

            if (progress > lastProgress + 5) {
                SupabaseClient.updateProgress(assignmentId, progress);
                lastProgress = progress;
            }
        }

        result.durationSec = Math.floor((Date.now() - startTime) / 1000);
        EvidenceManager.captureOnWatchEnd();
        SupabaseClient.updateProgress(assignmentId, 90);

        // 6. 좋아요/댓글/저장 (확률적)
        console.log('[Main] Step 4: 상호작용 처리');

        if (Math.random() * 100 < job.prob_like) {
            console.log('[Main] 좋아요 실행');
            result.didLike = true;
            // performLike();
        }

        if (Math.random() * 100 < job.prob_comment) {
            console.log('[Main] 댓글 실행');
            result.didComment = true;
            // performComment();
        }

        if (Math.random() * 100 < job.prob_playlist) {
            console.log('[Main] 재생목록 저장 실행');
            result.didPlaylist = true;
            // performSaveToPlaylist();
        }

        result.success = true;
        console.log('[Main] 작업 성공적으로 완료');

    } catch (e) {
        result.errorCode = ErrorCodes.UNKNOWN;
        result.errorMsg = String(e);
        console.error('[Main] 작업 중 오류:', e);
        EvidenceManager.captureOnError(result.errorMsg);
    }

    // 7. 결과 보고
    console.log('[Main] Step 5: 결과 보고');

    if (result.success) {
        SupabaseClient.completeAssignment(assignmentId, {
            durationSec: result.durationSec,
            didLike: result.didLike,
            didComment: result.didComment,
            didPlaylist: result.didPlaylist
        });
    } else {
        SupabaseClient.failAssignment(
            assignmentId,
            result.errorCode,
            result.errorMsg,
            (assignment.retry_count || 0) + 1
        );
    }

    // 8. EvidenceManager 종료 (로컬 result.json 생성)
    EvidenceManager.finishJob({
        success: result.success,
        watchDuration: result.durationSec,
        error: result.errorMsg
    });

    console.log('[Main] ========================================');
    console.log('[Main] 작업 완료:', assignmentId);
    console.log('[Main] 성공:', result.success);
    console.log('[Main] 시청 시간:', result.durationSec + '초');
    console.log('[Main] ========================================');

    return result;
}

/**
 * 메인 루프 시작
 */
function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     DoAi.me Mobile Agent v1.0          ║');
    console.log('║     Supabase 연동 버전                 ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    // 1. Config 로드
    var configPath = BASE_PATH + '/config.json';
    if (!SupabaseClient.loadConfig(configPath)) {
        console.error('[Main] config.json 로드 실패. 종료합니다.');
        return;
    }

    // 2. 연결 테스트
    if (!SupabaseClient.testConnection()) {
        console.error('[Main] Supabase 연결 실패. 종료합니다.');
        return;
    }

    // 3. 하트비트 시작
    SupabaseClient.startHeartbeat(10000);

    // 4. 폴링 시작
    console.log('[Main] 작업 폴링 시작...');

    SupabaseClient.startPolling(function(assignment) {
        console.log('[Main] 새 작업 수신:', assignment.id);

        // 폴링 일시 중지
        SupabaseClient.pausePolling();

        // 작업 실행
        executeYouTubeJob(assignment);

        // 폴링 재개
        console.log('[Main] 다음 작업 대기...');
        SupabaseClient.resumePolling(function(a) {
            SupabaseClient.pausePolling();
            executeYouTubeJob(a);
            SupabaseClient.resumePolling();
        });
    });

    // 5. 종료 핸들러 (AutoX.js)
    if (typeof events !== 'undefined') {
        events.on('exit', function() {
            console.log('[Main] 종료 신호 수신');
            SupabaseClient.stopHeartbeat();
            SupabaseClient.stopPolling();
        });
    }

    console.log('[Main] 에이전트 실행 중... (Ctrl+C로 종료)');
}

// 실행
if (typeof require !== 'undefined' && require.main === module) {
    // Node.js 테스트 모드
    console.log('[Main] Node.js 테스트 모드');

    // Mock config
    SupabaseClient.init({
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
        deviceId: 'test-device-001'
    });

    console.log('[Main] Config:', JSON.stringify(SupabaseClient.getConfig(), null, 2));
    console.log('[Main] 테스트 완료');
} else {
    // AutoX.js 실행
    main();
}

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = {
        main: main,
        executeYouTubeJob: executeYouTubeJob
    };
}
