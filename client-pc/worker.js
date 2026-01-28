/**
 * [Agent-Node] Worker Client
 * 역할: ADB 장치 감시, Supabase 등록, 상태 보고 (Watchdog)
 */

require('dotenv').config({ path: '../.env' }); // 상위 폴더의 .env 참조
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const config = require('./config.json');

// 1. Supabase 연결
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // 주의: PC는 관리자 권한 키 사용
);

// ADB 경로 설정 (.env의 ADB_PATH 사용, 없으면 기본값)
const ADB_PATH = process.env.ADB_PATH || 'adb';

console.log(`[System] PC-Client (${config.pc_id}) Starting...`);
console.log(`[System] ADB Path: ${ADB_PATH}`);

// 2. ADB 장치 목록 가져오기 (CLI Wrapper)
function getConnectedDevices() {
    return new Promise((resolve, reject) => {
        exec(`"${ADB_PATH}" devices`, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ADB Error] ${error.message}`);
                resolve([]); // 에러나도 프로세스는 죽지 않음 (Watchdog)
                return;
            }
            
            const devices = [];
            const lines = stdout.split('\n');
            
            // "List of devices attached" 다음 줄부터 파싱
            for (let line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2 && parts[1].trim() === 'device') {
                    devices.push(parts[0].trim()); // Serial Number
                }
            }
            resolve(devices);
        });
    });
}

// 3. 장치 등록 및 업데이트 (Upsert Logic)
async function syncDevices() {
    const serials = await getConnectedDevices();
    
    if (serials.length === 0) {
        console.log(`[Watchdog] 연결된 기기 없음. 대기중...`);
        return;
    }

    const updates = serials.map(serial => {
        // 그룹 매핑 로직
        const groupId = config.groups.mappings[serial] || config.groups.default;

        return {
            serial_number: serial,
            pc_id: config.pc_id,
            group_id: groupId,
            status: 'idle', // 연결되면 기본 상태는 대기
            last_seen_at: new Date().toISOString()
        };
    });

    // Supabase에 일괄 저장 (이미 있으면 update, 없으면 insert)
    const { data, error } = await supabase
        .from('devices')
        .upsert(updates, { onConflict: 'serial_number' });

    if (error) console.error('[DB Error]', error.message);
    else console.log(`[Sync] ${serials.length}대 장치 동기화 완료 (Group: ${config.groups.default})`);
}

// 4. 실행 루프 (Watchdog)
setInterval(syncDevices, config.scan_interval_ms);
syncDevices(); // 즉시 1회 실행