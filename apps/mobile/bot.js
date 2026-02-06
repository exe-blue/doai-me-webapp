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
var SearchFlow, AdSkipper, RandomSurf, Logger;

(function loadModules() {
    var corePath = BASE_PATH + '/core/';

    // AutoX.js 환경 체크
    if (typeof files === 'undefined' || !files.exists) {
        console.error('[Bot] AutoX.js 환경이 아닙니다');
        return;
    }

    var modules = [
        { name: 'Logger', file: 'Logger.js' },  // Logger 먼저 로드
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
                    case 'Logger': Logger = loaded; break;
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
    
    // Logger 초기화
    if (Logger) {
        Logger.init();
    }
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

// =============================================
// 로그 헬퍼 함수
// =============================================
function log(step, msg) {
    if (Logger) {
        Logger.step(step, msg);
    } else {
        console.log('[Step ' + step + '] ' + msg);
    }
}

function logDelay(minMs, maxMs) {
    if (Logger) {
        return Logger.randomDelay(minMs, maxMs);
    } else {
        var delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        console.log('[Delay] Sleeping for ' + delay + 'ms...');
        sleep(delay);
        return delay;
    }
}

// =============================================
// 메인 실행
// =============================================

var startTime = Date.now();

// Logger 세션 시작
if (Logger) {
    Logger.startSession(params.job_id);
}

log(0, '작업 시작: ' + (params.video_title || params.video_url));
log(0, 'Target Duration: ' + targetDurationSec + 's, Search=' + params.enable_search + 
       ', Forward=' + params.enable_forward_action + ', Surf=' + params.enable_random_surf);

// 1. YouTube 앱 실행
log(1, 'YouTube 앱 실행');
app.launchApp('YouTube');
waitForPackage('com.google.android.youtube', 10000);
logDelay(2000, 7000);  // +3000ms 랜덤 범위

// 2. 광고 스킵 스레드 시작
log(2, '광고 스킵 스레드 시작');
if (AdSkipper) {
    AdSkipper.start(function(count) {
        jobResult.adsSkipped = count;
        if (Logger) {
            Logger.ads('광고 스킵 버튼 감지 및 클릭 (총 ' + count + '회)');
        }
    });
}

// 3. URL 보정 및 키워드 설정
var normalizedUrl = params.video_url;
if (SearchFlow && normalizedUrl.includes('youtu.be')) {
    normalizedUrl = SearchFlow.normalizeUrl(normalizedUrl);
    log(3, 'URL 보정 완료: ' + normalizedUrl);
}

// 4. 키워드 설정 (없으면 제목 사용)
var searchKeyword = params.keyword;
if (!searchKeyword || searchKeyword.trim() === '') {
    searchKeyword = params.video_title;
    log(4, '키워드 부재로 제목을 키워드로 설정');
} else {
    log(4, '키워드 설정: ' + searchKeyword);
}

// 5. 키워드 검색 또는 URL 직접 진입
if (params.enable_search && SearchFlow && searchKeyword) {
    log(5, '검색 수행: ' + searchKeyword);
    
    var searchResult = SearchFlow.executeSearchFlow({
        keyword: searchKeyword,
        videoTitle: params.video_title,
        videoUrl: normalizedUrl
    });
    jobResult.entryMethod = searchResult.method;
    
    if (searchResult.success) {
        log(6, '영상 발견 및 클릭 (방식: ' + searchResult.method + ')');
    } else {
        log(6, '검색 실패 → URL 직접 진입');
        jobResult.errors.push('entry: 영상 진입 실패');
    }
} else {
    log(5, 'URL 직접 진입: ' + normalizedUrl);
    // URL 직접 진입
    if (YouTubeActions) {
        YouTubeActions.launchYouTube(normalizedUrl);
    } else {
        app.startActivity({
            action: 'android.intent.action.VIEW',
            data: normalizedUrl,
            packageName: 'com.google.android.youtube'
        });
        logDelay(5000, 8000);  // +3000ms 랜덤 범위
    }
    jobResult.entryMethod = 'url';
}

// EvidenceManager 초기화
if (EvidenceManager) {
    EvidenceManager.startJob(params.assignment_id);
}

// 7. 광고 대기 (광고 스킵 스레드가 처리)
log(7, '광고 대기 중... (AdSkipper가 자동 처리)');
logDelay(3000, 8000);  // +3000ms 랜덤 범위

// 8. 시청 시작 및 앞으로가기 액션
log(8, '시청 시작 (예정: ' + targetDurationSec + '초)');
logDelay(10000, 13000);  // 초기 10~13초 시청 (+3000ms 랜덤 범위)

if (params.enable_forward_action) {
    performForwardActions(params.forward_action_count);
}

// 9. 메인 시청 루프 및 상호작용
threads.start(function() {
    var elapsed = 10 + (jobResult.forwardActions * 8); // 평균 대기시간 기준
    // 시청 루프
    while (elapsed < targetDurationSec) {
        // +3000ms 랜덤 범위로 노드별 다른 대기시간
        var loopDelay = Math.floor(Math.random() * 3001) + 10000;  // 10~13초
        sleep(loopDelay);
        elapsed += Math.round(loopDelay / 1000);

        // 진행률 계산 및 보고
        var progressPct = Math.round(Math.min(100, (elapsed / targetDurationSec) * 100));
        log(8, '시청 중... ' + elapsed + 's / ' + targetDurationSec + 's (' + progressPct + '%)');

        if (SupabaseClient) {
            SupabaseClient.updateProgress(params.assignment_id, progressPct);
        }

        // 50% 시청 후 액션 수행 (한 번만)
        if (!actionsPerformed && elapsed >= targetDurationSec * 0.5) {
            log(9, '상호작용 액션 시작');
            performActions();
            actionsPerformed = true;
        }
    }

    // 10. 본 영상 시청 종료
    log(10, '본 영상 시청 종료');

    // 11. 랜덤 서핑
    if (params.enable_random_surf && RandomSurf) {
        log(11, '추가 랜덤 시청 프로세스 진입');
        var surfResult = RandomSurf.executeSurfFlow({
            videoCount: params.surf_video_count,
            watchTimeMin: 30000,
            watchTimeMax: 60000
        });
        jobResult.surfVideosWatched = surfResult.videosWatched;
        
        if (surfResult.videosWatched === 0) {
            log(11, "피드 영상 없음 → '투자' 검색 시도");
        } else {
            log(11, '랜덤 영상 시청 완료: ' + surfResult.videosWatched + '개');
        }
    }

    // 12. 작업 완료
    log(12, '모든 작업 완료. 결과 보고 전송');
    completeJob();
});

// =============================================
// 앞으로가기 액션 (오른쪽 더블탭)
// =============================================
function performForwardActions(count) {
    count = count || 5;
    var width = device.width;
    var height = device.height;

    log(8, '앞으로가기 액션 시작 (' + count + '회 예정)');

    for (var i = 0; i < count; i++) {
        log(8, '앞으로가기 액션 (' + (i + 1) + '/' + count + ')');
        
        // 화면 오른쪽 더블 탭 (10초 앞으로 건너뛰기)
        var tapX = width * 0.8;  // 오른쪽 80% 지점
        var tapY = height * 0.4; // 중앙 위쪽

        click(tapX, tapY);
        sleep(100);
        click(tapX, tapY);

        jobResult.forwardActions++;
        
        // 랜덤 대기 (+3000ms 범위)
        logDelay(2000, 8000);
    }

    log(8, '앞으로가기 완료. 총 ' + jobResult.forwardActions + '회');
}

// =============================================
// 상호작용 액션
// =============================================
function performActions() {
    var actions = YouTubeActions || {};
    var shouldPerform = actions.shouldPerform || function(p) { return Math.random() * 100 < p; };

    // 좋아요
    if (shouldPerform(params.prob_like)) {
        if (Logger) Logger.action('좋아요', '시도 중...');
        try {
            var likeSuccess = actions.performLike ? actions.performLike() : false;
            if (likeSuccess) {
                jobResult.didLike = true;
                if (Logger) Logger.action('좋아요', '성공');
            } else {
                if (Logger) Logger.action('좋아요', '버튼 찾지 못함');
            }
        } catch (e) {
            if (Logger) Logger.error('좋아요 실패: ' + e.message);
            jobResult.errors.push('like: ' + e.message);
        }
        logDelay(1500, 5500);  // +3000ms 랜덤 범위
    }

    // 구독
    if (shouldPerform(params.prob_subscribe)) {
        if (Logger) Logger.action('구독', '시도 중...');
        try {
            var subBtn = null;
            if (typeof text !== 'undefined') {
                subBtn = text('구독').findOne(2000);
                if (!subBtn) subBtn = text('Subscribe').findOne(2000);
            }
            if (subBtn) {
                subBtn.click();
                jobResult.didSubscribe = true;
                if (Logger) Logger.action('구독', '성공');
            } else {
                if (Logger) Logger.action('구독', '버튼 찾지 못함');
            }
        } catch (e) {
            if (Logger) Logger.error('구독 실패: ' + e.message);
            jobResult.errors.push('subscribe: ' + e.message);
        }
        logDelay(1500, 5500);  // +3000ms 랜덤 범위
    }

    // 댓글 (서버에서 미리 생성: 확률 * 노드수 * 2)
    if (shouldPerform(params.prob_comment)) {
        if (Logger) Logger.action('댓글', '시도 중...');
        try {
            var comment = null;
            
            // 1순위: params.comments (서버에서 AI가 미리 생성한 댓글)
            if (params.comments && params.comments.length > 0) {
                // 순차적으로 사용 (FIFO) - 이미 사용한 댓글은 제거
                comment = params.comments.shift();
                if (Logger) Logger.info('Comment', '서버 생성 댓글 사용 (남은 ' + params.comments.length + '개)');
            }
            
            // 2순위: Supabase API (백업 - 서버에서 못 받은 경우)
            if (!comment && SupabaseClient) {
                comment = SupabaseClient.fetchRandomComment(params.device_id, params.job_id);
                if (comment) {
                    if (Logger) Logger.info('Comment', 'Supabase에서 댓글 로드');
                }
            }
            
            // 댓글이 없으면 스킵 (AI 생성 시스템이므로 기본 댓글 사용 안함)
            if (!comment) {
                if (Logger) Logger.action('댓글', '사용 가능한 댓글 없음 - 스킵');
            } else {
                var commentSuccess = actions.performComment ? actions.performComment(comment) : false;
                if (commentSuccess) {
                    jobResult.didComment = true;
                    jobResult.commentText = comment;
                    if (Logger) Logger.action('댓글', '성공: ' + comment);
                } else {
                    if (Logger) Logger.action('댓글', '입력 실패');
                }
            }
        } catch (e) {
            if (Logger) Logger.error('댓글 실패: ' + e.message);
            jobResult.errors.push('comment: ' + e.message);
        }
        logDelay(1500, 5500);  // +3000ms 랜덤 범위
    }

    // 재생목록 저장
    if (shouldPerform(params.prob_playlist)) {
        if (Logger) Logger.action('재생목록', '시도 중...');
        try {
            var playlistSuccess = actions.performPlaylistSave ? actions.performPlaylistSave() : false;
            if (playlistSuccess) {
                jobResult.didPlaylist = true;
                if (Logger) Logger.action('재생목록', '저장 성공');
            } else {
                if (Logger) Logger.action('재생목록', '버튼 찾지 못함');
            }
        } catch (e) {
            if (Logger) Logger.error('재생목록 저장 실패: ' + e.message);
            jobResult.errors.push('playlist: ' + e.message);
        }
    }
    
    log(9, '상호작용 완료 - Like:' + jobResult.didLike + ', Sub:' + jobResult.didSubscribe + 
           ', Comment:' + jobResult.didComment + ', Playlist:' + jobResult.didPlaylist);
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

    // 완료 로그
    if (Logger) {
        Logger.info('Result', 'Entry: ' + jobResult.entryMethod + ', Duration: ' + elapsedSec + 's');
        Logger.info('Result', 'Forward: ' + jobResult.forwardActions + ', Ads Skipped: ' + jobResult.adsSkipped);
        Logger.info('Result', 'Like: ' + jobResult.didLike + ', Sub: ' + jobResult.didSubscribe + 
                              ', Comment: ' + jobResult.didComment + ', Playlist: ' + jobResult.didPlaylist);
        Logger.info('Result', 'Surf Videos: ' + jobResult.surfVideosWatched);
        
        if (jobResult.errors.length > 0) {
            Logger.error('Errors: ' + jobResult.errors.join(', '));
        }
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

    // Logger 세션 종료
    if (Logger) {
        Logger.endSession();
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
