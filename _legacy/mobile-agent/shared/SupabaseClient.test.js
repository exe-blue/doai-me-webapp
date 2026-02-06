/**
 * SupabaseClient.test.js
 * SupabaseClient 모듈 테스트
 *
 * 실행: node SupabaseClient.test.js
 */

const SupabaseClient = require('./SupabaseClient.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log('✅ PASS:', message);
        passed++;
    } else {
        console.log('❌ FAIL:', message);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    const result = actual === expected;
    if (result) {
        console.log('✅ PASS:', message);
        passed++;
    } else {
        console.log('❌ FAIL:', message);
        console.log('   Expected:', expected);
        console.log('   Actual:', actual);
        failed++;
    }
}

// =============================================
// 테스트 케이스
// =============================================

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  SupabaseClient 테스트');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Test 1: 초기화 - 필수 파라미터 누락
console.log('[Test 1] 초기화 - 필수 파라미터 검증');
try {
    SupabaseClient.init({});
    assert(false, 'url/anonKey 없이 초기화 시 에러가 발생해야 함');
} catch (e) {
    assert(e.message.includes('필수'), '필수 파라미터 누락 시 에러 발생');
}

// Test 2: 정상 초기화
console.log('');
console.log('[Test 2] 정상 초기화');
const initResult = SupabaseClient.init({
    url: 'https://test.supabase.co/',
    anonKey: 'test-anon-key-12345',
    deviceId: 'device-uuid-001',
    serialNumber: 'ABC123456789'
});
assert(initResult === true, '초기화 성공');

// Test 3: Config 확인
console.log('');
console.log('[Test 3] Config 확인');
const config = SupabaseClient.getConfig();
assertEqual(config.url, 'https://test.supabase.co', 'URL 끝 슬래시 제거');
assertEqual(config.deviceId, 'device-uuid-001', 'deviceId 설정');
assertEqual(config.serialNumber, 'ABC123456789', 'serialNumber 설정');

// Test 4: pollAssignment (시뮬레이션)
console.log('');
console.log('[Test 4] pollAssignment 시뮬레이션');
const assignment = SupabaseClient.pollAssignment();
assert(assignment === null || typeof assignment === 'object', 'pollAssignment 반환값 타입 확인');

// Test 5: startAssignment (시뮬레이션)
console.log('');
console.log('[Test 5] startAssignment 시뮬레이션');
const startResult = SupabaseClient.startAssignment('test-assignment-id');
assert(startResult.success === true || startResult.simulated === true, 'startAssignment 호출');

// Test 6: updateProgress (시뮬레이션)
console.log('');
console.log('[Test 6] updateProgress 시뮬레이션');
const progressResult = SupabaseClient.updateProgress('test-assignment-id', 50);
assert(progressResult.success === true || progressResult.simulated === true, 'updateProgress 호출');

// Test 7: completeAssignment (시뮬레이션)
console.log('');
console.log('[Test 7] completeAssignment 시뮬레이션');
const completeResult = SupabaseClient.completeAssignment('test-assignment-id', {
    durationSec: 120,
    didLike: true,
    didComment: false,
    didPlaylist: false
});
assert(completeResult.success === true || completeResult.simulated === true, 'completeAssignment 호출');

// Test 8: failAssignment (시뮬레이션)
console.log('');
console.log('[Test 8] failAssignment 시뮬레이션');
const failResult = SupabaseClient.failAssignment('test-assignment-id', 'E2001', 'Video not found', 1);
assert(failResult.success === true || failResult.simulated === true, 'failAssignment 호출');

// Test 9: sendHeartbeat (시뮬레이션)
console.log('');
console.log('[Test 9] sendHeartbeat 시뮬레이션');
const heartbeatResult = SupabaseClient.sendHeartbeat();
assert(heartbeatResult.success === true || heartbeatResult.simulated === true, 'sendHeartbeat 호출');

// Test 10: testConnection (시뮬레이션)
console.log('');
console.log('[Test 10] testConnection 시뮬레이션');
const connectionResult = SupabaseClient.testConnection();
assert(connectionResult === true, 'testConnection 호출');

// =============================================
// 결과 요약
// =============================================

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  테스트 결과 요약');
console.log('═══════════════════════════════════════════════════════════');
console.log('  ✅ 통과:', passed);
console.log('  ❌ 실패:', failed);
console.log('  📊 총계:', passed + failed);
console.log('═══════════════════════════════════════════════════════════');
console.log('');

if (failed > 0) {
    console.log('⚠️ 일부 테스트 실패');
    process.exit(1);
} else {
    console.log('🎉 모든 테스트 통과!');
    process.exit(0);
}
