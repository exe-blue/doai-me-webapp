/**
 * bot.js v4.0 - 통합 워크플로우
 * DoAi.me Mobile Agent - YouTube 자동화 봇
 *
 * 워크플로우:
 * 1. 키워드 검색 → 영상 찾기 (또는 URL 직접 진입)
 * 2. 광고 스킵 (백그라운드 스레드)
 * 3. 영상 시청 + 앞으로가기 액션
 * 4. 상호작용 (좋아요/댓글/구독)
 * 5. 랜덤 피드 서핑 (Cool-down)
 * 6. 결과 보고
 *
 * @version 4.0.0
 */

// =============================================
// 모듈 로드
// =============================================
var BASE_PATH = '/sdcard/Scripts/doai-bot';
var Utils, SupabaseClient, EvidenceManager, ErrorRecovery, YouTubeActions;
var SearchFlow, AdSkipper, RandomSurf;

(function loadModules() {
    var corePath = BASE_PATH + '/core/';

    // AutoX.js 환경 체크
    if (typeof files === 'undefined' || !files.exists) {
        console.error('[Bot] AutoX.js 환경이 아닙니다');
        return;
    }

    var modules = [
        { name: 'Utils', file: 'Utils.js' },
        { name: 'SupabaseClient', file: 'SupabaseClient.js' },
        { name: 'EvidenceManager', file: 'EvidenceManager.js' },
        { name: 'ErrorRecovery', file: 'ErrorRecovery.js' },
        { name: 'YouTubeActions', file: 'YouTubeActions.js' },
        { name: 'SearchFlow', file: 'SearchFlow.js' },
        { name: 'AdSkipper', file: 'AdSkipper.js' },
        { name: 'RandomSurf', file: 'RandomSurf.js' }
    ];

    modules.forEach(function(mod) {
        try {
            var path = corePath + mod.file;
            if (files.exists(path)) {
                var loaded = require(path);
                switch (mod.name) {
                    case 'Utils': Utils = loaded; break;
                    case 'SupabaseClient': SupabaseClient = loaded; break;
                    case 'EvidenceManager': EvidenceManager = loaded; break;
                    case 'ErrorRecovery': ErrorRecovery = loaded; break;
                    case 'YouTubeActions': YouTubeActions = loaded; break;
                    case 'SearchFlow': SearchFlow = loaded; break;
                    case 'AdSkipper': AdSkipper = loaded; break;
                    case 'RandomSurf': RandomSurf = loaded; break;
                }
                console.log('[Bot] ' + mod.name + ' 로드 성공');
            } else {
                console.warn('[Bot] ' + mod.name + ' 파일 없음: ' + path);
            }
        } catch (e) {
            console.error('[Bot] ' + mod.name + ' 로드 실패:', e.message);
        }
    });
})();

// =============================================
// 파라미터 로드 (우선순위: Intent B64 > job.json > args)
// =============================================
var params = null;
var jobJsonPath = '/sdcard/job.json';

// 방법 1: Intent에서 Base64로 전달받은 데이터
(function loadFromIntent() {
    try {
        var args = engines.myEngine().execArgv;
        
        // Base64 인코딩된 jobData 확인
        if (args.jobDataB64) {
            console.log('[Params] Base64 데이터 감지');
            var decoded = java.lang.String(
                android.util.Base64.decode(args.jobDataB64, android.util.Base64.DEFAULT)
            );
            params = JSON.parse(String(decoded));
            console.log('✅ Parameters loaded from Intent (Base64)');
            return;
        }
        
        // 레거시: 직접 JSON 문자열
        if (args.jobData) {
            params = JSON.parse(args.jobData);
            console.log('✅ Parameters loaded from Intent (JSON)');
            return;
        }
    } catch (e) {
        console.warn('[Params] Intent 파싱 실패:', e.message);
    }
})();

// 방법 2: job.json 파일에서 로드
if (!params && files.exists(jobJsonPath)) {
    try {
        params = Utils ? Utils.loadJobParams(jobJsonPath) : JSON.parse(files.read(jobJsonPath));
        console.log('✅ Parameters loaded from job.json');
    } catch (e) {
        console.error('[Params] job.json 파싱 실패:', e.message);
        params = null;
    }
}

