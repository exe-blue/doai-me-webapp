/**
 * test_bot.js
 * bot.js 통합 단위 테스트
 *
 * 실행: node apps/mobile/tests/test_bot.js
 *
 * AutoX.js 글로벌을 모킹하고 vm.runInNewContext로 bot.js를 실행하여
 * 파라미터 로딩, 헬퍼 함수, 상호작용 액션, 완료 플래그 등을 검증한다.
 */

var vm = require('vm');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

// =============================================
// 테스트 유틸
// =============================================
var passed = 0;
var failed = 0;
var total = 0;

function test(name, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log('  ✅ ' + name);
    } catch (e) {
        failed++;
        console.error('  ❌ ' + name);
        console.error('     ' + e.message);
    }
}

function describe(section, fn) {
    console.log('\n[' + section + ']');
    fn();
}

// =============================================
// Mock 팩토리
// =============================================

/**
 * AutoX.js + 모듈 전체를 모킹한 샌드박스 컨텍스트를 생성한다.
 * @param {object} overrides - sandbox 오버라이드
 * @returns {object} sandbox context
 */
function createSandbox(overrides) {
    overrides = overrides || {};

    var writtenFiles = {};
    var consoleLogs = [];
    var clickLog = [];
    var sleepLog = [];
    var launchedApps = [];
    var startedActivities = [];
    var threadFns = [];

    // --- files mock ---
    var fileStore = overrides.fileStore || {};
    var filesMock = {
        exists: function(p) { return p in fileStore; },
        read: function(p) { return fileStore[p] || ''; },
        write: function(p, content) { writtenFiles[p] = content; },
    };

    // --- engines mock ---
    var execArgv = overrides.execArgv || {};
    var enginesMock = {
        myEngine: function() {
            return {
                execArgv: execArgv,
                forceStop: function() { /* noop */ },
            };
        },
    };

    // --- app mock ---
    var appMock = {
        launchApp: function(name) { launchedApps.push(name); },
        startActivity: function(opts) { startedActivities.push(opts); },
    };

    // --- device mock ---
    var deviceMock = { width: 1080, height: 1920 };

    // --- Logger mock ---
    var loggerSteps = [];
    var LoggerMock = {
        init: function() { return true; },
        startSession: function() {},
        endSession: function() {},
        step: function(step, msg) { loggerSteps.push({ step: step, msg: msg }); },
        randomDelay: function(min, max) {
            var d = min; // deterministic
            sleepLog.push(d);
            return d;
        },
        delay: function(ms) {},
        action: function(name, msg) { loggerSteps.push({ action: name, msg: msg }); },
        info: function(tag, msg) { loggerSteps.push({ info: tag, msg: msg }); },
        error: function(msg) { loggerSteps.push({ error: msg }); },
        ads: function(msg) { loggerSteps.push({ ads: msg }); },
    };

    // --- SupabaseClient mock ---
    var supabaseCalls = [];
    var SupabaseClientMock = {
        init: function(opts) { supabaseCalls.push({ method: 'init', opts: opts }); },
        updateProgress: function(id, pct) { supabaseCalls.push({ method: 'updateProgress', id: id, pct: pct }); },
        completeAssignment: function(id, data) { supabaseCalls.push({ method: 'completeAssignment', id: id, data: data }); },
        fetchRandomComment: function() { return null; },
    };

    // --- EvidenceManager mock ---
    var evidenceCalls = [];
    var EvidenceManagerMock = {
        startJob: function(id) { evidenceCalls.push({ method: 'startJob', id: id }); },
        captureScreenshot: function(tag) {
            evidenceCalls.push({ method: 'captureScreenshot', tag: tag });
            return { success: true, filePath: '/sdcard/screenshot.png' };
        },
        finishJob: function(data) { evidenceCalls.push({ method: 'finishJob', data: data }); },
    };

    // --- AdSkipper mock ---
    var adSkipperRunning = false;
    var AdSkipperMock = {
        start: function(cb) { adSkipperRunning = true; if (cb) cb(0); },
        stop: function() { adSkipperRunning = false; },
        getSkipCount: function() { return 2; },
    };

    // --- SearchFlow mock ---
    var searchFlowResult = overrides.searchFlowResult || { success: true, method: 'search' };
    var SearchFlowMock = {
        normalizeUrl: function(url) {
            if (url && url.includes('youtu.be/')) {
                var videoId = url.split('youtu.be/')[1];
                if (videoId) {
                    videoId = videoId.split('?')[0].split('&')[0];
                    return 'https://www.youtube.com/watch?v=' + videoId;
                }
            }
            return url;
        },
        executeSearchFlow: function(opts) { return searchFlowResult; },
    };

    // --- RandomSurf mock ---
    var RandomSurfMock = {
        executeSurfFlow: function(opts) { return { videosWatched: opts.videoCount || 1 }; },
    };

    // --- YouTubeActions mock ---
    var actionsCalled = [];
    var YouTubeActionsMock = overrides.YouTubeActionsMock || {
        launchYouTube: function(url) { actionsCalled.push({ method: 'launchYouTube', url: url }); },
        shouldPerform: function(prob) { return prob > 0; },
        performLike: function() { actionsCalled.push('like'); return true; },
        performComment: function(text) { actionsCalled.push({ comment: text }); return true; },
        performPlaylistSave: function() { actionsCalled.push('playlist'); return true; },
    };

    // --- Utils mock ---
    var UtilsMock = {
        loadJobParams: function(p) { return JSON.parse(fileStore[p] || '{}'); },
    };

    // --- require mock ---
    var coreModules = {
        'Logger': LoggerMock,
        'Utils': UtilsMock,
        'SupabaseClient': SupabaseClientMock,
        'EvidenceManager': EvidenceManagerMock,
        'ErrorRecovery': {},
        'YouTubeActions': YouTubeActionsMock,
        'SearchFlow': SearchFlowMock,
        'AdSkipper': AdSkipperMock,
        'RandomSurf': RandomSurfMock,
    };

    function requireMock(modPath) {
        for (var name in coreModules) {
            if (modPath.indexOf(name + '.js') !== -1) {
                return coreModules[name];
            }
        }
        return {};
    }

    // Make all core file paths "exist"
    var coreFiles = [
        'Logger.js', 'Utils.js', 'SupabaseClient.js', 'EvidenceManager.js',
        'ErrorRecovery.js', 'YouTubeActions.js', 'SearchFlow.js', 'AdSkipper.js', 'RandomSurf.js',
    ];
    coreFiles.forEach(function(f) {
        fileStore['/sdcard/Scripts/doai-bot/core/' + f] = '/* mock */';
    });

    var sandbox = {
        // Node/global
        console: {
            log: function() { consoleLogs.push(Array.prototype.slice.call(arguments).join(' ')); },
            warn: function() { consoleLogs.push('[WARN] ' + Array.prototype.slice.call(arguments).join(' ')); },
            error: function() { consoleLogs.push('[ERROR] ' + Array.prototype.slice.call(arguments).join(' ')); },
        },
        require: requireMock,
        module: { exports: {} },
        Date: Date,
        Math: Math,
        JSON: JSON,
        parseInt: parseInt,
        String: String,

        // AutoX.js globals
        files: filesMock,
        engines: enginesMock,
        app: appMock,
        device: deviceMock,
        sleep: function(ms) { sleepLog.push(ms); },
        click: function(x, y) { clickLog.push({ x: x, y: y }); },
        waitForPackage: function() {},
        text: function(t) {
            return {
                findOne: function() {
                    if (t === '구독' || t === 'Subscribe') {
                        return { click: function() { actionsCalled.push('subscribe_click'); } };
                    }
                    return null;
                },
            };
        },
        threads: {
            start: function(fn) { threadFns.push(fn); },
        },
        android: {
            util: {
                Base64: {
                    // Return decoded string directly (no cross-ref to java mock)
                    decode: function(str, flag) { return Buffer.from(str, 'base64').toString(); },
                    DEFAULT: 0,
                },
            },
        },
        java: {
            lang: {
                String: function(s) { return String(s); },
            },
        },
        Buffer: Buffer,
        // bot.js uses undeclared actionsPerformed as implicit global
        actionsPerformed: false,

        // exposed for assertions
        _test: {
            consoleLogs: consoleLogs,
            writtenFiles: writtenFiles,
            clickLog: clickLog,
            sleepLog: sleepLog,
            launchedApps: launchedApps,
            startedActivities: startedActivities,
            threadFns: threadFns,
            loggerSteps: loggerSteps,
            supabaseCalls: supabaseCalls,
            evidenceCalls: evidenceCalls,
            actionsCalled: actionsCalled,
            adSkipperRunning: function() { return adSkipperRunning; },
        },
    };

    // Apply overrides
    for (var key in overrides) {
        if (key !== 'fileStore' && key !== 'execArgv' && key !== 'searchFlowResult' && key !== 'YouTubeActionsMock') {
            sandbox[key] = overrides[key];
        }
    }

    return sandbox;
}

