/**
 * bot.js v3.0 - 모듈화 버전
 * DoAi.me Mobile Agent - YouTube 시청 자동화
 *
 * 주요 기능:
 * - 유튜브 시청 (불확실성 기반 시청 시간)
 * - 확률 기반 좋아요/댓글/재생목록 저장
 * - Supabase 상태 보고
 * - 에러 복구
 *
 * @version 3.0.0
 */

// =============================================
// 모듈 로드
// =============================================
var BASE_PATH = '/sdcard/Scripts/doai-bot';
var Utils, SupabaseClient, EvidenceManager, ErrorRecovery, YouTubeActions;

(function loadModules() {
    var corePath = BASE_PATH + '/core/';

    // AutoX.js 환경
    if (typeof files !== 'undefined' && files.exists) {
        try {
            if (files.exists(corePath + 'Utils.js')) {
                Utils = require(corePath + 'Utils.js');
                console.log('[Bot] Utils 로드 성공');
            }
            if (files.exists(corePath + 'SupabaseClient.js')) {
                SupabaseClient = require(corePath + 'SupabaseClient.js');
                console.log('[Bot] SupabaseClient 로드 성공');
            }
            if (files.exists(corePath + 'EvidenceManager.js')) {
                EvidenceManager = require(corePath + 'EvidenceManager.js');
                console.log('[Bot] EvidenceManager 로드 성공');
            }
            if (files.exists(corePath + 'ErrorRecovery.js')) {
                ErrorRecovery = require(corePath + 'ErrorRecovery.js');
                console.log('[Bot] ErrorRecovery 로드 성공');
            }
            if (files.exists(corePath + 'YouTubeActions.js')) {
                YouTubeActions = require(corePath + 'YouTubeActions.js');
                console.log('[Bot] YouTubeActions 로드 성공');
            }
        } catch (e) {
            console.error('[Bot] 모듈 로드 실패:', e);
        }
    }
})();

// =============================================
// 파라미터 로드
// =============================================
var params;
var jobJsonPath = "/sdcard/job.json";

if (files.exists(jobJsonPath)) {
    try {
        params = Utils ? Utils.loadJobParams(jobJsonPath) : JSON.parse(files.read(jobJsonPath));
        console.log("✅ Parameters loaded from job.json");
    } catch (e) {
        console.error("❌ Failed to parse job.json:", e.message);
        params = null;
    }
}

// Fallback to args (backwards compatibility)
if (!params) {
    var args = engines.myEngine().execArgv;
    params = {
        job_id: args.job_id || "test-job",
        assignment_id: args.assignment_id || "test-assignment",
        device_id: args.device_id || "test-device",
        video_url: args.video_url || "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        keyword: args.keyword || "test video",
        duration_min_pct: parseInt(args.duration_min_pct) || 30,
        duration_max_pct: parseInt(args.duration_max_pct) || 90,
        base_duration_sec: parseInt(args.base_duration_sec) || 300,
        prob_like: parseInt(args.prob_like) || 0,
        prob_comment: parseInt(args.prob_comment) || 0,
        prob_playlist: parseInt(args.prob_playlist) || 0,
        supabase_url: args.supabase_url,
        supabase_key: args.supabase_key,
        done_flag_path: args.done_flag_path || null
    };
    console.log("⚠️ Using fallback args");
}

// =============================================
// Supabase 초기화
// =============================================
if (SupabaseClient && params.supabase_url && params.supabase_key) {
    SupabaseClient.init({
        url: params.supabase_url,
        anonKey: params.supabase_key,
        deviceId: params.device_id
    });
}

// =============================================
// 작업 결과 추적
// =============================================
var jobResult = {
    didLike: false,
    didComment: false,
    didPlaylist: false,
    commentText: null,
    errors: []
};

// =============================================
// 시청 시간 계산
// =============================================
var watchInfo = Utils ? Utils.calculateWatchDuration(params) : {
    randomPct: Math.floor(Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)) + params.duration_min_pct,
    targetDurationSec: Math.floor(params.base_duration_sec * ((Math.floor(Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)) + params.duration_min_pct) / 100))
};

var targetDurationSec = watchInfo.targetDurationSec;
var randomPct = watchInfo.randomPct;

console.log("=== Bot v3.0 Started ===");
console.log("Job ID:", params.job_id);
console.log("Video:", params.video_url);
console.log("Target Duration:", targetDurationSec + "s (" + randomPct + "%)");
console.log("Prob - Like:", params.prob_like + "%, Comment:", params.prob_comment + "%, Playlist:", params.prob_playlist + "%");

// =============================================
// 메인 실행
// =============================================

// YouTube 앱 실행
if (YouTubeActions) {
    YouTubeActions.launchYouTube(params.video_url);
} else {
    app.startActivity({
        action: "android.intent.action.VIEW",
        data: params.video_url,
        packageName: "com.google.android.youtube"
    });
    sleep(5000);
}

// EvidenceManager 초기화
if (EvidenceManager) {
    EvidenceManager.startJob(params.assignment_id);
}

