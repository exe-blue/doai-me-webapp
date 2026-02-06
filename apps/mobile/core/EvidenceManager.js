/**
 * core/EvidenceManager.js
 * 스크린샷 및 증거 파일 관리자
 * AutoX.js 환경에서 동작
 *
 * 주요 기능:
 * - 고유 파일명으로 스크린샷 저장 (덮어쓰기 방지)
 * - 증거 파일 메타데이터 관리
 * - result.json에 파일 경로 기록
 *
 * @module EvidenceManager
 */

// Utils 모듈 로드 (AutoX.js 환경 + Node.js 환경 호환)
var Utils;
var BASE_PATH = '/sdcard/Scripts/doai-bot';

// 환경 감지 및 모듈 로드
(function loadUtils() {
    // 1. AutoX.js 환경 (절대 경로)
    if (typeof files !== 'undefined' && files.exists) {
        var autoxPaths = [
            BASE_PATH + '/core/Utils.js',
            '/sdcard/doai-bot/core/Utils.js'
        ];

        for (var i = 0; i < autoxPaths.length; i++) {
            if (files.exists(autoxPaths[i])) {
                try {
                    Utils = require(autoxPaths[i]);
                    console.log('[EvidenceManager] Utils 로드 성공 (AutoX.js): ' + autoxPaths[i]);
                    return;
                } catch (e) {
                    console.warn('[EvidenceManager] 경로 시도 실패: ' + autoxPaths[i]);
                }
            }
        }
    }

    // 2. Node.js 환경 (상대 경로)
    try {
        Utils = require('./Utils.js');
        console.log('[EvidenceManager] Utils 로드 성공 (Node.js)');
        return;
    } catch (e) {
        // fallback
    }

    console.error('[EvidenceManager] Utils 로드 실패 - 모든 경로 시도 완료');
})();