/**
 * bot.js를 주어진 sandbox에서 실행한다.
 * 반환: sandbox (side-effect 검사용)
 */
function runBot(sandbox) {
    var botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
    var ctx = vm.createContext(sandbox);
    vm.runInContext(botSource, ctx, { filename: 'bot.js' });
    return ctx;
}

// =============================================
// 테스트 시작
// =============================================
console.log('========================================');
console.log('bot.js 통합 테스트');
console.log('========================================');

// -------------------------------------------
describe('모듈 로딩', function() {
    test('files 전역이 있으면 모든 코어 모듈을 로드한다', function() {
        var sb = createSandbox();
        var ctx = runBot(sb);
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('Logger 로드 성공'), 'Logger loaded');
        assert.ok(logs.includes('Utils 로드 성공'), 'Utils loaded');
        assert.ok(logs.includes('SearchFlow 로드 성공'), 'SearchFlow loaded');
    });

    test('files 전역이 없으면 모듈 로드를 건너뛴다', function() {
        var sb = createSandbox();
        delete sb.files; // files 전역 제거
        // loadModules IIFE를 BASE_PATH와 함께 추출 실행
        var botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
        var loadModulesMatch = botSource.match(/\(function loadModules\(\)[\s\S]*?\}\)\(\);/);
        assert.ok(loadModulesMatch, 'loadModules IIFE found');
        var ctx = vm.createContext(sb);
        // BASE_PATH는 loadModules 바깥에 선언됨 — 주입
        vm.runInContext("var BASE_PATH = '/sdcard/Scripts/doai-bot';\n" + loadModulesMatch[0], ctx, { filename: 'bot.js' });
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('AutoX.js 환경이 아닙니다'), 'shows environment error');
    });
});

