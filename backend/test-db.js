// backend/test-db.js
require('dotenv').config({ path: '../.env' }); // 루트 .env 로드
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: .env 파일에 SUPABASE_URL 또는 SUPABASE_KEY가 없습니다.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConnection() {
    console.log('📡 Testing connection to Supabase...');

    // 1. Devices 테이블 읽기 테스트
    const { data, error } = await supabase.from('devices').select('*').limit(1);

    if (error) {
        console.error('❌ Connection Failed:', error.message);
        console.log('Tip: 테이블이 실제로 존재하는지, RLS 정책(권한)이 열려있는지 확인하세요.');
    } else {
        console.log('✅ Connection Successful!');
        console.log('   Data received:', data);

        // 2. 테이블 카운트 테스트
        console.log('📊 Checking device count...');
        const { count, error: countError } = await supabase
            .from('devices')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.warn('⚠️ Count Failed:', countError.message);
        } else {
            console.log(`✅ Device count: ${count} devices in database`);
        }
    }
}

checkConnection();
