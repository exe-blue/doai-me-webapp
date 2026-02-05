// Supabase 연결 테스트 스크립트
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// NOTE: The service role key should be rotated regularly for security.
// Never commit keys to version control. Use environment variables only.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경 변수 누락! SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY를 설정하세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔌 Supabase 연결 테스트 시작...\n');
  
  const tables = ['devices', 'jobs', 'job_assignments', 'salary_logs', 'monitored_channels'];
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: 테이블 존재 (${count ?? 0}개 레코드)`);
      }
    } catch (e) {
      console.log(`❌ ${table}: ${e.message}`);
    }
  }
  
  console.log('\n테스트 완료!');
}

testConnection();