// -------------------------------------------
describe('파라미터 로딩 - Intent Base64', function() {
    test('Base64 jobDataB64에서 파라미터를 로드한다', function() {
        var jobData = {
            job_id: 'b64-job',
            assignment_id: 'b64-assign',
            device_id: 'dev-001',
            video_url: 'https://www.youtube.com/watch?v=abc123',
            video_title: 'Test Video',
            keyword: 'test keyword',
            duration_min_sec: 30,
            duration_max_sec: 60,
            prob_like: 100,
            prob_comment: 0,
            prob_subscribe: 0,
            prob_playlist: 0,
            enable_search: true,
            enable_forward_action: false,
            enable_random_surf: false,
            forward_action_count: 3,
            surf_video_count: 1,
            comments: [],
            supabase_url: 'https://test.supabase.co',
            supabase_key: 'test-key',
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);

        assert.strictEqual(ctx.params.job_id, 'b64-job');
        assert.strictEqual(ctx.params.device_id, 'dev-001');
        assert.strictEqual(ctx.params.video_title, 'Test Video');
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('Parameters loaded from Intent (Base64)'));
    });
});

// -------------------------------------------
describe('파라미터 로딩 - Intent JSON', function() {
    test('jobData JSON 문자열에서 파라미터를 로드한다', function() {
        var jobData = {
            job_id: 'json-job',
            assignment_id: 'json-assign',
            device_id: 'dev-002',
            video_url: 'https://www.youtube.com/watch?v=xyz',
            duration_min_sec: 60,
            duration_max_sec: 120,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 5, surf_video_count: 1, comments: [],
        };
        var sb = createSandbox({ execArgv: { jobData: JSON.stringify(jobData) } });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.params.job_id, 'json-job');
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('Parameters loaded from Intent (JSON)'));
    });
});