// 방법 3: Fallback to args (backwards compatibility)
if (!params) {
    var args = engines.myEngine().execArgv;
    params = {
        job_id: args.job_id || 'test-job',
        assignment_id: args.assignment_id || 'test-assignment',
        device_id: args.device_id || 'test-device',
        video_url: args.video_url || 'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
        video_title: args.video_title || '',
        keyword: args.keyword || '',
        duration_min_sec: parseInt(args.duration_min_sec) || 60,
        duration_max_sec: parseInt(args.duration_max_sec) || 180,
        prob_like: parseInt(args.prob_like) || 0,
        prob_comment: parseInt(args.prob_comment) || 0,
        prob_subscribe: parseInt(args.prob_subscribe) || 0,
        prob_playlist: parseInt(args.prob_playlist) || 0,
        enable_search: args.enable_search !== 'false',
        enable_forward_action: args.enable_forward_action !== 'false',
        enable_random_surf: args.enable_random_surf !== 'false',
        forward_action_count: parseInt(args.forward_action_count) || 5,
        surf_video_count: parseInt(args.surf_video_count) || 1,
        comments: args.comments || [],
        supabase_url: args.supabase_url,
        supabase_key: args.supabase_key,
        done_flag_path: args.done_flag_path || null
    };
    console.log('⚠️ Using fallback args');
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
    entryMethod: null,      // 'search' or 'url'
    didLike: false,
    didComment: false,
    didSubscribe: false,
    didPlaylist: false,
    commentText: null,
    forwardActions: 0,
    surfVideosWatched: 0,
    adsSkipped: 0,
    errors: []
};

// =============================================
// 시청 시간 계산
// =============================================
var targetDurationSec = Math.floor(
    Math.random() * (params.duration_max_sec - params.duration_min_sec + 1)
) + params.duration_min_sec;

console.log('=== Bot v4.0 Started ===');
console.log('Job ID:', params.job_id);
console.log('Video:', params.video_url);
console.log('Keyword:', params.keyword || '(없음 - 제목 사용)');
console.log('Target Duration:', targetDurationSec + 's');
console.log('Features: Search=' + params.enable_search + 
            ', Forward=' + params.enable_forward_action + 
            ', Surf=' + params.enable_random_surf);

// =============================================
// 메인 실행
// =============================================

var startTime = Date.now();

// 1. YouTube 앱 실행
console.log('[Step 1] YouTube 앱 실행');
app.launchApp('YouTube');
waitForPackage('com.google.android.youtube', 10000);
sleep(random(2000, 4000));

// 2. 광고 스킵 스레드 시작
console.log('[Step 2] 광고 스킵 스레드 시작');
if (AdSkipper) {
    AdSkipper.start(function(count) {
        jobResult.adsSkipped = count;
    });
}

// 3. 키워드 검색 또는 URL 직접 진입
console.log('[Step 3] 영상 진입');
if (params.enable_search && SearchFlow) {
    var searchResult = SearchFlow.executeSearchFlow({
        keyword: params.keyword,
        videoTitle: params.video_title,
        videoUrl: params.video_url
    });
    jobResult.entryMethod = searchResult.method;
    
    if (!searchResult.success) {
        jobResult.errors.push('entry: 영상 진입 실패');
    }
} else {
    // URL 직접 진입
    if (YouTubeActions) {
        YouTubeActions.launchYouTube(params.video_url);
    } else {
        app.startActivity({
            action: 'android.intent.action.VIEW',
            data: params.video_url,
            packageName: 'com.google.android.youtube'
        });
        sleep(5000);
    }
    jobResult.entryMethod = 'url';
}

// EvidenceManager 초기화
if (EvidenceManager) {
    EvidenceManager.startJob(params.assignment_id);
}

// 4. 초기 시청 + 앞으로가기 액션
console.log('[Step 4] 초기 시청 및 앞으로가기 액션');
sleep(10000); // 초기 10초 시청

if (params.enable_forward_action) {
    performForwardActions(params.forward_action_count);
}