// 메인 작업 스레드
threads.start(function() {
    var elapsed = 0;
    var actionsPerformed = false;

    // 시청 루프
    while (elapsed < targetDurationSec) {
        sleep(10000); // 10초 대기
        elapsed += 10;

        // 진행률 계산 및 보고
        var progressPct = Math.round(Math.min(100, (elapsed / targetDurationSec) * 100));
        console.log("Watching...", elapsed + "s /", targetDurationSec + "s (" + progressPct + "%)");

        if (SupabaseClient) {
            SupabaseClient.updateProgress(params.assignment_id, progressPct);
        }

        // 30% 시청 후 액션 수행 (한 번만)
        if (!actionsPerformed && elapsed >= targetDurationSec * 0.3) {
            console.log("=== Performing Actions ===");
            performActions();
            actionsPerformed = true;
        }
    }

    // 작업 완료
    completeJob();
});

// =============================================
// 액션 수행 함수
// =============================================
function performActions() {
    var actions = YouTubeActions || {};
    var shouldPerform = actions.shouldPerform || function(p) { return Math.random() * 100 < p; };

    // 좋아요
    if (shouldPerform(params.prob_like)) {
        console.log("[Action] 좋아요 시도...");
        try {
            var likeSuccess = actions.performLike ? actions.performLike() : false;
            if (likeSuccess) {
                jobResult.didLike = true;
                console.log("[Action] 좋아요 성공!");
            }
        } catch (e) {
            console.error("[Action] 좋아요 실패:", e.message);
            jobResult.errors.push("like: " + e.message);
        }
        sleep(2000);
    }

    // 댓글
    if (shouldPerform(params.prob_comment)) {
        console.log("[Action] 댓글 시도...");
        try {
            var comment = SupabaseClient ?
                SupabaseClient.fetchRandomComment(params.device_id, params.job_id) :
                getDefaultComment();

            var commentSuccess = actions.performComment ? actions.performComment(comment) : false;
            if (commentSuccess) {
                jobResult.didComment = true;
                jobResult.commentText = comment;
                console.log("[Action] 댓글 성공:", comment);
            }
        } catch (e) {
            console.error("[Action] 댓글 실패:", e.message);
            jobResult.errors.push("comment: " + e.message);
        }
        sleep(2000);
    }

    // 재생목록 저장
    if (shouldPerform(params.prob_playlist)) {
        console.log("[Action] 재생목록 저장 시도...");
        try {
            var playlistSuccess = actions.performPlaylistSave ? actions.performPlaylistSave() : false;
            if (playlistSuccess) {
                jobResult.didPlaylist = true;
                console.log("[Action] 재생목록 저장 성공!");
            }
        } catch (e) {
            console.error("[Action] 재생목록 저장 실패:", e.message);
            jobResult.errors.push("playlist: " + e.message);
        }
    }
}

// 기본 댓글 풀
function getDefaultComment() {
    var comments = [
        "영상 잘 봤습니다!",
        "좋은 영상 감사합니다",
        "구독하고 갑니다~",
        "오늘도 좋은 영상이네요",
        "항상 응원합니다!"
    ];
    return comments[Math.floor(Math.random() * comments.length)];
}

// =============================================
// 작업 완료
// =============================================
function completeJob() {
    console.log("=== Job Completed ===");
    console.log("Duration:", targetDurationSec + "s");
    console.log("Like:", jobResult.didLike);
    console.log("Comment:", jobResult.didComment, jobResult.commentText ? "(" + jobResult.commentText + ")" : "");
    console.log("Playlist:", jobResult.didPlaylist);
    if (jobResult.errors.length > 0) {
        console.log("Errors:", jobResult.errors.join(", "));
    }

    // 증거 캡처
    var screenshotPath = null;
    if (EvidenceManager) {
        var captureResult = EvidenceManager.captureScreenshot('complete');
        screenshotPath = captureResult.success ? captureResult.filePath : null;

        EvidenceManager.finishJob({
            success: true,
            watchDuration: targetDurationSec
        });
    }

    // 완료 플래그 작성
    writeCompletionFlag("success", screenshotPath, null);

    // Supabase 완료 보고
    if (SupabaseClient) {
        SupabaseClient.completeAssignment(params.assignment_id, {
            durationSec: targetDurationSec,
            didLike: jobResult.didLike,
            didComment: jobResult.didComment,
            didPlaylist: jobResult.didPlaylist
        });
    }

    // 스크립트 종료
    engines.myEngine().forceStop();
}

// 완료 플래그 작성
function writeCompletionFlag(status, screenshotPath, errorMessage) {
    try {
        var flagPath = params.done_flag_path || "/sdcard/completion_" + params.job_id + ".flag";
        var flagData = {
            status: status,
            job_id: params.job_id,
            completed_at: new Date().toISOString(),
            screenshot_path: screenshotPath || null,
            error: errorMessage || null
        };

        files.write(flagPath, JSON.stringify(flagData));
        console.log("✅ Completion flag written:", flagPath);
    } catch (e) {
        console.error("❌ Completion flag failed:", e.message);
    }
}
