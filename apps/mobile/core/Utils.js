/**
 * core/Utils.js
 * 공통 유틸리티 함수 모음
 * AutoX.js 환경에서 동작
 *
 * @module Utils
 */

var Utils = {
    // 시퀀스 카운터 (동일 밀리초 내 충돌 방지)
    _lastTimestamp: 0,
    _sequenceCounter: 0,

    /**
     * 고유 파일명 생성 (덮어쓰기 방지)
     * 형식: YYYYMMDD_HHmmssSSS_SEQ_JobID_Type.ext
     *
     * @param {string} jobId - 작업 ID (assignment_id)
     * @param {string} actionType - 액션 타입 (screenshot, search, click, watch, error 등)
     * @param {string} ext - 파일 확장자 (기본값: png)
     * @returns {string} 고유 파일명
     *
     * @example
     * generateUniqueFilename('abc123', 'screenshot', 'png')
     * // => '20260129_153045123_00_abc123_screenshot.png'
     */
    generateUniqueFilename: function(jobId, actionType, ext) {
        ext = ext || 'png';
        var now = new Date();
        var timestamp = now.getTime();
        var safeJobId = this.sanitizeFilename(jobId || 'unknown');
        var safeActionType = this.sanitizeFilename(actionType || 'action');

        // 시퀀스 카운터 관리 (동일 밀리초 내 충돌 방지)
        if (timestamp === this._lastTimestamp) {
            this._sequenceCounter++;
        } else {
            this._lastTimestamp = timestamp;
            this._sequenceCounter = 0;
        }

        // YYYYMMDD_HHmmssSSS 형식 생성
        var pad = function(n) {
            return n < 10 ? '0' + n : String(n);
        };

        var dateStr = String(now.getFullYear()) +
                      pad(now.getMonth() + 1) +
                      pad(now.getDate());
        var timeStr = pad(now.getHours()) +
                      pad(now.getMinutes()) +
                      pad(now.getSeconds());

        // 밀리초 + 시퀀스로 완전한 고유성 보장
        var msStr = String(now.getMilliseconds());
        while (msStr.length < 3) msStr = '0' + msStr;

        var seqStr = String(this._sequenceCounter);
        while (seqStr.length < 2) seqStr = '0' + seqStr;

        return dateStr + '_' + timeStr + msStr + '_' + seqStr + '_' + safeJobId + '_' + safeActionType + '.' + ext;
    },

    /**
     * 고유 파일 경로 생성 (디렉토리 포함)
     *
     * @param {string} baseDir - 기본 디렉토리 경로
     * @param {string} jobId - 작업 ID
     * @param {string} actionType - 액션 타입
     * @param {string} ext - 파일 확장자
     * @returns {string} 전체 파일 경로
     */
    generateUniqueFilePath: function(baseDir, jobId, actionType, ext) {
        var filename = this.generateUniqueFilename(jobId, actionType, ext);
        baseDir = baseDir || '/sdcard/Scripts/doai-bot/evidence';

        // 경로 끝의 슬래시 정리
        if (baseDir.charAt(baseDir.length - 1) === '/') {
            baseDir = baseDir.slice(0, -1);
        }

        return baseDir + '/' + filename;
    },

    /**
     * 파일명에서 사용 불가능한 문자 제거
     *
     * @param {string} str - 정제할 문자열
     * @returns {string} 파일명으로 안전한 문자열
     */
    sanitizeFilename: function(str) {
        if (!str) return 'unknown';
        // 파일명에 사용 불가능한 문자 제거: \ / : * ? " < > |
        return String(str).replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    },

    /**
     * 현재 타임스탬프 문자열 생성 (로그용)
     * 형식: YYYY-MM-DD HH:mm:ss.SSS
     *
     * @returns {string} 포맷된 타임스탬프
     */
    getFormattedTimestamp: function() {
        var now = new Date();
        var pad = function(n, width) {
            width = width || 2;
            n = String(n);
            while (n.length < width) n = '0' + n;
            return n;
        };

        return now.getFullYear() + '-' +
               pad(now.getMonth() + 1) + '-' +
               pad(now.getDate()) + ' ' +
               pad(now.getHours()) + ':' +
               pad(now.getMinutes()) + ':' +
               pad(now.getSeconds()) + '.' +
               pad(now.getMilliseconds(), 3);
    },

    /**
     * 디렉토리 존재 확인 및 생성
     * AutoX.js의 files API 사용
     *
     * @param {string} dirPath - 디렉토리 경로
     * @returns {boolean} 디렉토리 존재/생성 성공 여부
     */
    ensureDirectory: function(dirPath) {
        try {
            if (typeof files !== 'undefined' && files.ensureDir) {
                files.ensureDir(dirPath);
                return true;
            }
            // Node.js 환경 fallback (테스트용)
            if (typeof require !== 'undefined') {
                var fs = require('fs');
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                return true;
            }
            return false;
        } catch (e) {
            console.error('[Utils] ensureDirectory 실패:', e);
            return false;
        }
    },

    /**
     * JSON 파일 읽기
     *
     * @param {string} filePath - 파일 경로
     * @returns {object|null} 파싱된 JSON 객체 또는 null
     */
    readJsonFile: function(filePath) {
        try {
            if (typeof files !== 'undefined' && files.read) {
                var content = files.read(filePath);
                return content ? JSON.parse(content) : null;
            }
            // Node.js 환경 fallback
            if (typeof require !== 'undefined') {
                var fs = require('fs');
                if (fs.existsSync(filePath)) {
                    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
                }
            }
            return null;
        } catch (e) {
            console.error('[Utils] readJsonFile 실패:', filePath, e);
            return null;
        }
    },

    /**
     * JSON 파일 쓰기
     *
     * @param {string} filePath - 파일 경로
     * @param {object} data - 저장할 데이터
     * @returns {boolean} 성공 여부
     */
    writeJsonFile: function(filePath, data) {
        try {
            var content = JSON.stringify(data, null, 2);

            if (typeof files !== 'undefined' && files.write) {
                files.write(filePath, content);
                return true;
            }
            // Node.js 환경 fallback
            if (typeof require !== 'undefined') {
                var fs = require('fs');
                fs.writeFileSync(filePath, content, 'utf8');
                return true;
            }
            return false;
        } catch (e) {
            console.error('[Utils] writeJsonFile 실패:', filePath, e);
            return false;
        }
    },

    /**
     * 랜덤 딜레이 (인간 행동 시뮬레이션)
     *
     * @param {number} minMs - 최소 대기 시간 (ms)
     * @param {number} maxMs - 최대 대기 시간 (ms)
     * @returns {number} 실제 대기 시간
     */
    randomDelay: function(minMs, maxMs) {
        var delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        if (typeof sleep !== 'undefined') {
            sleep(delay);
        }
        return delay;
    },

    /**
     * job.json 파라미터 로드
     *
     * @param {string} jobJsonPath - job.json 경로 (기본: /sdcard/job.json)
     * @returns {object|null} 파라미터 객체 또는 null
     */
    loadJobParams: function(jobJsonPath) {
        jobJsonPath = jobJsonPath || '/sdcard/job.json';
        return this.readJsonFile(jobJsonPath);
    },

    /**
     * 시청 시간 계산 (불확실성 부여)
     *
     * @param {object} params - 파라미터 객체
     * @param {number} params.duration_min_pct - 최소 시청률 (%)
     * @param {number} params.duration_max_pct - 최대 시청률 (%)
     * @param {number} params.base_duration_sec - 기준 시간 (초)
     * @returns {object} { targetDurationSec, randomPct }
     */
    calculateWatchDuration: function(params) {
        var minPct = params.duration_min_pct || 30;
        var maxPct = params.duration_max_pct || 90;
        var baseSec = params.base_duration_sec || 300;

        var randomPct = Math.floor(Math.random() * (maxPct - minPct + 1)) + minPct;
        var targetDurationSec = Math.floor(baseSec * (randomPct / 100));

        return {
            targetDurationSec: targetDurationSec,
            randomPct: randomPct
        };
    }
};

// AutoX.js 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = Utils;
}