// 5. 메인 시청 루프
console.log('[Step 5] 메인 시청 시작');
threads.start(function() {
    var elapsed = 10 + (jobResult.forwardActions * 12); // 초기 10초 + 앞으로가기 시간
    var actionsPerformed = false;

    // 시청 루프
    while (elapsed < targetDurationSec) {
        sleep(10000); // 10초 대기
        elapsed += 10;

        // 진행률 계산 및 보고
        var progressPct = Math.round(Math.min(100, (elapsed / targetDurationSec) * 100));
        console.log('Watching...', elapsed + 's /', targetDurationSec + 's (' + progressPct + '%)');

        if (SupabaseClient) {
            SupabaseClient.updateProgress(params.assignment_id, progressPct);
        }

        // 50% 시청 후 액션 수행 (한 번만)
        if (!actionsPerformed && elapsed >= targetDurationSec * 0.5) {
            console.log('[Step 6] 상호작용 액션');
            performActions();
            actionsPerformed = true;
        }
    }

    // 7. 랜덤 서핑
    if (params.enable_random_surf && RandomSurf) {
        console.log('[Step 7] 랜덤 피드 서핑');
        var surfResult = RandomSurf.executeSurfFlow({
            videoCount: params.surf_video_count,
            watchTimeMin: 30000,
            watchTimeMax: 60000
        });
        jobResult.surfVideosWatched = surfResult.videosWatched;
    }

    // 8. 작업 완료
    completeJob();
});

// =============================================
// 앞으로가기 액션 (오른쪽 더블탭)
// =============================================
function performForwardActions(count) {
    count = count || 5;
    var width = device.width;
    var height = device.height;

    console.log('[ForwardAction] 앞으로가기 ' + count + '회 시작');

    for (var i = 0; i < count; i++) {
        console.log('[ForwardAction] (' + (i + 1) + '/' + count + ')');
        
        // 화면 오른쪽 더블 탭 (10초 앞으로 건너뛰기)
        var tapX = width * 0.8;  // 오른쪽 80% 지점
        var tapY = height * 0.4; // 중앙 위쪽

        click(tapX, tapY);
        sleep(100);
        click(tapX, tapY);

        jobResult.forwardActions++;
        
        // 랜덤 대기
        sleep(random(2000, 5000));
    }

    console.log('[ForwardAction] 완료. 총 ' + jobResult.forwardActions + '회');
}

// =============================================
// 상호작용 액션
// =============================================
function performActions() {
    var actions = YouTubeActions || {};
    var shouldPerform = actions.shouldPerform || function(p) { return Math.random() * 100 < p; };

    // 좋아요
    if (shouldPerform(params.prob_like)) {
        console.log('[Action] 좋아요 시도...');
        try {
            var likeSuccess = actions.performLike ? actions.performLike() : false;
            if (likeSuccess) {
                jobResult.didLike = true;
                console.log('[Action] 좋아요 성공!');
            }
        } catch (e) {
            console.error('[Action] 좋아요 실패:', e.message);
            jobResult.errors.push('like: ' + e.message);
        }
        sleep(2000);
    }

    // 구독
    if (shouldPerform(params.prob_subscribe)) {
        console.log('[Action] 구독 시도...');
        try {
            var subBtn = null;
            if (typeof text !== 'undefined') {
                subBtn = text('구독').findOne(2000);
                if (!subBtn) subBtn = text('Subscribe').findOne(2000);
            }
            if (subBtn) {
                subBtn.click();
                jobResult.didSubscribe = true;
                console.log('[Action] 구독 성공!');
            }
        } catch (e) {
            console.error('[Action] 구독 실패:', e.message);
            jobResult.errors.push('subscribe: ' + e.message);
        }
        sleep(2000);
    }

    // 댓글 (서버에서 미리 생성: 확률 * 노드수 * 2)
    if (shouldPerform(params.prob_comment)) {
        console.log('[Action] 댓글 시도...');
        try {
            var comment = null;
            
            // 1순위: params.comments (서버에서 AI가 미리 생성한 댓글)
            if (params.comments && params.comments.length > 0) {
                // 순차적으로 사용 (FIFO) - 이미 사용한 댓글은 제거
                comment = params.comments.shift();
                console.log('[Action] 서버 생성 댓글 사용 (남은 ' + params.comments.length + '개)');
            }
            
            // 2순위: Supabase API (백업 - 서버에서 못 받은 경우)
            if (!comment && SupabaseClient) {
                comment = SupabaseClient.fetchRandomComment(params.device_id, params.job_id);
                if (comment) {
                    console.log('[Action] Supabase에서 댓글 로드');
                }
            }
            
            // 댓글이 없으면 스킵 (AI 생성 시스템이므로 기본 댓글 사용 안함)
            if (!comment) {
                console.log('[Action] 사용 가능한 댓글 없음 - 스킵');
            } else {
                var commentSuccess = actions.performComment ? actions.performComment(comment) : false;
                if (commentSuccess) {
                    jobResult.didComment = true;
                    jobResult.commentText = comment;
                    console.log('[Action] 댓글 성공:', comment);
                }
            }
        } catch (e) {
            console.error('[Action] 댓글 실패:', e.message);
            jobResult.errors.push('comment: ' + e.message);
        }
        sleep(2000);
    }

    // 재생목록 저장
    if (shouldPerform(params.prob_playlist)) {
        console.log('[Action] 재생목록 저장 시도...');
        try {
            var playlistSuccess = actions.performPlaylistSave ? actions.performPlaylistSave() : false;
            if (playlistSuccess) {
                jobResult.didPlaylist = true;
                console.log('[Action] 재생목록 저장 성공!');
            }
        } catch (e) {
            console.error('[Action] 재생목록 저장 실패:', e.message);
            jobResult.errors.push('playlist: ' + e.message);
        }
    }
}

