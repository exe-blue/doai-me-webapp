/**
 * Direct SQL Migration via Supabase REST API
 * BE-01: keyword 컬럼 추가 (duration_sec, search_success는 이미 적용됨)
 */
require('dotenv').config({ path: '../.env' });
const https = require('https');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
    console.error('Invalid Supabase URL');
    process.exit(1);
}

const migrations = [
    {
        name: 'Add keyword column to jobs',
        sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;`
    },
    {
        name: 'Add keyword index',
        sql: `CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);`
    },
    {
        name: 'Add keyword comment',
        sql: `COMMENT ON COLUMN jobs.keyword IS '검색어. NULL이면 URL 직접 진입';`
    },
    {
        name: 'Update existing jobs with keyword from title',
        sql: `UPDATE jobs SET keyword = title WHERE keyword IS NULL;`
    }
];

async function runSQL(sql) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);

        const postData = JSON.stringify({ sql });

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, data });
                } else {
                    resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

async function testColumnExists(table, column) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    try {
        const { data, error } = await supabase
            .from(table)
            .select(column)
            .limit(1);

        return !error;
    } catch {
        return false;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Direct SQL Migration                  ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Check if keyword column exists
    const keywordExists = await testColumnExists('jobs', 'keyword');

    if (keywordExists) {
        console.log('[Check] jobs.keyword 컬럼이 이미 존재합니다. ✅');
    } else {
        console.log('[Check] jobs.keyword 컬럼이 없습니다. 마이그레이션 필요.\n');

        console.log('========================================');
        console.log('Supabase SQL Editor에서 다음 SQL을 실행하세요:');
        console.log('========================================\n');

        console.log(`-- jobs 테이블에 keyword 컬럼 추가
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);

-- 컬럼 설명
COMMENT ON COLUMN jobs.keyword IS '검색어. NULL이면 URL 직접 진입';

-- 기존 데이터 마이그레이션 (title을 keyword로 복사)
UPDATE jobs SET keyword = title WHERE keyword IS NULL;`);

        console.log('\n========================================');
        console.log('URL: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
        console.log('========================================\n');
    }

    // Check other columns
    const durationExists = await testColumnExists('jobs', 'duration_sec');
    const searchSuccessExists = await testColumnExists('job_assignments', 'search_success');

    console.log('\n[컬럼 상태 확인]');
    console.log(`jobs.keyword:                  ${keywordExists ? '✅ 존재' : '❌ 없음'}`);
    console.log(`jobs.duration_sec:             ${durationExists ? '✅ 존재' : '❌ 없음'}`);
    console.log(`job_assignments.search_success: ${searchSuccessExists ? '✅ 존재' : '❌ 없음'}`);

    if (keywordExists && durationExists && searchSuccessExists) {
        console.log('\n✅ 모든 컬럼이 존재합니다. 마이그레이션 완료!');
        return true;
    }

    return false;
}

main().then(success => {
    if (!success) {
        process.exit(1);
    }
});
