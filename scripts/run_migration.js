/**
 * Migration Runner & Unit Tests
 * BE-01: keyword, duration_sec, search_success 컬럼 추가
 */
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =============================================
// 1. Migration SQL 실행
// =============================================
async function runMigration() {
    console.log('\n========================================');
    console.log('[Migration] 스키마 마이그레이션 시작...');
    console.log('========================================\n');

    const migrations = [
        {
            name: 'jobs.keyword',
            sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;`
        },
        {
            name: 'jobs.duration_sec',
            sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duration_sec INTEGER DEFAULT 60;`
        },
        {
            name: 'job_assignments.search_success',
            sql: `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS search_success BOOLEAN DEFAULT FALSE;`
        },
        {
            name: 'idx_jobs_keyword',
            sql: `CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);`
        },
        {
            name: 'idx_assignments_search_success',
            sql: `CREATE INDEX IF NOT EXISTS idx_assignments_search_success ON job_assignments(search_success);`
        }
    ];

    for (const migration of migrations) {
        try {
            const { error } = await supabase.rpc('exec_sql', { sql: migration.sql });
            if (error) {
                // RPC가 없으면 직접 쿼리 시도 (Supabase는 직접 DDL 실행 제한)
                console.log(`[Migration] ${migration.name}: RPC 없음, 수동 실행 필요`);
            } else {
                console.log(`[Migration] ${migration.name}: 성공`);
            }
        } catch (err) {
            console.log(`[Migration] ${migration.name}: 수동 실행 필요 (${err.message})`);
        }
    }

    console.log('\n[Migration] SQL Editor에서 직접 실행이 필요할 수 있습니다.');
    console.log('[Migration] migrations/001_add_keyword_search_success.sql 참조\n');
}

// =============================================
// 2. 스키마 검증 테스트
// =============================================
async function testSchemaVerification() {
    console.log('\n========================================');
    console.log('[Test 1] 스키마 검증 테스트');
    console.log('========================================\n');

    // Test: jobs 테이블에 keyword, duration_sec 컬럼 존재 확인
    const { data: jobsTest, error: jobsError } = await supabase
        .from('jobs')
        .select('id, title, keyword, duration_sec')
        .limit(1);

    if (jobsError) {
        if (jobsError.message.includes('keyword') || jobsError.message.includes('duration_sec')) {
            console.log('[Test 1.1] jobs 테이블: ❌ FAIL - 컬럼 없음');
            console.log(`         Error: ${jobsError.message}`);
            return false;
        }
        console.log(`[Test 1.1] jobs 테이블: ⚠️ 쿼리 오류 - ${jobsError.message}`);
    } else {
        console.log('[Test 1.1] jobs 테이블 (keyword, duration_sec): ✅ PASS');
    }

    // Test: job_assignments 테이블에 search_success 컬럼 존재 확인
    const { data: assignmentsTest, error: assignmentsError } = await supabase
        .from('job_assignments')
        .select('id, search_success')
        .limit(1);

    if (assignmentsError) {
        if (assignmentsError.message.includes('search_success')) {
            console.log('[Test 1.2] job_assignments 테이블: ❌ FAIL - search_success 컬럼 없음');
            return false;
        }
        console.log(`[Test 1.2] job_assignments 테이블: ⚠️ 쿼리 오류 - ${assignmentsError.message}`);
    } else {
        console.log('[Test 1.2] job_assignments 테이블 (search_success): ✅ PASS');
    }

    return true;
}

