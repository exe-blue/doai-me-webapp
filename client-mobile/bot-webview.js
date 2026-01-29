/**
 * WebView 기반 YouTube 검색 자동화 봇 (Entry Point)
 * MOB-01~03 구현 통합
 *
 * 사용법:
 * - AutoX.js 앱에서 실행
 * - .env 파일에 Supabase 인증 정보 설정 필요
 */

"ui";

// Module loader for absolute path resolution
const moduleLoader = require('./modules/module-loader.js');

// 모듈 Import (using absolute paths)
const webviewSetup = moduleLoader.loadModule('webview-setup');
const domControl = moduleLoader.loadModule('dom-control');
const searchFlow = moduleLoader.loadModule('search-flow');

/**
 * 설정 로드 (AutoX.js files 모듈 사용)
 */
function loadConfig() {
    try {
        const configPath = files.path('./config.json');
        if (!files.exists(configPath)) {
            throw new Error('config.json not found. Please copy config.example.json to config.json and fill in your Supabase credentials.');
        }
        const configData = files.read(configPath);
        return JSON.parse(configData);
    } catch (error) {
        console.error('[Bot WebView] Failed to load config:', error);
        toast('설정 파일 로드 실패: ' + error.message);
        throw error;
    }
}

// 설정 로드
const CONFIG = loadConfig();
const SUPABASE_URL = CONFIG.supabase.url;
const SUPABASE_ANON_KEY = CONFIG.supabase.anon_key;

// 디바이스 정보
const DEVICE_SERIAL = device.serial;
const GROUP_ID = CONFIG.device.group_id || "P1-G1";

console.log('[Bot WebView] Starting WebView-based YouTube automation bot...');
console.log(`[Bot WebView] Device: ${DEVICE_SERIAL}, Group: ${GROUP_ID}`);

// 전역 변수
let webViewInstance = null;
let currentAssignmentId = null;
let isProcessing = false;

/**
 * Supabase 초기화 (간단한 fetch 기반 클라이언트)
 * AutoX.js 환경에서는 @supabase/supabase-js를 사용할 수 없으므로
 * fetch API를 직접 사용하여 REST API 호출
 */
