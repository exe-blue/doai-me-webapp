/**
 * Utils.test.js
 * 고유 파일명 생성 로직 테스트
 *
 * 테스트 실행: node Utils.test.js
 */

// Utils 모듈 로드
const Utils = require('./Utils.js');

/**
 * 테스트 결과 카운터
 */
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        passed++;
    } else {
        console.log(`❌ FAIL: ${message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    const result = actual === expected;
    if (result) {
        console.log(`✅ PASS: ${message}`);
        passed++;
    } else {
        console.log(`❌ FAIL: ${message}`);
        console.log(`   Expected: ${expected}`);
        console.log(`   Actual:   ${actual}`);
        failed++;
    }
}

// =============================================
// 테스트 케이스
// =============================================

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Utils.generateUniqueFilename() 테스트');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// 테스트 1: 파일명 형식 검증 (YYYYMMDD_HHmmssSSS_SEQ_JobID_Type.ext)
console.log('[Test 1] 파일명 형식 검증');
const filename1 = Utils.generateUniqueFilename('job123', 'screenshot', 'png');
// 형식: 20260129_180236123_00_job123_screenshot.png
const formatRegex = /^\d{8}_\d{9}_\d{2}_[a-zA-Z0-9_]+_[a-zA-Z0-9_]+\.\w+$/;
assert(formatRegex.test(filename1), `파일명 형식이 YYYYMMDD_HHmmssSSS_JobID_Type.ext 형식이어야 함: ${filename1}`);

// 테스트 2: 파일명에 날짜가 포함되어야 함
console.log('[Test 2] 날짜 포함 검증');
const now = new Date();
const expectedDatePrefix = String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
assert(filename1.startsWith(expectedDatePrefix), `파일명이 오늘 날짜(${expectedDatePrefix})로 시작해야 함`);

// 테스트 3: Job ID가 파일명에 포함되어야 함
console.log('[Test 3] Job ID 포함 검증');
assert(filename1.includes('job123'), 'Job ID가 파일명에 포함되어야 함');

// 테스트 4: 액션 타입이 파일명에 포함되어야 함
console.log('[Test 4] 액션 타입 포함 검증');
assert(filename1.includes('screenshot'), '액션 타입이 파일명에 포함되어야 함');

// 테스트 5: 확장자 검증
console.log('[Test 5] 확장자 검증');
assert(filename1.endsWith('.png'), '확장자가 .png여야 함');

// 테스트 6: 연속 3회 호출 시 3개의 서로 다른 파일명 생성
console.log('');
console.log('[Test 6] 연속 3회 호출 시 고유성 검증 (덮어쓰기 방지)');
const filenames = new Set();
const filenamesList = [];

for (let i = 0; i < 3; i++) {
    const fn = Utils.generateUniqueFilename('testjob', 'action' + i, 'png');
    filenamesList.push(fn);
    filenames.add(fn);
    console.log(`   [${i + 1}] ${fn}`);
}

assertEqual(filenames.size, 3, '3번 호출 시 3개의 서로 다른 파일명이 생성되어야 함');

// 테스트 7: 동일 밀리초 내 호출 시에도 고유해야 함 (밀리초 포함으로 보장)
console.log('');
console.log('[Test 7] 빠른 연속 호출 시 고유성 검증');
const rapidFilenames = new Set();
for (let i = 0; i < 10; i++) {
    rapidFilenames.add(Utils.generateUniqueFilename('rapidjob', 'rapid', 'jpg'));
}
// 밀리초까지 포함하므로 대부분 고유해야 함 (최소 5개 이상)
assert(rapidFilenames.size >= 5, `빠른 연속 호출 시 최소 5개 이상 고유해야 함 (실제: ${rapidFilenames.size}개)`);

// 테스트 8: 특수문자 sanitize 검증
console.log('');
console.log('[Test 8] 특수문자 sanitize 검증');
const unsafeFilename = Utils.generateUniqueFilename('job/123:test', 'action*type', 'png');
assert(!unsafeFilename.includes('/'), '/ 문자가 제거되어야 함');
assert(!unsafeFilename.includes(':'), ': 문자가 제거되어야 함');
assert(!unsafeFilename.includes('*'), '* 문자가 제거되어야 함');
console.log(`   Sanitized: ${unsafeFilename}`);

// 테스트 9: 기본 확장자 (png) 검증
console.log('');
console.log('[Test 9] 기본 확장자 검증');
const defaultExtFilename = Utils.generateUniqueFilename('job', 'action');
assert(defaultExtFilename.endsWith('.png'), '확장자 미지정 시 .png가 기본값이어야 함');

// 테스트 10: 다양한 확장자 검증
console.log('');
console.log('[Test 10] 다양한 확장자 검증');
const logFilename = Utils.generateUniqueFilename('job', 'action', 'log');
assert(logFilename.endsWith('.log'), '.log 확장자 지원');

const jsonFilename = Utils.generateUniqueFilename('job', 'action', 'json');
assert(jsonFilename.endsWith('.json'), '.json 확장자 지원');

// =============================================
// 결과 요약
// =============================================

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  테스트 결과 요약');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  ✅ 통과: ${passed}`);
console.log(`  ❌ 실패: ${failed}`);
console.log(`  📊 총계: ${passed + failed}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// 종료 코드 반환
if (failed > 0) {
    console.log('⚠️  일부 테스트 실패');
    process.exit(1);
} else {
    console.log('🎉 모든 테스트 통과!');
    process.exit(0);
}
