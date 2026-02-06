/**
 * Execute SQL via Supabase Management API
 */
const https = require('https');

const PROJECT_REF = 'zmvwwwrslkbcafyzfuhb';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptdnd3d3JzbGtiY2FmeXpmdWhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyNjExMSwiZXhwIjoyMDg1MjAyMTExfQ.87WdRD7xw4Qs1VtLAF0QujDlDCWr1L0xE-zvZ_AS_yM';
const SECRET_KEY = 'sb_secret_2Q7mAh9izbRMdtRx31iCsg_cRhBqSnQ';

const SQL_STATEMENTS = `
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
UPDATE jobs SET keyword = title WHERE keyword IS NULL;
`;

async function executeSQL() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            query: SQL_STATEMENTS
        });

        // Try Management API
        const options = {
            hostname: 'api.supabase.com',
            port: 443,
            path: `/v1/projects/${PROJECT_REF}/database/query`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SECRET_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log('[API] Executing SQL via Management API...');

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[API] Response status: ${res.statusCode}`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, data });
                } else {
                    resolve({ success: false, status: res.statusCode, data });
                }
            });
        });

        req.on('error', (e) => {
            console.log(`[API] Error: ${e.message}`);
            reject(e);
        });
        req.write(postData);
        req.end();
    });
}

async function checkColumnViaREST(table, column) {
    return new Promise((resolve) => {
        const options = {
            hostname: `${PROJECT_REF}.supabase.co`,
            port: 443,
            path: `/rest/v1/${table}?select=${column}&limit=1`,
            method: 'GET',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            }
        };

        const req = https.request(options, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.end();
    });
}

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Supabase SQL Execution                ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Check before
    console.log('[1] 실행 전 상태 확인...');
    let keywordBefore = await checkColumnViaREST('jobs', 'keyword');
    console.log(`    jobs.keyword: ${keywordBefore ? '✅ 존재' : '❌ 없음'}`);

    if (keywordBefore) {
        console.log('\n✅ keyword 컬럼이 이미 존재합니다!');
        return;
    }

    // Execute SQL
    console.log('\n[2] SQL 실행 시도...');
    const result = await executeSQL();

    if (result.success) {
        console.log('    ✅ SQL 실행 성공');
        console.log(`    Response: ${result.data}`);
    } else {
        console.log(`    ⚠️ Management API 응답: ${result.status}`);
        console.log(`    ${result.data}`);
    }

    // Check after
    console.log('\n[3] 실행 후 상태 확인...');
    let keywordAfter = await checkColumnViaREST('jobs', 'keyword');
    console.log(`    jobs.keyword: ${keywordAfter ? '✅ 존재' : '❌ 없음'}`);

    if (keywordAfter) {
        console.log('\n✅ 마이그레이션 성공!');
    } else {
        console.log('\n⚠️ 마이그레이션 실패. Supabase Dashboard에서 수동 실행 필요.');
    }
}

main().catch(console.error);