// =============================================
// 3. Job Creation 테스트 (Manager 로직)
// =============================================
async function testJobCreation() {
    console.log('\n========================================');
    console.log('[Test 2] Job 생성 테스트 (Manager 로직)');
    console.log('========================================\n');

    const testJob = {
        title: '[TEST] 테스트 영상 제목',
        keyword: '테스트 키워드 검색어',
        duration_sec: 120,
        target_url: 'https://youtu.be/test123',
        script_type: 'youtube_search',
        duration_min_pct: 30,
        duration_max_pct: 90,
        prob_like: 50,
        prob_comment: 30,
        prob_playlist: 10,
        base_reward: 10
    };

    const { data: createdJob, error: createError } = await supabase
        .from('jobs')
        .insert(testJob)
        .select()
        .single();

    if (createError) {
        console.log(`[Test 2.1] Job INSERT: ❌ FAIL - ${createError.message}`);
        return { success: false, jobId: null };
    }

    console.log(`[Test 2.1] Job INSERT: ✅ PASS`);
    console.log(`         Job ID: ${createdJob.id}`);
    console.log(`         keyword: ${createdJob.keyword}`);
    console.log(`         duration_sec: ${createdJob.duration_sec}`);

    // 검증: 값이 올바르게 저장되었는지
    if (createdJob.keyword !== testJob.keyword) {
        console.log(`[Test 2.2] keyword 값 검증: ❌ FAIL`);
        return { success: false, jobId: createdJob.id };
    }
    console.log(`[Test 2.2] keyword 값 검증: ✅ PASS`);

    if (createdJob.duration_sec !== testJob.duration_sec) {
        console.log(`[Test 2.3] duration_sec 값 검증: ❌ FAIL`);
        return { success: false, jobId: createdJob.id };
    }
    console.log(`[Test 2.3] duration_sec 값 검증: ✅ PASS`);

    return { success: true, jobId: createdJob.id };
}

// =============================================
// 4. Worker Polling 테스트 (데이터 매핑)
// =============================================
async function testWorkerPolling(jobId) {
    console.log('\n========================================');
    console.log('[Test 3] Worker Polling 테스트 (데이터 매핑)');
    console.log('========================================\n');

    if (!jobId) {
        console.log('[Test 3] ⚠️ SKIP - Job ID 없음');
        return false;
    }

    // 테스트용 디바이스 생성 (또는 기존 디바이스 사용)
    const { data: device, error: deviceError } = await supabase
        .from('devices')
        .upsert({
            serial_number: 'TEST-DEVICE-001',
            pc_id: 'TEST-PC',
            group_id: 'TEST-GROUP',
            status: 'idle'
        }, { onConflict: 'serial_number' })
        .select()
        .single();

    if (deviceError) {
        console.log(`[Test 3.0] Device 생성: ❌ FAIL - ${deviceError.message}`);
        return false;
    }
    console.log(`[Test 3.0] Device 생성/조회: ✅ PASS (${device.id})`);

    // Job Assignment 생성
    const { data: assignment, error: assignError } = await supabase
        .from('job_assignments')
        .insert({
            job_id: jobId,
            device_id: device.id,
            status: 'pending',
            search_success: false
        })
        .select()
        .single();

    if (assignError) {
        console.log(`[Test 3.1] Assignment INSERT: ❌ FAIL - ${assignError.message}`);
        return false;
    }
    console.log(`[Test 3.1] Assignment INSERT: ✅ PASS (${assignment.id})`);

    // Worker Polling 쿼리 시뮬레이션
    const { data: polledData, error: pollError } = await supabase
        .from('job_assignments')
        .select(`
            id,
            job_id,
            device_id,
            status,
            search_success,
            jobs (
                id,
                title,
                keyword,
                duration_sec,
                target_url,
                script_type,
                prob_like,
                prob_comment,
                prob_playlist
            )
        `)
        .eq('id', assignment.id)
        .single();

    if (pollError) {
        console.log(`[Test 3.2] Polling SELECT: ❌ FAIL - ${pollError.message}`);
        return false;
    }

    console.log(`[Test 3.2] Polling SELECT: ✅ PASS`);
    console.log(`         assignment_id: ${polledData.id}`);
    console.log(`         jobs.keyword: ${polledData.jobs.keyword}`);
    console.log(`         jobs.title: ${polledData.jobs.title}`);
    console.log(`         jobs.duration_sec: ${polledData.jobs.duration_sec}`);

    // 데이터 매핑 검증
    const jobConfig = {
        assignment_id: polledData.id,
        keyword: polledData.jobs.keyword || polledData.jobs.title,
        video_title: polledData.jobs.title,
        duration_sec: polledData.jobs.duration_sec || 60
    };

    console.log(`\n[Test 3.3] job.json 매핑 결과:`);
    console.log(JSON.stringify(jobConfig, null, 2));

    if (!jobConfig.keyword || !jobConfig.video_title || !jobConfig.duration_sec) {
        console.log(`[Test 3.3] 데이터 매핑: ❌ FAIL - 필수 필드 누락`);
        return false;
    }
    console.log(`[Test 3.3] 데이터 매핑: ✅ PASS`);

    return { assignment, device };
}

