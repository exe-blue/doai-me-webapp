/**
 * Execute SQL directly via Supabase
 */
const https = require('https');

const SUPABASE_URL = 'https://zmvwwwrslkbcafyzfuhb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptdnd3d3JzbGtiY2FmeXpmdWhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyNjExMSwiZXhwIjoyMDg1MjAyMTExfQ.87WdRD7xw4Qs1VtLAF0QujDlDCWr1L0xE-zvZ_AS_yM';

// SQL statements to execute
const sqlStatements = [
    'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL',
    'CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword)',
    'UPDATE jobs SET keyword = title WHERE keyword IS NULL'
];

async function executeQuery(sql) {
    return new Promise((resolve, reject) => {
        // Use the pg_query endpoint (if available) or try direct REST
        const postData = JSON.stringify({ query: sql });

        const options = {
            hostname: 'zmvwwwrslkbcafyzfuhb.supabase.co',
            port: 443,
            path: '/rest/v1/rpc/query',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data });
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function testConnection() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'zmvwwwrslkbcafyzfuhb.supabase.co',
            port: 443,
            path: '/rest/v1/jobs?select=id&limit=1',
            method: 'GET',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function checkColumn(table, column) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'zmvwwwrslkbcafyzfuhb.supabase.co',
            port: 443,
            path: `/rest/v1/${table}?select=${column}&limit=1`,
            method: 'GET',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // 200 = column exists, 400 with "column does not exist" = doesn't exist
                resolve(res.statusCode === 200);
            });
        });

        req.on('error', () => resolve(false));
        req.end();
    });
}

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Supabase Direct SQL Execution         ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Test connection
    console.log('[1] 연결 테스트...');
    const connTest = await testConnection();
    if (connTest.status !== 200) {
        console.log(`    ❌ 연결 실패: ${connTest.status}`);
        return;
    }
    console.log('    ✅ 연결 성공\n');

    // Check current column status
    console.log('[2] 현재 컬럼 상태 확인...');
    const keywordExists = await checkColumn('jobs', 'keyword');
    const durationExists = await checkColumn('jobs', 'duration_sec');
    const searchSuccessExists = await checkColumn('job_assignments', 'search_success');

    console.log(`    jobs.keyword:                  ${keywordExists ? '✅' : '❌'}`);
    console.log(`    jobs.duration_sec:             ${durationExists ? '✅' : '❌'}`);
    console.log(`    job_assignments.search_success: ${searchSuccessExists ? '✅' : '❌'}\n`);

    if (keywordExists && durationExists && searchSuccessExists) {
        console.log('✅ 모든 컬럼이 이미 존재합니다!');
        return;
    }

    console.log('[3] 마이그레이션이 필요합니다.');
    console.log('    Supabase CLI를 통해 SQL을 실행합니다...\n');
}

main().catch(console.error);