const supabase = {
    /**
     * SELECT 쿼리 실행
     */
    from: function(table) {
        return {
            select: function(columns = '*') {
                const self = this;
                self._table = table;
                self._columns = columns;
                self._filters = [];

                self.eq = function(column, value) {
                    self._filters.push(`${column}=eq.${value}`);
                    return self;
                };

                self.single = async function() {
                    const filterStr = self._filters.length > 0 ? '&' + self._filters.join('&') : '';
                    const url = `${SUPABASE_URL}/rest/v1/${self._table}?select=${self._columns}${filterStr}`;

                    const response = await http.get(url, {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.statusCode === 200) {
                        const data = response.body.json();
                        return { data: data[0] || null, error: null };
                    } else {
                        return { data: null, error: response.body.string() };
                    }
                };

                return self;
            }
        };
    },

    /**
     * Edge Function 호출
     */
    functions: {
        invoke: async function(functionName, options = {}) {
            const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
            const body = options.body || {};

            const response = await http.post(url, JSON.stringify(body), {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.statusCode === 200) {
                return { data: response.body.json(), error: null };
            } else {
                return { data: null, error: response.body.string() };
            }
        }
    }
};

/**
 * 디바이스 등록 (실제 구현 시 필요)
 */
async function registerDevice() {
    console.log('[Bot WebView] Device registration skipped (implement if needed)');
    // TODO: Supabase devices 테이블에 디바이스 등록
}

/**
 * Job 가져오기 (실제 구현 시 필요)
 */
async function fetchJob() {
    console.log('[Bot WebView] Fetching job...');

    // TODO: Supabase에서 대기 중인 job 조회
    // 현재는 테스트용 하드코딩된 Job 반환
    return {
        id: 'test-job-001',
        title: '[Test] WebView 검색 자동화',
        target_url: null, // 검색 모드에서는 URL 불필요
        script_type: 'youtube_search',
        search_query: '오픈AI GPT-4',
        result_index: 0,
        duration_min_pct: 30,
        duration_max_pct: 90,
        prob_like: 50,
        prob_comment: 30,
        prob_playlist: 10,
        comment_text: '정말 유익한 영상이네요! 감사합니다.'
    };
}

/**
 * Assignment 완료 처리
 */
async function completeAssignment(assignmentId, watchPercentage, actualDurationSec) {
    console.log(`[Bot WebView] Completing assignment: ${assignmentId}`);

    const { data, error } = await supabase.functions.invoke('complete-job-assignment', {
        body: {
            assignment_id: assignmentId,
            watch_percentage: watchPercentage,
            actual_duration_sec: actualDurationSec
        }
    });

    if (error) {
        console.error('[Bot WebView] Assignment completion failed:', error);
        return false;
    }

    console.log('[Bot WebView] Assignment completed successfully:', data);
    return true;
}

/**
 * Job 실행 메인 함수
 */
async function executeJob(job) {
    try {
        console.log(`[Bot WebView] ========== Executing Job: ${job.title} ==========`);

        isProcessing = true;

        // Assignment 생성 (실제 구현 시 필요)
        // TODO: Supabase job_assignments 테이블에 레코드 생성
        currentAssignmentId = `assignment-${Date.now()}`;

        // Job 설정 구성
        const jobConfig = {
            searchQuery: job.search_query || '테스트 검색어',
            resultIndex: job.result_index || 0,
            durationMinPct: job.duration_min_pct || 30,
            durationMaxPct: job.duration_max_pct || 90,
            probLike: job.prob_like || 50,
            probComment: job.prob_comment || 30,
            commentText: job.comment_text || null,
            probPlaylist: job.prob_playlist || 10
        };

        // 검색 + 시청 플로우 실행
        const result = await searchFlow.executeSearchAndWatch(
            webViewInstance.loadUrl,
            webViewInstance.evaluateJS,
            jobConfig
        );

        if (!result.success) {
            throw new Error('Job execution failed: ' + result.error);
        }

        console.log('[Bot WebView] Job execution result:', result);

        // Assignment 완료 처리
        await completeAssignment(
            currentAssignmentId,
            result.watchPercentage,
            result.actualDurationSec
        );

        console.log('[Bot WebView] ========== Job Completed Successfully ==========');

    } catch (error) {
        console.error('[Bot WebView] Job execution error:', error.message);
    } finally {
        isProcessing = false;
        currentAssignmentId = null;
    }
}

/**
 * 메인 루프
 */
async function mainLoop() {
    // WebView 초기화
    webViewInstance = webviewSetup.initializeWebView();
    console.log('[Bot WebView] WebView initialized');

    // 디바이스 등록
    await registerDevice();

    // 테스트: Job 1회 실행
    console.log('[Bot WebView] Starting test job...');
    const testJob = await fetchJob();
    await executeJob(testJob);

    console.log('[Bot WebView] Test completed. Bot will now idle.');

    // 실제 운영에서는 아래와 같이 무한 루프로 Job을 계속 가져옴
    /*
    while (true) {
        if (!isProcessing) {
            const job = await fetchJob();
            if (job) {
                await executeJob(job);
            } else {
                console.log('[Bot WebView] No jobs available, waiting...');
                await searchFlow.randomSleep(10000, 15000);
            }
        }
        await searchFlow.randomSleep(5000, 10000);
    }
    */
}

// UI 스레드에서 메인 루프 실행
ui.run(() => {
    mainLoop().catch(error => {
        console.error('[Bot WebView] Fatal error:', error);
        toast('봇 실행 오류: ' + error.message);
    });
});

console.log('[Bot WebView] Bot started. Press Ctrl+C to stop.');
