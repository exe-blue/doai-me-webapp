-- =====================================================
-- salary_logs 원자적 삽입을 위한 마이그레이션
-- race condition 방지: advisory lock을 사용한 동시성 제어
-- =====================================================

-- 기존의 비원자적 compute_rank_in_group 함수 교체
-- 새로운 원자적 함수로 rank 계산과 INSERT를 단일 트랜잭션에서 처리

-- 1. 원자적 salary_log 삽입 함수 생성
-- job_id에 대한 advisory lock을 획득하여 동시 삽입 방지
CREATE OR REPLACE FUNCTION insert_salary_log_atomic(
  p_assignment_id UUID,
  p_job_id UUID,
  p_watch_percentage INTEGER,
  p_actual_duration_sec INTEGER
) RETURNS TABLE (
  salary_log_id UUID,
  rank_in_group INTEGER,
  was_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER  -- RLS 우회하여 삽입 가능
SET search_path = public
AS $$
DECLARE
  v_rank INTEGER;
  v_log_id UUID;
  v_existing_rank INTEGER;
  v_validated_watch_pct INTEGER;
  v_validated_duration INTEGER;
BEGIN
  -- 입력값 검증 (0-100 범위, 음수 방지)
  v_validated_watch_pct := GREATEST(0, LEAST(100, COALESCE(p_watch_percentage, 0)));
  v_validated_duration := GREATEST(0, COALESCE(p_actual_duration_sec, 0));
  
  -- job_id에 대한 advisory lock 획득 (트랜잭션 종료 시 자동 해제)
  -- hashtext로 job_id를 정수로 변환하여 lock key로 사용
  PERFORM pg_advisory_xact_lock(hashtext(p_job_id::text));
  
  -- 이미 존재하는 salary_log 확인 (중복 방지)
  SELECT id, sl.rank_in_group INTO v_log_id, v_existing_rank
  FROM salary_logs sl
  WHERE sl.assignment_id = p_assignment_id;
  
  IF v_log_id IS NOT NULL THEN
    -- 이미 존재하면 기존 데이터 반환
    salary_log_id := v_log_id;
    rank_in_group := v_existing_rank;
    was_created := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- rank 계산 (lock 보유 중이므로 다른 트랜잭션이 동시에 삽입 불가)
  SELECT COUNT(*) + 1 INTO v_rank
  FROM salary_logs
  WHERE job_id = p_job_id;
  
  -- 새 salary_log 삽입
  INSERT INTO salary_logs (
    assignment_id,
    job_id,
    watch_percentage,
    actual_duration_sec,
    rank_in_group,
    created_at
  ) VALUES (
    p_assignment_id,
    p_job_id,
    v_validated_watch_pct,
    v_validated_duration,
    v_rank,
    NOW()
  )
  RETURNING id INTO v_log_id;
  
  -- 결과 반환
  salary_log_id := v_log_id;
  rank_in_group := v_rank;
  was_created := TRUE;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION insert_salary_log_atomic IS 
'salary_log를 원자적으로 삽입하는 함수. 
advisory lock을 사용하여 동일 job_id에 대한 동시 삽입 시 race condition 방지.
중복 assignment_id가 있으면 기존 데이터를 반환.';

-- 2. 기존 트리거 비활성화 (Edge Function에서 RPC로 직접 호출)
-- 트리거와 RPC 호출이 중복되지 않도록 함
DROP TRIGGER IF EXISTS trigger_create_salary_log ON job_assignments;

COMMENT ON FUNCTION create_salary_log_on_completion() IS 
'[DEPRECATED] Edge Function에서 insert_salary_log_atomic RPC를 직접 호출하므로 
이 트리거 함수는 더 이상 사용되지 않음. 참조용으로 유지.';

-- 3. (선택적) 인덱스 추가 - 동일 job_id에 대한 COUNT 성능 향상
CREATE INDEX IF NOT EXISTS idx_salary_logs_job_id ON salary_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_salary_logs_assignment_id ON salary_logs(assignment_id);
