/**
 * ErrorRecovery.test.js
 * ErrorRecovery 모듈 테스트
 *
 * 실행: node ErrorRecovery.test.js
 */

const ErrorRecovery = require('./ErrorRecovery.js');

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
console.log('  ErrorRecovery 테스트');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Test 1: 에러 코드 존재 확인
console.log('[Test 1] 에러 코드 정의 확인');
assert(ErrorRecovery.ErrorCodes.NETWORK_DISCONNECTED === 'E1001', 'NETWORK_DISCONNECTED = E1001');
assert(ErrorRecovery.ErrorCodes.APP_CRASH === 'E3001', 'APP_CRASH = E3001');
assert(ErrorRecovery.ErrorCodes.VIDEO_UNAVAILABLE === 'E2001', 'VIDEO_UNAVAILABLE = E2001');

// Test 2: 재시도 가능 여부 - 재시도 가능 에러
console.log('');
console.log('[Test 2] 재시도 가능 에러 확인');
assert(ErrorRecovery.isRetryable('E1001') === true, 'NETWORK_DISCONNECTED는 재시도 가능');
assert(ErrorRecovery.isRetryable('E3001') === true, 'APP_CRASH는 재시도 가능');
assert(ErrorRecovery.isRetryable('E2004') === true, 'PLAYBACK_STALLED는 재시도 가능');

// Test 3: 재시도 가능 여부 - 재시도 불가 에러
console.log('');
console.log('[Test 3] 재시도 불가 에러 확인');
assert(ErrorRecovery.shouldFailImmediately('E2001') === true, 'VIDEO_UNAVAILABLE는 즉시 실패');
assert(ErrorRecovery.shouldFailImmediately('E2002') === true, 'VIDEO_REGION_BLOCKED는 즉시 실패');
assert(ErrorRecovery.shouldFailImmediately('E3002') === true, 'MEMORY_LOW는 즉시 실패');

// Test 4: 재시도 횟수 제한
console.log('');
console.log('[Test 4] 재시도 횟수 제한 확인');
assert(ErrorRecovery.canRetry(0) === true, '0회 시도 시 재시도 가능');
assert(ErrorRecovery.canRetry(1) === true, '1회 시도 시 재시도 가능');
assert(ErrorRecovery.canRetry(2) === true, '2회 시도 시 재시도 가능');
assert(ErrorRecovery.canRetry(3) === false, '3회 시도 시 재시도 불가');

// Test 5: 재시도 대기 시간 (exponential backoff)
console.log('');
console.log('[Test 5] 재시도 대기 시간 (exponential backoff)');
assertEqual(ErrorRecovery.getRetryDelay(0), 5000, '0회차: 5초');
assertEqual(ErrorRecovery.getRetryDelay(1), 10000, '1회차: 10초');
assertEqual(ErrorRecovery.getRetryDelay(2), 20000, '2회차: 20초');
assertEqual(ErrorRecovery.getRetryDelay(3), 40000, '3회차: 40초');
assertEqual(ErrorRecovery.getRetryDelay(4), 60000, '4회차: 60초 (최대)');
assertEqual(ErrorRecovery.getRetryDelay(10), 60000, '10회차: 60초 (최대 제한)');

// Test 6: 교착 상태 모니터
console.log('');
console.log('[Test 6] 교착 상태 모니터');
const monitor = ErrorRecovery.createStallMonitor(1000); // 1초 타임아웃 (테스트용)
assert(monitor.isStalled() === false, '초기 상태는 교착 아님');
monitor.update(10);
assert(monitor.lastProgress === 10, '진행률 업데이트 확인');

// Test 7: 에러 핸들러 - 재시도 불가 에러
console.log('');
console.log('[Test 7] 에러 핸들러 - 재시도 불가 에러');
const result1 = ErrorRecovery.handleError('E2001', { retryCount: 0 });
assertEqual(result1.action, 'fail', 'VIDEO_UNAVAILABLE은 즉시 실패');

// Test 8: 에러 핸들러 - 네트워크 에러
console.log('');
console.log('[Test 8] 에러 핸들러 - 네트워크 에러');
const result2 = ErrorRecovery.handleError('E1001', { retryCount: 0 });
assertEqual(result2.action, 'wait_network', 'NETWORK_DISCONNECTED는 네트워크 대기');
assertEqual(result2.newRetryCount, 1, '재시도 횟수 증가');

// Test 9: 에러 핸들러 - 앱 크래시
console.log('');
console.log('[Test 9] 에러 핸들러 - 앱 크래시');
const result3 = ErrorRecovery.handleError('E3001', { retryCount: 1 });
assertEqual(result3.action, 'restart_app', 'APP_CRASH는 앱 재시작');
assertEqual(result3.newRetryCount, 2, '재시도 횟수 증가');

// Test 10: 에러 핸들러 - 최대 재시도 초과
console.log('');
console.log('[Test 10] 에러 핸들러 - 최대 재시도 초과');
const result4 = ErrorRecovery.handleError('E3001', { retryCount: 3 });
assertEqual(result4.action, 'fail', '3회 초과 시 실패');

// Test 11: 에러 메시지 조회
console.log('');
console.log('[Test 11] 에러 메시지 조회');
assert(ErrorRecovery.getErrorMessage('E1001').includes('네트워크'), 'E1001 메시지 확인');
assert(ErrorRecovery.getErrorMessage('E2001').includes('찾을 수 없'), 'E2001 메시지 확인');
assert(ErrorRecovery.getErrorMessage('E3001').includes('비정상'), 'E3001 메시지 확인');

// Test 12: Rate Limit 특수 처리
console.log('');
console.log('[Test 12] Rate Limit 특수 처리');
const result5 = ErrorRecovery.handleError('E1003', { retryCount: 0 });
assertEqual(result5.action, 'retry', 'RATE_LIMITED는 재시도');
assert(result5.delay >= 60000, 'Rate Limit은 최소 60초 대기');

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