// [Deprecated] 기본 댓글 풀 - AI 자동 생성 시스템 사용
// 서버에서 작업 등록 시 (확률 * 노드수 * 2) 만큼 AI가 댓글을 생성함
// function getDefaultComment() { ... }

// =============================================
// 작업 완료
// =============================================
function completeJob() {
    // 광고 스킵 스레드 중지
    if (AdSkipper) {
        AdSkipper.stop();
        jobResult.adsSkipped = AdSkipper.getSkipCount();
    }

    var elapsedMs = Date.now() - startTime;
    var elapsedSec = Math.round(elapsedMs / 1000);

    console.log('=== Job Completed ===');
    console.log('Entry Method:', jobResult.entryMethod);
    console.log('Duration:', elapsedSec + 's (target: ' + targetDurationSec + 's)');
    console.log('Forward Actions:', jobResult.forwardActions);
    console.log('Ads Skipped:', jobResult.adsSkipped);
    console.log('Like:', jobResult.didLike);
    console.log('Subscribe:', jobResult.didSubscribe);
    console.log('Comment:', jobResult.didComment, jobResult.commentText ? '(' + jobResult.commentText + ')' : '');
    console.log('Playlist:', jobResult.didPlaylist);
    console.log('Surf Videos:', jobResult.surfVideosWatched);
    if (jobResult.errors.length > 0) {
        console.log('Errors:', jobResult.errors.join(', '));
    }

    // 증거 캡처
    var screenshotPath = null;
    if (EvidenceManager) {
        var captureResult = EvidenceManager.captureScreenshot('complete');
        screenshotPath = captureResult.success ? captureResult.filePath : null;

        EvidenceManager.finishJob({
            success: true,
            watchDuration: elapsedSec
        });
    }

    // 완료 플래그 작성
    writeCompletionFlag('success', screenshotPath, null);

    // Supabase 완료 보고
    if (SupabaseClient) {
        SupabaseClient.completeAssignment(params.assignment_id, {
            durationSec: elapsedSec,
            entryMethod: jobResult.entryMethod,
            didLike: jobResult.didLike,
            didSubscribe: jobResult.didSubscribe,
            didComment: jobResult.didComment,
            didPlaylist: jobResult.didPlaylist,
            forwardActions: jobResult.forwardActions,
            adsSkipped: jobResult.adsSkipped,
            surfVideos: jobResult.surfVideosWatched
        });
    }

    // 스크립트 종료
    engines.myEngine().forceStop();
}

// 완료 플래그 작성
function writeCompletionFlag(status, screenshotPath, errorMessage) {
    try {
        var flagPath = params.done_flag_path || '/sdcard/completion_' + params.job_id + '.flag';
        var flagData = {
            status: status,
            job_id: params.job_id,
            assignment_id: params.assignment_id,
            completed_at: new Date().toISOString(),
            duration_sec: Math.round((Date.now() - startTime) / 1000),
            result: jobResult,
            screenshot_path: screenshotPath || null,
            error: errorMessage || null
        };

        files.write(flagPath, JSON.stringify(flagData, null, 2));
        console.log('✅ Completion flag written:', flagPath);
    } catch (e) {
        console.error('❌ Completion flag failed:', e.message);
    }
}
