/**
 * core/SupabaseClient.js
 * AutoX.js 환경용 Supabase REST API 클라이언트
 *
 * 주요 기능:
 * - Assignment 폴링 (작업 수령)
 * - 상태 업데이트 (진행률, 완료, 실패)
 * - 하트비트 전송 (기기 온라인 상태)
 * - 댓글 RPC 호출
 *
 * @module SupabaseClient
 */

var SupabaseClient = (function() {
    // 설정 (환경변수 또는 config.json에서 로드)
    var config = {
        url: '',        // Supabase Project URL
        anonKey: '',    // Supabase Anon Key
        deviceId: '',   // 현재 기기 UUID
        serialNumber: '' // 기기 시리얼 번호
    };

    // 폴링 상태
    var pollingState = {
        interval: 5000,      // 기본 5초
        emptyCount: 0,       // 빈 응답 연속 횟수
        errorCount: 0,       // 에러 연속 횟수
        isPolling: false,
        timerId: null
    };

    // 하트비트 상태
    var heartbeatState = {
        interval: 10000,     // 10초
        isRunning: false,
        timerId: null
    };

    /**
     * 클라이언트 초기화
     * @param {object} options - 설정 옵션
     * @param {string} options.url - Supabase URL
     * @param {string} options.anonKey - Supabase Anon Key
     * @param {string} options.deviceId - 기기 UUID
     * @param {string} options.serialNumber - 기기 시리얼
     */
    function init(options) {
        if (!options.url || !options.anonKey) {
            throw new Error('[SupabaseClient] url과 anonKey는 필수입니다');
        }

        config.url = options.url.replace(/\/$/, ''); // 끝 슬래시 제거
        config.anonKey = options.anonKey;
        config.deviceId = options.deviceId || '';
        config.serialNumber = options.serialNumber || '';

        console.log('[SupabaseClient] 초기화 완료');
        console.log('[SupabaseClient] URL:', config.url);
        console.log('[SupabaseClient] Device ID:', config.deviceId);

        return true;
    }

    /**
     * config.json에서 설정 로드
     * @param {string} configPath - config.json 경로
     */
    function loadConfig(configPath) {
        configPath = configPath || '/sdcard/Scripts/doai-bot/config.json';

        try {
            if (typeof files !== 'undefined' && files.exists(configPath)) {
                var content = files.read(configPath);
                var json = JSON.parse(content);

                return init({
                    url: json.supabase_url,
                    anonKey: json.supabase_anon_key,
                    deviceId: json.device_id,
                    serialNumber: json.serial_number
                });
            }

            // Node.js 환경 fallback
            if (typeof require !== 'undefined') {
                var fs = require('fs');
                if (fs.existsSync(configPath)) {
                    var json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    return init(json);
                }
            }

            console.error('[SupabaseClient] config.json을 찾을 수 없습니다:', configPath);
            return false;
        } catch (e) {
            console.error('[SupabaseClient] config 로드 실패:', e);
            return false;
        }
    }

    /**
     * HTTP 요청 헬퍼 (AutoX.js + Node.js 호환)
     */
    function httpRequest(method, endpoint, body) {
        var url = config.url + '/rest/v1' + endpoint;
        var headers = {
            'apikey': config.anonKey,
            'Authorization': 'Bearer ' + config.anonKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        try {
            var response;

            // AutoX.js 환경
            if (typeof http !== 'undefined' && http.request) {
                var options = {
                    headers: headers,
                    method: method,
                    contentType: 'application/json'
                };

                if (body && (method === 'POST' || method === 'PATCH')) {
                    options.body = JSON.stringify(body);
                }

                response = http.request(url, options);

                if (response && response.statusCode >= 200 && response.statusCode < 300) {
                    return {
                        success: true,
                        status: response.statusCode,
                        data: response.body ? JSON.parse(response.body.string()) : null
                    };
                } else {
                    return {
                        success: false,
                        status: response ? response.statusCode : 0,
                        error: response ? response.body.string() : 'No response'
                    };
                }
            }

            // Node.js 환경 (테스트용)
            if (typeof require !== 'undefined') {
                console.log('[SupabaseClient] Node.js 환경 - HTTP 요청 시뮬레이션');
                console.log('  Method:', method);
                console.log('  URL:', url);
                console.log('  Body:', body ? JSON.stringify(body) : 'none');

                return {
                    success: true,
                    status: 200,
                    data: [],
                    simulated: true
                };
            }

            return { success: false, error: 'HTTP 클라이언트 없음' };

        } catch (e) {
            console.error('[SupabaseClient] HTTP 요청 실패:', e);
            return { success: false, error: String(e) };
        }
    }

    /**
     * RPC 함수 호출 헬퍼
     */
    function rpcCall(functionName, params) {
        var url = config.url + '/rest/v1/rpc/' + functionName;
        var headers = {
            'apikey': config.anonKey,
            'Authorization': 'Bearer ' + config.anonKey,
            'Content-Type': 'application/json'
        };

        try {
            // AutoX.js 환경
            if (typeof http !== 'undefined' && http.postJson) {
                var response = http.postJson(url, params, { headers: headers });

                if (response && response.statusCode >= 200 && response.statusCode < 300) {
                    return {
                        success: true,
                        status: response.statusCode,
                        data: response.body ? JSON.parse(response.body.string()) : null
                    };
                } else {
                    return {
                        success: false,
                        status: response ? response.statusCode : 0,
                        error: response ? response.body.string() : 'No response'
                    };
                }
            }

            // Node.js 환경 fallback
            return { success: false, error: 'RPC 클라이언트 없음' };

        } catch (e) {
            console.error('[SupabaseClient] RPC 호출 실패:', e);
            return { success: false, error: String(e) };
        }
    }

    // ==========================================
    // Assignment 관련 API
    // ==========================================

    /**
     * Pending Assignment 조회 (작업 수령)
     * @returns {object|null} 할당된 작업 또는 null
     */
    function pollAssignment() {
        if (!config.deviceId) {
            console.error('[SupabaseClient] deviceId가 설정되지 않았습니다');
            return null;
        }

        var endpoint = '/job_assignments?select=*,jobs(*)' +
                       '&device_id=eq.' + config.deviceId +
                       '&status=eq.pending' +
                       '&order=assigned_at.asc' +
                       '&limit=1';

        var result = httpRequest('GET', endpoint);

        if (result.success && result.data && result.data.length > 0) {
            pollingState.emptyCount = 0;
            pollingState.errorCount = 0;
            console.log('[SupabaseClient] 새 작업 발견:', result.data[0].id);
            return result.data[0];
        }

        if (result.success) {
            pollingState.emptyCount++;
            adjustPollingInterval();
        } else {
            pollingState.errorCount++;
            adjustPollingInterval();
        }

        return null;
    }

    /**
     * 폴링 간격 자동 조정 (백오프)
     */
    function adjustPollingInterval() {
        if (pollingState.errorCount > 0) {
            var backoff = Math.min(60000, 5000 * Math.pow(2, pollingState.errorCount - 1));
            pollingState.interval = backoff;
        } else if (pollingState.emptyCount >= 10) {
            pollingState.interval = 30000;
        } else if (pollingState.emptyCount >= 3) {
            pollingState.interval = 10000;
        } else {
            pollingState.interval = 5000;
        }
    }

    /**
     * Assignment 상태 업데이트
     * @param {string} assignmentId - Assignment UUID
     * @param {object} updates - 업데이트할 필드
     */
    function updateAssignment(assignmentId, updates) {
        var endpoint = '/job_assignments?id=eq.' + assignmentId;

        var result = httpRequest('PATCH', endpoint, updates);

        if (result.success) {
            console.log('[SupabaseClient] Assignment 업데이트 성공:', assignmentId);
        } else {
            console.error('[SupabaseClient] Assignment 업데이트 실패:', result.error);
        }

        return result;
    }

    /**
     * 작업 시작 (status: running)
     */
    function startAssignment(assignmentId) {
        return updateAssignment(assignmentId, {
            status: 'running',
            started_at: new Date().toISOString()
        });
    }

    /**
     * 진행률 업데이트
     */
    function updateProgress(assignmentId, progressPct) {
        return updateAssignment(assignmentId, {
            progress_pct: Math.min(100, Math.max(0, progressPct))
        });
    }

    /**
     * 작업 완료
     */
    function completeAssignment(assignmentId, result) {
        result = result || {};

        return updateAssignment(assignmentId, {
            status: 'completed',
            progress_pct: 100,
            actual_duration_sec: result.durationSec || 0,
            did_like: result.didLike || false,
            did_comment: result.didComment || false,
            did_playlist: result.didPlaylist || false,
            completed_at: new Date().toISOString()
        });
    }

    /**
     * 작업 실패
     */
    function failAssignment(assignmentId, errorCode, errorMessage, retryCount) {
        return updateAssignment(assignmentId, {
            status: 'failed',
            error_code: errorCode,
            error_message: errorMessage,
            retry_count: retryCount || 0
        });
    }

    // ==========================================
    // 댓글 RPC
    // ==========================================

    /**
     * 서버에서 랜덤 댓글 가져오기 (Race Condition 방지)
     * @param {string} deviceId - 기기 UUID
     * @param {string} jobId - 작업 UUID
     * @returns {string|null} 댓글 텍스트 또는 null
     */
    function fetchRandomComment(deviceId, jobId) {
        var result = rpcCall('fetch_random_comment', {
            device_uuid: deviceId || config.deviceId,
            job_uuid: jobId
        });

        if (result.success && result.data && result.data.length > 0) {
            var commentText = result.data[0].comment_text;
            if (commentText) {
                console.log('[SupabaseClient] 댓글 가져오기 성공');
                return commentText;
            }
        }

        console.log('[SupabaseClient] 댓글 가져오기 실패, 기본 댓글 사용');
        return getDefaultComment();
    }

    /**
     * 기본 댓글 풀에서 랜덤 선택
     */
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

    // ==========================================
    // Heartbeat (하트비트)
    // ==========================================

    /**
     * 하트비트 전송 (기기 온라인 상태 갱신)
     */
    function sendHeartbeat() {
        if (!config.deviceId && !config.serialNumber) {
            console.error('[SupabaseClient] deviceId 또는 serialNumber가 필요합니다');
            return { success: false };
        }

        var endpoint = config.deviceId
            ? '/devices?id=eq.' + config.deviceId
            : '/devices?serial_number=eq.' + config.serialNumber;

        var result = httpRequest('PATCH', endpoint, {
            last_seen_at: new Date().toISOString(),
            status: 'online'
        });

        if (result.success) {
            console.log('[SupabaseClient] 하트비트 전송 성공');
        } else {
            console.warn('[SupabaseClient] 하트비트 전송 실패:', result.error);
        }

        return result;
    }

    /**
     * 하트비트 자동 전송 시작
     */
    function startHeartbeat(intervalMs) {
        if (heartbeatState.isRunning) {
            console.log('[SupabaseClient] 하트비트 이미 실행 중');
            return;
        }

        heartbeatState.interval = intervalMs || 10000;
        heartbeatState.isRunning = true;

        sendHeartbeat();

        heartbeatState.timerId = setInterval(function() {
            sendHeartbeat();
        }, heartbeatState.interval);

        console.log('[SupabaseClient] 하트비트 시작 (간격:', heartbeatState.interval + 'ms)');
    }

    /**
     * 하트비트 자동 전송 중지
     */
    function stopHeartbeat() {
        if (heartbeatState.timerId) {
            clearInterval(heartbeatState.timerId);
            heartbeatState.timerId = null;
        }
        heartbeatState.isRunning = false;
        console.log('[SupabaseClient] 하트비트 중지');
    }

    // ==========================================
    // Polling Loop
    // ==========================================

    /**
     * 폴링 시작
     */
    function startPolling(callback) {
        if (pollingState.isPolling) {
            console.log('[SupabaseClient] 폴링 이미 실행 중');
            return;
        }

        pollingState.isPolling = true;

        function poll() {
            if (!pollingState.isPolling) return;

            var assignment = pollAssignment();

            if (assignment && callback) {
                callback(assignment);
            }

            pollingState.timerId = setTimeout(poll, pollingState.interval);
        }

        console.log('[SupabaseClient] 폴링 시작');
        poll();
    }

    /**
     * 폴링 중지
     */
    function stopPolling() {
        pollingState.isPolling = false;
        if (pollingState.timerId) {
            clearTimeout(pollingState.timerId);
            pollingState.timerId = null;
        }
        console.log('[SupabaseClient] 폴링 중지');
    }

    /**
     * 폴링 일시 중지
     */
    function pausePolling() {
        if (pollingState.timerId) {
            clearTimeout(pollingState.timerId);
            pollingState.timerId = null;
        }
        console.log('[SupabaseClient] 폴링 일시 중지');
    }

    /**
     * 폴링 재개
     */
    function resumePolling(callback) {
        if (pollingState.isPolling && !pollingState.timerId) {
            pollingState.interval = 5000;
            pollingState.emptyCount = 0;
            pollingState.errorCount = 0;
            startPolling(callback);
        }
    }

    // ==========================================
    // 유틸리티
    // ==========================================

    function getConfig() {
        return {
            url: config.url,
            deviceId: config.deviceId,
            serialNumber: config.serialNumber,
            pollingInterval: pollingState.interval,
            heartbeatInterval: heartbeatState.interval
        };
    }

    function testConnection() {
        var endpoint = '/devices?limit=1';
        var result = httpRequest('GET', endpoint);

        if (result.success) {
            console.log('[SupabaseClient] 연결 테스트 성공');
            return true;
        } else {
            console.error('[SupabaseClient] 연결 테스트 실패:', result.error);
            return false;
        }
    }

    // Public API
    return {
        init: init,
        loadConfig: loadConfig,
        testConnection: testConnection,
        getConfig: getConfig,

        pollAssignment: pollAssignment,
        startAssignment: startAssignment,
        updateProgress: updateProgress,
        completeAssignment: completeAssignment,
        failAssignment: failAssignment,

        fetchRandomComment: fetchRandomComment,
        getDefaultComment: getDefaultComment,

        sendHeartbeat: sendHeartbeat,
        startHeartbeat: startHeartbeat,
        stopHeartbeat: stopHeartbeat,

        startPolling: startPolling,
        stopPolling: stopPolling,
        pausePolling: pausePolling,
        resumePolling: resumePolling
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = SupabaseClient;
}