// -------------------------------------------
describe('파라미터 로딩 - job.json 파일', function() {
    test('Intent 없으면 job.json에서 파라미터를 로드한다', function() {
        var jobData = {
            job_id: 'file-job',
            assignment_id: 'file-assign',
            device_id: 'dev-003',
            video_url: 'https://www.youtube.com/watch?v=file',
            duration_min_sec: 60,
            duration_max_sec: 120,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 5, surf_video_count: 1, comments: [],
        };
        var fileStore = {};
        fileStore['/sdcard/job.json'] = JSON.stringify(jobData);
        var sb = createSandbox({ execArgv: {}, fileStore: fileStore });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.params.job_id, 'file-job');
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('Parameters loaded from job.json'));
    });
});

// -------------------------------------------
describe('파라미터 로딩 - Fallback args', function() {
    test('Intent/job.json 모두 없으면 fallback args를 사용한다', function() {
        var sb = createSandbox({
            execArgv: {
                job_id: 'fallback-job',
                device_id: 'fb-dev',
                duration_min_sec: '45',
                duration_max_sec: '90',
            },
        });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.params.job_id, 'fallback-job');
        assert.strictEqual(ctx.params.device_id, 'fb-dev');
        assert.strictEqual(ctx.params.duration_min_sec, 45);
        assert.strictEqual(ctx.params.duration_max_sec, 90);
        var logs = sb._test.consoleLogs.join('\n');
        assert.ok(logs.includes('Using fallback args'));
    });

    test('fallback에서 기본값이 올바르게 설정된다', function() {
        var sb = createSandbox({ execArgv: {} });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.params.job_id, 'test-job');
        assert.strictEqual(ctx.params.duration_min_sec, 60);
        assert.strictEqual(ctx.params.duration_max_sec, 180);
        assert.strictEqual(ctx.params.prob_like, 0);
        assert.strictEqual(ctx.params.enable_search, true);
    });
});

// -------------------------------------------
describe('시청 시간 계산', function() {
    test('targetDurationSec이 min~max 범위 안에 있다', function() {
        for (var i = 0; i < 20; i++) {
            var sb = createSandbox({
                execArgv: { duration_min_sec: '30', duration_max_sec: '60' },
            });
            var ctx = runBot(sb);
            assert.ok(ctx.targetDurationSec >= 30, 'min bound: ' + ctx.targetDurationSec);
            assert.ok(ctx.targetDurationSec <= 60, 'max bound: ' + ctx.targetDurationSec);
        }
    });
});

// -------------------------------------------
describe('log 헬퍼', function() {
    test('Logger가 있으면 Logger.step을 호출한다', function() {
        var sb = createSandbox({ execArgv: {} });
        var ctx = runBot(sb);
        var steps = sb._test.loggerSteps.filter(function(l) { return l.step === 0; });
        assert.ok(steps.length > 0, 'step 0 logged via Logger');
    });
});

// -------------------------------------------
describe('YouTube 앱 실행', function() {
    test('app.launchApp("YouTube")이 호출된다', function() {
        var sb = createSandbox({ execArgv: {} });
        runBot(sb);
        assert.ok(sb._test.launchedApps.includes('YouTube'), 'YouTube launched');
    });
});

// -------------------------------------------
describe('AdSkipper', function() {
    test('AdSkipper.start가 호출된다', function() {
        var sb = createSandbox({ execArgv: {} });
        runBot(sb);
        // AdSkipper.start was called (it sets adSkipperRunning = true)
        // After completeJob (in thread) it would stop, but threads are deferred
        // Just verify start was called by checking the callback set adsSkipped
        assert.strictEqual(sb._test.adSkipperRunning(), true, 'AdSkipper started');
    });
});

