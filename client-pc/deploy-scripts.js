/**
 * deploy-scripts.js
 * 모든 연결된 디바이스에 AutoX.js 스크립트 배포
 * 
 * 사용법:
 *   node deploy-scripts.js [--device SERIAL] [--force]
 * 
 * 옵션:
 *   --device SERIAL  특정 디바이스에만 배포
 *   --force          기존 파일 덮어쓰기
 */

const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

// 설정
const ADB_PATH = process.env.ADB_PATH || 'adb';
const DEVICE_SCRIPT_PATH = '/sdcard/Scripts/doai-bot';
const LOCAL_SCRIPT_PATH = path.join(__dirname, '..', 'client-mobile');

// 배포할 파일 목록
const DEPLOY_FILES = [
    // 메인 봇 스크립트
    { local: 'bot.js', remote: 'bot.js' },
    
    // Core 모듈들
    { local: 'core/Utils.js', remote: 'core/Utils.js' },
    { local: 'core/Logger.js', remote: 'core/Logger.js' },
    { local: 'core/SupabaseClient.js', remote: 'core/SupabaseClient.js' },
    { local: 'core/EvidenceManager.js', remote: 'core/EvidenceManager.js' },
    { local: 'core/ErrorRecovery.js', remote: 'core/ErrorRecovery.js' },
    { local: 'core/YouTubeActions.js', remote: 'core/YouTubeActions.js' },
    { local: 'core/SearchFlow.js', remote: 'core/SearchFlow.js' },
    { local: 'core/AdSkipper.js', remote: 'core/AdSkipper.js' },
    { local: 'core/RandomSurf.js', remote: 'core/RandomSurf.js' },
    
    // Selectors 설정
    { local: 'selectors.json', remote: 'selectors.json' },
];

// =============================================
// ADB 헬퍼 함수
// =============================================

function runAdb(args, timeout = 10000) {
    return new Promise((resolve, reject) => {
        execFile(ADB_PATH, args, { timeout }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`ADB error: ${error.message}`));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function getConnectedDevices() {
    const output = await runAdb(['devices', '-l']);
    const devices = [];
    
    const lines = output.split('\n');
    for (const line of lines) {
        if (!line.includes('device') || line.includes('List of')) continue;
        
        const parts = line.split(/\s+/);
        const serial = parts[0];
        
        // 에뮬레이터 제외
        if (serial.includes('emulator') || serial.includes(':5555')) continue;
        
        // 모델명 추출
        const modelMatch = line.match(/model:(\S+)/);
        const model = modelMatch ? modelMatch[1] : 'Unknown';
        
        devices.push({ serial, model });
    }
    
    return devices;
}

async function pushFile(serial, localPath, remotePath) {
    const fullLocal = path.join(LOCAL_SCRIPT_PATH, localPath);
    const fullRemote = `${DEVICE_SCRIPT_PATH}/${remotePath}`;
    
    // 로컬 파일 존재 확인
    if (!fs.existsSync(fullLocal)) {
        throw new Error(`Local file not found: ${fullLocal}`);
    }
    
    // 원격 디렉토리 생성
    const remoteDir = path.dirname(fullRemote).replace(/\\/g, '/');
    await runAdb(['-s', serial, 'shell', 'mkdir', '-p', remoteDir]);
    
    // 파일 푸시
    await runAdb(['-s', serial, 'push', fullLocal, fullRemote], 30000);
    
    return { local: fullLocal, remote: fullRemote };
}

// =============================================
// 메인 배포 함수
// =============================================

async function deployToDevice(serial, model, force = false) {
    console.log(`\n📱 배포 시작: ${serial} (${model})`);
    console.log('─'.repeat(50));
    
    let successCount = 0;
    let failCount = 0;
    
    for (const file of DEPLOY_FILES) {
        const localPath = path.join(LOCAL_SCRIPT_PATH, file.local);
        
        // 파일 존재 확인
        if (!fs.existsSync(localPath)) {
            console.log(`   ⚠️  ${file.local} - 파일 없음 (스킵)`);
            continue;
        }
        
        try {
            const result = await pushFile(serial, file.local, file.remote);
            console.log(`   ✅ ${file.local}`);
            successCount++;
        } catch (e) {
            console.log(`   ❌ ${file.local} - ${e.message}`);
            failCount++;
        }
    }
    
    // 로그 디렉토리 생성
    try {
        await runAdb(['-s', serial, 'shell', 'mkdir', '-p', '/sdcard/doai_logs']);
        console.log(`   ✅ /sdcard/doai_logs/ 디렉토리 생성`);
    } catch (e) {
        // 무시
    }
    
    console.log('─'.repeat(50));
    console.log(`   📊 결과: ${successCount} 성공, ${failCount} 실패`);
    
    return { success: successCount, fail: failCount };
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         DoAi.me Script Deployment Tool v1.0            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    // 인자 파싱
    const args = process.argv.slice(2);
    const targetDevice = args.includes('--device') 
        ? args[args.indexOf('--device') + 1] 
        : null;
    const force = args.includes('--force');
    
    // 연결된 디바이스 목록
    console.log('🔍 연결된 디바이스 검색 중...');
    const devices = await getConnectedDevices();
    
    if (devices.length === 0) {
        console.log('❌ 연결된 디바이스가 없습니다.');
        process.exit(1);
    }
    
    console.log(`✅ ${devices.length}개 디바이스 발견:\n`);
    devices.forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.serial} (${d.model})`);
    });
    
    // 배포 대상 필터링
    const targets = targetDevice 
        ? devices.filter(d => d.serial === targetDevice)
        : devices;
    
    if (targets.length === 0) {
        console.log(`\n❌ 대상 디바이스를 찾을 수 없습니다: ${targetDevice}`);
        process.exit(1);
    }
    
    // 배포 실행
    let totalSuccess = 0;
    let totalFail = 0;
    
    for (const device of targets) {
        const result = await deployToDevice(device.serial, device.model, force);
        totalSuccess += result.success;
        totalFail += result.fail;
    }
    
    // 최종 결과
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║  배포 완료: ${targets.length}개 디바이스, ${totalSuccess} 성공, ${totalFail} 실패`);
    console.log('╚════════════════════════════════════════════════════════╝');
}

// 실행
main().catch(e => {
    console.error('❌ 배포 실패:', e.message);
    process.exit(1);
});
