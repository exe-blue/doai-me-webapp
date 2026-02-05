/* eslint-disable @typescript-eslint/no-require-imports */
// Supabase 연결 테스트 스크립트
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('='.repeat(50));
console.log('🔌 Supabase 연결 테스트');
console.log('='.repeat(50));
console.log(`URL: ${supabaseUrl}`);
console.log(`Key: ${supabaseKey?.slice(0, 20)}...`);
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경 변수 누락!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // 1. devices 테이블 확인
    console.log('📋 테이블 존재 여부 확인...');
    
    const tables = ['devices', 'jobs', 'job_assignments', 'monitored_channels'];
    
    for (const table of tables) {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        if (error.code === '42P01') {
          console.log(`  ❌ ${table}: 테이블 없음`);
        } else {
          console.log(`  ⚠️ ${table}: ${error.message}`);
        }
      } else {
        console.log(`  ✅ ${table}: 존재함 (${count ?? 0}개 행)`);
      }
    }
    
    console.log('');
    console.log('='.repeat(50));
    console.log('✅ 연결 테스트 완료');
    console.log('='.repeat(50));
    
  } catch (err) {
    console.error('❌ 연결 실패:', err.message);
    process.exit(1);
  }
}

testConnection();