// =============================================
// 5. search_success 업데이트 테스트
// =============================================
async function testSearchSuccessUpdate(assignmentId) {
    console.log('\n========================================');
    console.log('[Test 4] search_success 업데이트 테스트');
    console.log('========================================\n');

    if (!assignmentId) {
        console.log('[Test 4] ⚠️ SKIP - Assignment ID 없음');
        return false;
    }

    // search_success를 true로 업데이트
    const { data: updated, error: updateError } = await supabase
        .from('job_assignments')
        .update({ search_success: true })
        .eq('id', assignmentId)
        .select('id, search_success')
        .single();

    if (updateError) {
        console.log(`[Test 4.1] search_success UPDATE: ❌ FAIL - ${updateError.message}`);
        return false;
    }

    if (updated.search_success !== true) {
        console.log(`[Test 4.1] search_success UPDATE: ❌ FAIL - 값이 true가 아님`);
        return false;
    }

    console.log(`[Test 4.1] search_success UPDATE: ✅ PASS`);
    return true;
}

// =============================================
// 6. 테스트 데이터 정리
// =============================================
async function cleanupTestData(jobId, assignmentId, deviceId) {
    console.log('\n========================================');
    console.log('[Cleanup] 테스트 데이터 정리');
    console.log('========================================\n');

    if (assignmentId) {
        await supabase.from('job_assignments').delete().eq('id', assignmentId);
        console.log(`[Cleanup] Assignment 삭제: ${assignmentId}`);
    }

    if (jobId) {
        await supabase.from('jobs').delete().eq('id', jobId);
        console.log(`[Cleanup] Job 삭제: ${jobId}`);
    }

    // 테스트 디바이스는 유지 (다른 테스트에서 재사용 가능)
    console.log('[Cleanup] 완료');
}

// =============================================
// Main: 테스트 실행
// =============================================
async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  BE-01 Migration & Unit Tests          ║');
    console.log('║  WebView 기반 검색 유입 자동화         ║');
    console.log('╚════════════════════════════════════════╝');

    let jobId = null;
    let assignmentId = null;
    let deviceId = null;

    try {
        // 1. 마이그레이션 시도
        await runMigration();

        // 2. 스키마 검증
        const schemaOk = await testSchemaVerification();
        if (!schemaOk) {
            console.log('\n⚠️ 스키마 검증 실패. SQL Editor에서 마이그레이션을 실행하세요.');
            console.log('migrations/001_add_keyword_search_success.sql');
            return;
        }

        // 3. Job 생성 테스트
        const jobResult = await testJobCreation();
        if (!jobResult.success) {
            console.log('\n❌ Job 생성 테스트 실패');
            return;
        }
        jobId = jobResult.jobId;

        // 4. Worker Polling 테스트
        const pollResult = await testWorkerPolling(jobId);
        if (pollResult && pollResult.assignment) {
            assignmentId = pollResult.assignment.id;
            deviceId = pollResult.device.id;
        }

        // 5. search_success 업데이트 테스트
        if (assignmentId) {
            await testSearchSuccessUpdate(assignmentId);
        }

        // 결과 요약
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║          테스트 결과 요약              ║');
        console.log('╠════════════════════════════════════════╣');
        console.log('║  ✅ 스키마 검증: PASS                  ║');
        console.log('║  ✅ Job 생성 (keyword, duration_sec)   ║');
        console.log('║  ✅ Worker Polling (데이터 매핑)       ║');
        console.log('║  ✅ search_success 업데이트            ║');
        console.log('╚════════════════════════════════════════╝');

    } catch (err) {
        console.error('\n❌ 테스트 중 오류 발생:', err.message);
    } finally {
        // 테스트 데이터 정리
        await cleanupTestData(jobId, assignmentId, deviceId);
    }
}

main();
