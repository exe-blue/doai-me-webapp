/**
 * Job Loader Module for AutoX.js
 * Issue 1: job.json 파일 기반 통신 구현
 * Issue 2: AutoX.js require() 호환성 - 절대 경로 사용
 *
 * PC Worker에서 ADB push로 전송된 job.json을 읽어 파라미터 반환
 */

// =============================================
// 설정 상수
// =============================================
var JOB_FILE_PATHS = [
    "/sdcard/Scripts/doai-bot/job.json",
    "/data/local/tmp/doai_job.json",
    "/sdcard/doai_job.json"
];

var PROCESSED_SUFFIX = ".processed";
var MAX_RETRY = 3;
var RETRY_DELAY_MS = 1000;

// =============================================
// Job 파일 로더
// =============================================

/**
 * job.json 파일 경로 탐색
 * @returns {string|null} - 발견된 파일 경로 또는 null
 */
function findJobFile() {
    for (var i = 0; i < JOB_FILE_PATHS.length; i++) {
        var path = JOB_FILE_PATHS[i];
        if (files.exists(path)) {
            console.log("[JobLoader] Found job file at: " + path);
            return path;
        }
    }
    console.log("[JobLoader] No job file found in any location");
    return null;
}

/**
 * job.json 파일 읽기 및 파싱
 * @param {string} filePath - job.json 경로
 * @returns {object|null} - 파싱된 Job 객체 또는 null
 */
function readJobFile(filePath) {
    if (!filePath || !files.exists(filePath)) {
        console.error("[JobLoader] File does not exist: " + filePath);
        return null;
    }

    try {
        var content = files.read(filePath);
        if (!content || content.trim().length === 0) {
            console.error("[JobLoader] File is empty: " + filePath);
            return null;
        }

        var job = JSON.parse(content);
        console.log("[JobLoader] Successfully parsed job.json");
        console.log("[JobLoader] Assignment ID: " + (job.assignment_id || "N/A"));
        console.log("[JobLoader] Keyword: " + (job.keyword || "N/A"));

        return job;
    } catch (e) {
        console.error("[JobLoader] Failed to parse job.json: " + e.message);
        return null;
    }
}

/**
 * 처리 완료된 job 파일 정리
 * @param {string} filePath - 정리할 파일 경로
 * @param {string} mode - 'rename' 또는 'delete'
 */
function cleanupJobFile(filePath, mode) {
    mode = mode || 'rename';

    if (!filePath || !files.exists(filePath)) {
        return;
    }

    try {
        if (mode === 'delete') {
            files.remove(filePath);
            console.log("[JobLoader] Deleted job file: " + filePath);
        } else {
            // rename 모드: .processed 확장자 추가
            var processedPath = filePath + PROCESSED_SUFFIX + "_" + Date.now();
            files.rename(filePath, processedPath);
            console.log("[JobLoader] Renamed job file to: " + processedPath);
        }
    } catch (e) {
        console.error("[JobLoader] Failed to cleanup job file: " + e.message);
    }
}

/**
 * Job 파라미터 로드 (메인 함수)
 * execArgv와 job.json 파일 모두 지원
 *
 * @param {object} execArgv - engines.myEngine().execArgv
 * @returns {object} - 병합된 파라미터 객체
 */
function loadJobParams(execArgv) {
    execArgv = execArgv || {};

    // 기본값 정의
    var defaults = {
        // 작업 식별
        assignment_id: "test-assignment",
        job_id: "test-job",
        device_id: "test-device",

        // 검색/영상 정보
        keyword: "",
        video_title: "",
        target_url: "",

        // 시청 시간 설정
        duration_sec: 180,
        duration_min_pct: 30,
        duration_max_pct: 90,
        base_duration_sec: 300,

        // 확률 설정 (0-100)
        prob_like: 0,
        prob_comment: 0,
        prob_playlist: 0,

        // Supabase 설정
        supabase_url: null,
        supabase_key: null
    };

    // 1. execArgv에서 파라미터 읽기 (우선순위 1)
    var params = {};
    for (var key in defaults) {
        if (execArgv[key] !== undefined && execArgv[key] !== null) {
            params[key] = execArgv[key];
        } else {
            params[key] = defaults[key];
        }
    }

    // 2. job.json 파일에서 파라미터 읽기 (우선순위 2, execArgv가 없는 항목만)
    var jobFilePath = findJobFile();
    if (jobFilePath) {
        var jobData = readJobFile(jobFilePath);

        if (jobData) {
            // job.json 데이터로 빈 값 채우기
            for (var jKey in jobData) {
                if (params[jKey] === undefined || params[jKey] === null || params[jKey] === "" || params[jKey] === defaults[jKey]) {
                    params[jKey] = jobData[jKey];
                }
            }

            // job_path를 저장하여 나중에 정리할 수 있도록
            params._job_file_path = jobFilePath;
        }
    }

    // 3. 타입 변환 (숫자 필드)
    var numericFields = ['duration_sec', 'duration_min_pct', 'duration_max_pct', 'base_duration_sec', 'prob_like', 'prob_comment', 'prob_playlist'];
    for (var n = 0; n < numericFields.length; n++) {
        var field = numericFields[n];
        if (typeof params[field] === 'string') {
            params[field] = parseInt(params[field]) || defaults[field];
        }
    }

    console.log("[JobLoader] Final params loaded:");
    console.log("  - assignment_id: " + params.assignment_id);
    console.log("  - keyword: " + params.keyword);
    console.log("  - duration_sec: " + params.duration_sec);

    return params;
}

/**
 * 작업 완료 후 정리
 * @param {object} params - loadJobParams()에서 반환된 객체
 */
function finalizeJob(params) {
    if (params && params._job_file_path) {
        cleanupJobFile(params._job_file_path, 'rename');
    }
}

// =============================================
// 모듈 Export
// =============================================
module.exports = {
    loadJobParams: loadJobParams,
    finalizeJob: finalizeJob,
    findJobFile: findJobFile,
    readJobFile: readJobFile,
    cleanupJobFile: cleanupJobFile,
    JOB_FILE_PATHS: JOB_FILE_PATHS
};
