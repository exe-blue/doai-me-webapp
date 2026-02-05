/**
 * 기기 온보딩 스크립트
 * 새로운 기기가 연결되었을 때 필요한 권한과 설정을 자동으로 구성합니다.
 * 
 * 설정 항목:
 * 1. AutoX.js 접근성 서비스 활성화
 * 2. AutoX.js 스크린샷 권한 부여
 * 3. 저장소 권한 부여
 * 
 * 사용법:
 *   node scripts/device_onboarding.js [device_serial]
 *   node scripts/device_onboarding.js           # 모든 연결된 기기
 *   node scripts/device_onboarding.js 314b4e51  # 특정 기기
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ADB 경로
const ADB_PATH = process.env.ADB_PATH || 'C:\\platform-tools\\adb.exe';

// AutoX.js 패키지 및 서비스 정보
const AUTOXJS_PACKAGE = 'org.autojs.autoxjs.v6';
const ACCESSIBILITY_SERVICE = `${AUTOXJS_PACKAGE}/com.stardust.autojs.core.accessibility.AccessibilityService`;

// 스크린샷 권한 부여 스크립트 경로
const PERMISSION_SCRIPT = path.join(__dirname, '..', 'client-mobile', 'grant_screenshot_permission.js');

/**
 * ADB 명령어 실행
 */
function runAdb(serial, args) {
    const cmd = `"${ADB_PATH}" -s ${serial} ${args.join(' ')}`;
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
    } catch (e) {
        console.error(`   ❌ ADB 오류: ${e.message}`);
        return null;
    }
}

/**
 * 연결된 기기 목록 가져오기
 */
function getConnectedDevices() {
    const output = execSync(`"${ADB_PATH}" devices`, { encoding: 'utf-8' });
    const lines = output.split('\n').filter(line => line.includes('\tdevice'));
    return lines.map(line => line.split('\t')[0]);
}

/**
 * 1. 접근성 서비스 활성화
 */
function enableAccessibilityService(serial) {
    console.log('   1️⃣ 접근성 서비스 확인 중...');
    
    const current = runAdb(serial, ['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services']);
    
    if (current && current.includes(ACCESSIBILITY_SERVICE)) {
        console.log('      ✅ 이미 활성화됨');
        return true;
    }
    
    console.log('      🔧 접근성 서비스 활성화 중...');
    runAdb(serial, ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', `"${ACCESSIBILITY_SERVICE}"`]);
    runAdb(serial, ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1']);
    
    // 확인
    const after = runAdb(serial, ['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services']);
    if (after && after.includes(ACCESSIBILITY_SERVICE)) {
        console.log('      ✅ 접근성 서비스 활성화 완료');
        return true;
    } else {
        console.log('      ❌ 접근성 서비스 활성화 실패');
        return false;
    }
}

/**
 * 2. 저장소 권한 부여
 */
function grantStoragePermissions(serial) {
    console.log('   2️⃣ 저장소 권한 부여 중...');
    
    const permissions = [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.WAKE_LOCK'
    ];
    
    for (const perm of permissions) {
        runAdb(serial, ['shell', 'pm', 'grant', AUTOXJS_PACKAGE, perm]);
    }
    
    console.log('      ✅ 저장소 권한 부여 완료');
    return true;
}

/**
 * 3. 스크린샷 권한 부여 스크립트 실행
 */
async function grantScreenshotPermission(serial) {
    console.log('   3️⃣ 스크린샷 권한 부여 중...');
    
    // 스크립트가 존재하는지 확인
    if (!fs.existsSync(PERMISSION_SCRIPT)) {
        console.log('      ⚠️ 권한 스크립트 없음, 건너뜀');
        return false;
    }
    
    // 스크립트를 기기에 푸시
    runAdb(serial, ['push', `"${PERMISSION_SCRIPT}"`, '/sdcard/Scripts/grant_screenshot_permission.js']);
    
    // 스크립트 실행
    runAdb(serial, [
        'shell', 'am', 'start',
        '-a', 'android.intent.action.VIEW',
        '-d', '"file:///sdcard/Scripts/grant_screenshot_permission.js"',
        '-t', '"text/javascript"',
        '-n', `"${AUTOXJS_PACKAGE}/org.autojs.autojs.external.open.RunIntentActivity"`
    ]);
    
    // 스크립트 실행 대기 및 결과 확인
    console.log('      ⏳ 권한 다이얼로그 처리 대기 중 (10초)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 테스트 스크린샷 파일 확인
    const result = runAdb(serial, ['shell', 'ls', '/sdcard/test_screenshot_permission.png']);
    if (result && result.includes('test_screenshot_permission.png')) {
        console.log('      ✅ 스크린샷 권한 부여 완료');
        return true;
    } else {
        console.log('      ⚠️ 스크린샷 권한 부여 실패 (수동 허용 필요)');
        return false;
    }
}

/**
 * 단일 기기 온보딩 수행
 */
async function onboardDevice(serial) {
    console.log(`\n📱 기기 온보딩: ${serial}`);
    console.log('='.repeat(40));
    
    const results = {
        accessibility: false,
        storage: false,
        screenshot: false
    };
    
    // 1. 접근성 서비스
    results.accessibility = enableAccessibilityService(serial);
    
    // 2. 저장소 권한
    results.storage = grantStoragePermissions(serial);
    
    // 3. 스크린샷 권한 (접근성이 활성화된 경우에만)
    if (results.accessibility) {
        results.screenshot = await grantScreenshotPermission(serial);
    } else {
        console.log('   3️⃣ 스크린샷 권한: ⏭️ 건너뜀 (접근성 필요)');
    }
    
    // 결과 요약
    console.log('\n   📊 온보딩 결과:');
    console.log(`      - 접근성 서비스: ${results.accessibility ? '✅' : '❌'}`);
    console.log(`      - 저장소 권한: ${results.storage ? '✅' : '❌'}`);
    console.log(`      - 스크린샷 권한: ${results.screenshot ? '✅' : '⚠️'}`);
    
    return results;
}

/**
 * 메인 실행
 */
async function main() {
    console.log('🚀 AutoX.js 기기 온보딩 시작\n');
    
    const targetSerial = process.argv[2];
    let devices;
    
    if (targetSerial) {
        devices = [targetSerial];
        console.log(`📌 대상 기기: ${targetSerial}`);
    } else {
        devices = getConnectedDevices();
        console.log(`📌 연결된 기기: ${devices.length}대`);
    }
    
    if (devices.length === 0) {
        console.log('❌ 연결된 기기가 없습니다.');
        process.exit(1);
    }
    
    const allResults = {};
    
    for (const device of devices) {
        allResults[device] = await onboardDevice(device);
    }
    
    // 전체 요약
    console.log('\n' + '='.repeat(50));
    console.log('📋 전체 온보딩 결과 요약');
    console.log('='.repeat(50));
    
    for (const [device, results] of Object.entries(allResults)) {
        const status = results.accessibility && results.storage ? '✅ 준비됨' : '⚠️ 확인 필요';
        console.log(`  ${device}: ${status}`);
    }
    
    console.log('\n✅ 온보딩 완료\n');
}

main().catch(console.error);