// -------------------------------------------
describe('URL 보정', function() {
    test('youtu.be URL이 youtube.com으로 변환된다', function() {
        var sb = createSandbox({
            execArgv: {
                video_url: 'https://youtu.be/dQw4w9WgXcQ',
                enable_search: 'false',
                enable_forward_action: 'false',
                enable_random_surf: 'false',
            },
        });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.normalizedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
});

// -------------------------------------------
describe('검색 흐름', function() {
    test('enable_search=true이면 SearchFlow.executeSearchFlow가 호출된다', function() {
        var jobData = {
            job_id: 'search-job', assignment_id: 'a1', device_id: 'd1',
            video_url: 'https://www.youtube.com/watch?v=test',
            video_title: 'Test', keyword: 'test keyword',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: true, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({
            execArgv: { jobDataB64: b64 },
            searchFlowResult: { success: true, method: 'search' },
        });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.jobResult.entryMethod, 'search');
    });

    test('enable_search=false이면 URL 직접 진입한다', function() {
        var jobData = {
            job_id: 'url-job', assignment_id: 'a2', device_id: 'd2',
            video_url: 'https://www.youtube.com/watch?v=direct',
            video_title: '', keyword: '',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.jobResult.entryMethod, 'url');
    });
});

// -------------------------------------------
describe('performForwardActions', function() {
    test('지정 횟수만큼 더블 탭(클릭 2회)을 수행한다', function() {
        var jobData = {
            job_id: 'fwd-job', assignment_id: 'a3', device_id: 'd3',
            video_url: 'https://www.youtube.com/watch?v=fwd',
            video_title: '', keyword: '',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: true, enable_random_surf: false,
            forward_action_count: 3, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);

        // 3 forward actions × 2 clicks each = 6 clicks
        assert.strictEqual(sb._test.clickLog.length, 6, 'click count: ' + sb._test.clickLog.length);
        assert.strictEqual(ctx.jobResult.forwardActions, 3);
    });

    test('클릭 좌표가 화면 오른쪽 80% 지점이다', function() {
        var jobData = {
            job_id: 'coord-job', assignment_id: 'a4', device_id: 'd4',
            video_url: 'https://www.youtube.com/watch?v=coord',
            video_title: '', keyword: '',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: true, enable_random_surf: false,
            forward_action_count: 1, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        runBot(sb);

        var firstClick = sb._test.clickLog[0];
        assert.strictEqual(firstClick.x, 1080 * 0.8, 'x = 80% of width');
        assert.strictEqual(firstClick.y, 1920 * 0.4, 'y = 40% of height');
    });
});

// -------------------------------------------
describe('threads.start (메인 시청 루프)', function() {
    test('메인 루프가 threads.start에 등록된다', function() {
        var sb = createSandbox({ execArgv: {} });
        runBot(sb);
        assert.strictEqual(sb._test.threadFns.length, 1, 'one thread started');
    });
});

// -------------------------------------------
describe('completeJob (스레드 내 실행)', function() {
    test('완료 플래그 파일을 작성한다', function() {
        var jobData = {
            job_id: 'complete-job', assignment_id: 'complete-assign', device_id: 'dev-c',
            video_url: 'https://www.youtube.com/watch?v=complete',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
            supabase_url: 'https://test.supabase.co', supabase_key: 'key',
            done_flag_path: '/sdcard/test_completion.flag',
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);

        // 스레드 함수를 직접 실행 (시청 루프를 빠르게 끝내기 위해 duration이 1~2초)
        // 스레드 내부 while 루프가 elapsed(10+)가 이미 targetDuration(1~2)을 초과하므로 바로 completeJob 호출
        var threadFn = sb._test.threadFns[0];
        threadFn();

        // 완료 플래그 파일 확인
        var flagContent = sb._test.writtenFiles['/sdcard/test_completion.flag'];
        assert.ok(flagContent, 'completion flag written');

        var flagData = JSON.parse(flagContent);
        assert.strictEqual(flagData.status, 'success');
        assert.strictEqual(flagData.job_id, 'complete-job');
        assert.strictEqual(flagData.assignment_id, 'complete-assign');
        assert.ok(flagData.completed_at, 'has completed_at timestamp');
        assert.ok(flagData.duration_sec >= 0, 'has duration');
    });

    test('Supabase completeAssignment가 호출된다', function() {
        var jobData = {
            job_id: 'supa-job', assignment_id: 'supa-assign', device_id: 'dev-s',
            video_url: 'https://www.youtube.com/watch?v=supa',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
            supabase_url: 'https://test.supabase.co', supabase_key: 'key',
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        sb._test.threadFns[0]();

        var completeCall = sb._test.supabaseCalls.find(function(c) { return c.method === 'completeAssignment'; });
        assert.ok(completeCall, 'completeAssignment called');
        assert.strictEqual(completeCall.id, 'supa-assign');
    });

    test('AdSkipper.stop이 호출되고 스킵 카운트가 기록된다', function() {
        var jobData = {
            job_id: 'ad-job', assignment_id: 'ad-assign', device_id: 'dev-a',
            video_url: 'https://www.youtube.com/watch?v=ad',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        sb._test.threadFns[0]();

        assert.strictEqual(sb._test.adSkipperRunning(), false, 'AdSkipper stopped');
        assert.strictEqual(ctx.jobResult.adsSkipped, 2, 'skip count from mock');
    });
});

// -------------------------------------------
describe('writeCompletionFlag', function() {
    test('done_flag_path가 없으면 기본 경로를 사용한다', function() {
        var jobData = {
            job_id: 'flag-job', assignment_id: 'flag-assign', device_id: 'dev-f',
            video_url: 'https://www.youtube.com/watch?v=flag',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        sb._test.threadFns[0]();

        var defaultPath = '/sdcard/completion_flag-job.flag';
        assert.ok(sb._test.writtenFiles[defaultPath], 'written to default path');
    });
});

// -------------------------------------------
describe('EvidenceManager', function() {
    test('startJob과 captureScreenshot/finishJob이 호출된다', function() {
        var jobData = {
            job_id: 'ev-job', assignment_id: 'ev-assign', device_id: 'dev-e',
            video_url: 'https://www.youtube.com/watch?v=ev',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        sb._test.threadFns[0]();

        var startJobCall = sb._test.evidenceCalls.find(function(c) { return c.method === 'startJob'; });
        assert.ok(startJobCall, 'startJob called');
        assert.strictEqual(startJobCall.id, 'ev-assign');

        var screenshotCall = sb._test.evidenceCalls.find(function(c) { return c.method === 'captureScreenshot'; });
        assert.ok(screenshotCall, 'captureScreenshot called');

        var finishCall = sb._test.evidenceCalls.find(function(c) { return c.method === 'finishJob'; });
        assert.ok(finishCall, 'finishJob called');
        assert.strictEqual(finishCall.data.success, true);
    });
});

// -------------------------------------------
describe('RandomSurf', function() {
    test('enable_random_surf=true이면 랜덤 서핑이 실행된다', function() {
        var jobData = {
            job_id: 'surf-job', assignment_id: 'surf-assign', device_id: 'dev-surf',
            video_url: 'https://www.youtube.com/watch?v=surf',
            video_title: '', keyword: '',
            duration_min_sec: 1, duration_max_sec: 2,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: true,
            forward_action_count: 0, surf_video_count: 2, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        sb._test.threadFns[0]();

        assert.strictEqual(ctx.jobResult.surfVideosWatched, 2);
    });
});

// -------------------------------------------
describe('Supabase 초기화', function() {
    test('supabase_url과 key가 있으면 init이 호출된다', function() {
        var jobData = {
            job_id: 'sb-job', assignment_id: 'sb-assign', device_id: 'sb-dev',
            video_url: 'https://www.youtube.com/watch?v=sb',
            video_title: '', keyword: '',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
            supabase_url: 'https://test.supabase.co', supabase_key: 'anon-key',
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        runBot(sb);

        var initCall = sb._test.supabaseCalls.find(function(c) { return c.method === 'init'; });
        assert.ok(initCall, 'Supabase init called');
        assert.strictEqual(initCall.opts.url, 'https://test.supabase.co');
        assert.strictEqual(initCall.opts.anonKey, 'anon-key');
        assert.strictEqual(initCall.opts.deviceId, 'sb-dev');
    });
});

// -------------------------------------------
describe('키워드 설정', function() {
    test('keyword가 없으면 video_title을 키워드로 사용한다', function() {
        var jobData = {
            job_id: 'kw-job', assignment_id: 'kw-assign', device_id: 'kw-dev',
            video_url: 'https://www.youtube.com/watch?v=kw',
            video_title: 'My Video Title',
            keyword: '',
            duration_min_sec: 30, duration_max_sec: 60,
            prob_like: 0, prob_comment: 0, prob_subscribe: 0, prob_playlist: 0,
            enable_search: false, enable_forward_action: false, enable_random_surf: false,
            forward_action_count: 0, surf_video_count: 0, comments: [],
        };
        var b64 = Buffer.from(JSON.stringify(jobData)).toString('base64');
        var sb = createSandbox({ execArgv: { jobDataB64: b64 } });
        var ctx = runBot(sb);
        assert.strictEqual(ctx.searchKeyword, 'My Video Title');
    });
});

// =============================================
// 결과 출력
// =============================================
console.log('\n========================================');
console.log('결과: ' + passed + '/' + total + ' 통과' + (failed > 0 ? ', ' + failed + ' 실패' : ''));
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
