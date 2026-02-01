-- =============================================
-- Atomic Job Claiming RPC Function
-- =============================================
-- 목적: Race condition 방지하여 동일 작업을 여러 Worker가 가져가는 문제 해결
-- 작성일: 2026-01-29
-- 버전: Worker v5.1

-- claim_job RPC 함수 생성
CREATE OR REPLACE FUNCTION claim_job(
    p_pc_id TEXT,
    p_device_id UUID
)
RETURNS TABLE(
    assignment_id UUID,
    job_id UUID,
    keyword TEXT,
    video_title TEXT,
    duration_sec INTEGER
) AS $$
DECLARE
    v_assignment_id UUID;
    v_job_id UUID;
    v_keyword TEXT;
    v_video_title TEXT;
    v_duration_sec INTEGER;
BEGIN
    -- Atomic update: pending 상태의 첫 번째 작업을 running으로 변경
    -- FOR UPDATE SKIP LOCKED로 동시성 제어
    UPDATE job_assignments ja
    SET
        status = 'running',
        started_at = NOW()
    FROM jobs j
    WHERE ja.id = (
        SELECT ja2.id
        FROM job_assignments ja2
        WHERE ja2.status = 'pending'
          AND ja2.device_id = p_device_id
        ORDER BY ja2.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    AND ja.job_id = j.id
    RETURNING
        ja.id,
        ja.job_id,
        j.keyword,
        j.video_title,
        60 -- 기본 duration_sec (향후 jobs 테이블에 추가 가능)
    INTO
        v_assignment_id,
        v_job_id,
        v_keyword,
        v_video_title,
        v_duration_sec;

    -- 작업이 할당되지 않은 경우 (pending 작업 없음)
    IF v_assignment_id IS NULL THEN
        RETURN; -- 빈 결과 반환
    END IF;

    -- 기기 상태를 busy로 업데이트
    UPDATE devices
    SET status = 'busy'
    WHERE id = p_device_id;

    -- 결과 반환
    assignment_id := v_assignment_id;
    job_id := v_job_id;
    keyword := v_keyword;
    video_title := v_video_title;
    duration_sec := v_duration_sec;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 함수 설명 추가
COMMENT ON FUNCTION claim_job(TEXT, UUID) IS
'Atomically claims a pending job assignment for a device. Prevents race conditions when multiple workers try to claim the same job. Uses FOR UPDATE SKIP LOCKED for high-performance concurrency control.';

-- =============================================
-- 테스트 쿼리 (개발용)
-- =============================================
-- 사용법:
-- SELECT * FROM claim_job('PC-01', '00000000-0000-0000-0000-000000000001');

-- 예상 결과:
-- assignment_id | job_id | keyword | video_title | duration_sec
-- --------------|--------|---------|-------------|-------------
-- (UUID)        | (UUID) | "GPT-4" | "OpenAI"    | 60

-- 작업이 없는 경우:
-- (빈 테이블)