var EvidenceManager = {
    // 설정
    config: {
        baseDir: '/sdcard/Scripts/doai-bot/evidence',
        resultFile: '/sdcard/Scripts/doai-bot/result.json',
        maxScreenshots: 20  // 작업당 최대 스크린샷 수
    },

    // 현재 작업 상태
    currentJob: {
        assignmentId: null,
        files: [],         // 저장된 파일 목록
        startTime: null
    },

    /**
     * 새 작업 시작 - 증거 수집 초기화
     *
     * @param {string} assignmentId - 작업 할당 ID
     */
    startJob: function(assignmentId) {
        this.currentJob = {
            assignmentId: assignmentId,
            files: [],
            startTime: Date.now()
        };

        // 증거 디렉토리 생성
        var jobDir = this.config.baseDir + '/' + Utils.sanitizeFilename(assignmentId);
        Utils.ensureDirectory(jobDir);

        console.log('[EvidenceManager] 작업 시작:', assignmentId);
        return jobDir;
    },

    /**
     * 스크린샷 캡처 및 저장
     * 고유 파일명 사용으로 덮어쓰기 방지
     *
     * @param {string} actionType - 액션 타입 (search, click, watch, error 등)
     * @param {object} options - 추가 옵션
     * @param {number} options.quality - JPEG 품질 (1-100, 기본 80)
     * @param {boolean} options.fullScreen - 전체 화면 캡처 여부
     * @returns {object} 캡처 결과 { success, filePath, error }
     */
    captureScreenshot: function(actionType, options) {
        options = options || {};
        var quality = options.quality || 80;

        if (!this.currentJob.assignmentId) {
            return { success: false, filePath: null, error: 'Job not started' };
        }

        // 최대 스크린샷 수 제한
        if (this.currentJob.files.length >= this.config.maxScreenshots) {
            console.warn('[EvidenceManager] 최대 스크린샷 수 초과');
            return { success: false, filePath: null, error: 'Max screenshots exceeded' };
        }

        try {
            // 고유 파일명 생성
            var filename = Utils.generateUniqueFilename(
                this.currentJob.assignmentId,
                actionType,
                'png'
            );

            var jobDir = this.config.baseDir + '/' +
                         Utils.sanitizeFilename(this.currentJob.assignmentId);
            var filePath = jobDir + '/' + filename;

            // 디렉토리 확인
            Utils.ensureDirectory(jobDir);

            // 스크린샷 캡처 (AutoX.js API)
            var captured = false;
            if (typeof images !== 'undefined') {
                // AutoX.js 환경
                if (!images.requestScreenCapture(false)) {
                    // 이미 권한이 있으면 무시
                }

                var img = images.captureScreen();
                if (img) {
                    images.save(img, filePath, 'png', quality);
                    img.recycle();  // 메모리 해제
                    captured = true;
                }
            }

            if (captured) {
                // 파일 메타데이터 기록
                var fileInfo = {
                    path: filePath,
                    filename: filename,
                    actionType: actionType,
                    timestamp: Date.now(),
                    timestampFormatted: Utils.getFormattedTimestamp()
                };

                this.currentJob.files.push(fileInfo);

                console.log('[EvidenceManager] 스크린샷 저장:', filename);
                return { success: true, filePath: filePath, fileInfo: fileInfo };
            } else {
                return { success: false, filePath: null, error: 'Capture failed' };
            }

        } catch (e) {
            console.error('[EvidenceManager] 스크린샷 캡처 실패:', e);
            return { success: false, filePath: null, error: String(e) };
        }
    },

    /**
     * 로그 파일 저장
     *
     * @param {string} actionType - 액션 타입
     * @param {string} logContent - 로그 내용
     * @returns {object} 저장 결과
     */
    saveLog: function(actionType, logContent) {
        if (!this.currentJob.assignmentId) {
            return { success: false, filePath: null, error: 'Job not started' };
        }

        try {
            var filename = Utils.generateUniqueFilename(
                this.currentJob.assignmentId,
                actionType,
                'log'
            );

            var jobDir = this.config.baseDir + '/' +
                         Utils.sanitizeFilename(this.currentJob.assignmentId);
            var filePath = jobDir + '/' + filename;

            Utils.ensureDirectory(jobDir);

            // 로그 내용에 타임스탬프 추가
            var content = '[' + Utils.getFormattedTimestamp() + '] ' +
                          actionType + '\n' + logContent;

            if (typeof files !== 'undefined' && files.write) {
                files.write(filePath, content);
            }

            var fileInfo = {
                path: filePath,
                filename: filename,
                actionType: actionType,
                type: 'log',
                timestamp: Date.now()
            };

            this.currentJob.files.push(fileInfo);

            console.log('[EvidenceManager] 로그 저장:', filename);
            return { success: true, filePath: filePath, fileInfo: fileInfo };

        } catch (e) {
            console.error('[EvidenceManager] 로그 저장 실패:', e);
            return { success: false, filePath: null, error: String(e) };
        }
    },

    /**
     * 작업 완료 - result.json 생성
     * 호스트(PC Worker)가 Pull해야 할 파일 목록 포함
     *
     * @param {object} jobResult - 작업 결과 데이터
     * @param {boolean} jobResult.success - 성공 여부
     * @param {boolean} jobResult.searchSuccess - 검색 성공 여부
     * @param {number} jobResult.watchDuration - 시청 시간
     * @param {string} jobResult.error - 에러 메시지
     * @returns {object} result.json 저장 결과
     */
    finishJob: function(jobResult) {
        jobResult = jobResult || {};

        var result = {
            // 작업 식별 정보
            assignment_id: this.currentJob.assignmentId,

            // 작업 결과
            success: jobResult.success || false,
            search_success: jobResult.searchSuccess || false,
            watch_duration_sec: jobResult.watchDuration || 0,
            error: jobResult.error || null,

            // 타이밍 정보
            started_at: this.currentJob.startTime,
            completed_at: Date.now(),
            duration_ms: Date.now() - (this.currentJob.startTime || Date.now()),

            // 증거 파일 목록 (호스트가 Pull해야 할 파일들)
            evidence_files: this.currentJob.files.map(function(f) {
                return {
                    path: f.path,
                    filename: f.filename,
                    action_type: f.actionType,
                    timestamp: f.timestamp
                };
            }),

            // 메타데이터
            evidence_count: this.currentJob.files.length,
            evidence_dir: this.config.baseDir + '/' +
                          Utils.sanitizeFilename(this.currentJob.assignmentId)
        };

        // result.json 저장
        var resultPath = this.config.resultFile;
        var saved = Utils.writeJsonFile(resultPath, result);

        if (saved) {
            console.log('[EvidenceManager] result.json 저장 완료');
            console.log('[EvidenceManager] 증거 파일 수:', result.evidence_count);
        }

        return {
            success: saved,
            resultPath: resultPath,
            result: result
        };
    },

    /**
     * 특정 액션 시점에 스크린샷 캡처 (단축 메서드)
     */
    captureOnSearch: function() {
        return this.captureScreenshot('search');
    },

    captureOnVideoFound: function() {
        return this.captureScreenshot('video_found');
    },

    captureOnClick: function() {
        return this.captureScreenshot('click');
    },

    captureOnWatchStart: function() {
        return this.captureScreenshot('watch_start');
    },

    captureOnWatchEnd: function() {
        return this.captureScreenshot('watch_end');
    },

    captureOnError: function(errorMsg) {
        var result = this.captureScreenshot('error');
        if (errorMsg) {
            this.saveLog('error', errorMsg);
        }
        return result;
    },

    /**
     * 현재 작업의 모든 증거 파일 경로 반환
     *
     * @returns {string[]} 파일 경로 배열
     */
    getEvidenceFilePaths: function() {
        return this.currentJob.files.map(function(f) {
            return f.path;
        });
    },

    /**
     * 증거 디렉토리 정리 (오래된 파일 삭제)
     *
     * @param {number} maxAgeDays - 보관 기간 (일)
     */
    cleanupOldEvidence: function(maxAgeDays) {
        maxAgeDays = maxAgeDays || 7;
        var maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
        var now = Date.now();

        try {
            if (typeof files !== 'undefined' && files.listDir) {
                var baseDir = this.config.baseDir;
                var dirs = files.listDir(baseDir);

                if (dirs && dirs.length > 0) {
                    dirs.forEach(function(dir) {
                        var dirPath = baseDir + '/' + dir;
                        // 디렉토리 수정 시간 확인 및 삭제 로직
                        // (구현 상세는 환경에 따라 조정 필요)
                    });
                }
            }
        } catch (e) {
            console.error('[EvidenceManager] 정리 중 오류:', e);
        }
    }
};

// AutoX.js 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = EvidenceManager;
}
