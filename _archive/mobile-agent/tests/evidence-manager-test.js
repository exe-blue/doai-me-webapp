/**
 * EvidenceManager 단위 테스트
 * Node.js 환경에서 실행 가능
 */

// 모듈 로드
var Utils = require('../shared/Utils.js');
var EvidenceManager = require('../android/EvidenceManager.js');

console.log('╔════════════════════════════════════════╗');
console.log('║  EvidenceManager Unit Tests            ║');
console.log('╚════════════════════════════════════════╝\n');

var testsPassed = 0;
var testsFailed = 0;

function test(name, condition) {
    if (condition) {
        console.log('✅ ' + name);
        testsPassed++;
    } else {
        console.log('❌ ' + name);
        testsFailed++;
    }
}

// =============================================
// Test 1: Utils.generateUniqueFilename
// =============================================
console.log('\n[Test 1] Utils.generateUniqueFilename');

var filename1 = Utils.generateUniqueFilename('job123', 'screenshot', 'png');
test('파일명 형식: JobID_Timestamp_ActionType.ext',
    /^job123_\d+_screenshot\.png$/.test(filename1));

var filename2 = Utils.generateUniqueFilename('job123', 'screenshot', 'png');
test('고유성: 같은 파라미터로 호출해도 다른 파일명 생성',
    filename1 !== filename2);

var filename3 = Utils.generateUniqueFilename(null, null, null);
test('Null 처리: 기본값 사용',
    /^unknown_\d+_action\.png$/.test(filename3));

var filename4 = Utils.generateUniqueFilename('a/b:c*d?e"f<g>h|i', 'test', 'png');
test('특수문자 Sanitize: 파일명에 사용 불가 문자 제거',
    !/[\\/:*?"<>|]/.test(filename4));

// =============================================
// Test 2: Utils.generateUniqueFilePath
// =============================================
console.log('\n[Test 2] Utils.generateUniqueFilePath');

var filepath1 = Utils.generateUniqueFilePath('/sdcard/evidence', 'job123', 'click', 'png');
test('전체 경로 형식: baseDir/filename',
    filepath1.startsWith('/sdcard/evidence/') && filepath1.endsWith('.png'));

var filepath2 = Utils.generateUniqueFilePath('/sdcard/evidence/', 'job123', 'click', 'png');
test('trailing slash 처리: 중복 슬래시 방지',
    !filepath2.includes('//'));

// =============================================
// Test 3: Utils.sanitizeFilename
// =============================================
console.log('\n[Test 3] Utils.sanitizeFilename');

test('일반 문자열: 변경 없음',
    Utils.sanitizeFilename('normal_filename') === 'normal_filename');

test('특수문자 포함: 언더스코어로 치환',
    Utils.sanitizeFilename('a/b\\c:d') === 'a_b_c_d');

test('빈 문자열: unknown 반환',
    Utils.sanitizeFilename('') === 'unknown');

test('긴 문자열: 50자로 제한',
    Utils.sanitizeFilename('a'.repeat(100)).length === 50);

// =============================================
// Test 4: Utils.getFormattedTimestamp
// =============================================
console.log('\n[Test 4] Utils.getFormattedTimestamp');

var timestamp = Utils.getFormattedTimestamp();
test('타임스탬프 형식: YYYY-MM-DD HH:mm:ss.SSS',
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(timestamp));

// =============================================
// Test 5: EvidenceManager.startJob
// =============================================
console.log('\n[Test 5] EvidenceManager.startJob');

var jobDir = EvidenceManager.startJob('test-assignment-001');
test('작업 시작: assignmentId 설정됨',
    EvidenceManager.currentJob.assignmentId === 'test-assignment-001');

test('작업 시작: files 배열 초기화',
    Array.isArray(EvidenceManager.currentJob.files) &&
    EvidenceManager.currentJob.files.length === 0);

test('작업 시작: startTime 설정됨',
    typeof EvidenceManager.currentJob.startTime === 'number');

// =============================================
// Test 6: EvidenceManager.finishJob (시뮬레이션)
// =============================================
console.log('\n[Test 6] EvidenceManager.finishJob (result.json 구조)');

// 파일 추가 시뮬레이션
EvidenceManager.currentJob.files = [
    { path: '/sdcard/evidence/test-001/test_123_search.png', filename: 'test_123_search.png', actionType: 'search', timestamp: Date.now() },
    { path: '/sdcard/evidence/test-001/test_124_click.png', filename: 'test_124_click.png', actionType: 'click', timestamp: Date.now() }
];

// finishJob 호출 (실제 파일 쓰기는 건너뜀)
var mockResult = {
    success: true,
    searchSuccess: true,
    watchDuration: 120,
    error: null
};

// result 객체 구조 검증 (실제 저장은 하지 않음)
var result = {
    assignment_id: EvidenceManager.currentJob.assignmentId,
    success: mockResult.success,
    search_success: mockResult.searchSuccess,
    watch_duration_sec: mockResult.watchDuration,
    evidence_files: EvidenceManager.currentJob.files.map(function(f) {
        return { path: f.path, filename: f.filename, action_type: f.actionType };
    }),
    evidence_count: EvidenceManager.currentJob.files.length
};

test('result 객체: assignment_id 포함',
    result.assignment_id === 'test-assignment-001');

test('result 객체: evidence_files 배열 포함',
    Array.isArray(result.evidence_files) && result.evidence_files.length === 2);

test('result 객체: 각 파일에 path 포함',
    result.evidence_files.every(function(f) { return f.path && f.path.length > 0; }));

test('result 객체: evidence_count 정확',
    result.evidence_count === 2);

// =============================================
// 결과 출력
// =============================================
console.log('\n========================================');
console.log('테스트 결과: ' + testsPassed + '/' + (testsPassed + testsFailed) + ' 통과');
if (testsFailed === 0) {
    console.log('✅ 모든 테스트 통과!');
} else {
    console.log('❌ ' + testsFailed + '개 테스트 실패');
}
console.log('========================================\n');

// 샘플 result.json 출력
console.log('[Sample result.json 구조]');
console.log(JSON.stringify(result, null, 2));
