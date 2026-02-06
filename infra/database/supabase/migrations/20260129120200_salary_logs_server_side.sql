-- =====================================================
-- salary_logs 서버 사이드 생성 마이그레이션
-- 클라이언트 직접 INSERT를 차단하고 서버에서만 생성 가능하게 함
-- =====================================================

-- 1. job_assignments 테이블에 watch_percentage 컬럼 추가 (없을 경우)
-- 클라이언트가 완료 시 watch_percentage를 전달하면 서버가 이를 검증하여 salary_logs 생성
ALTER TABLE job_assignments 
ADD COLUMN IF NOT EXISTS watch_percentage INTEGER DEFAULT 0;

-- 2. rank_in_group 계산을 위한 함수 생성
-- 같은 job_id 내에서 완료 시간 순으로 순위 계산
CREATE OR REPLACE FUNCTION compute_rank_in_group(p_job_id UUID, p_assignment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rank INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_rank
    FROM salary_logs sl
    WHERE sl.job_id = p_job_id
      AND sl.assignment_id != p_assignment_id;
    
    RETURN v_rank;
END;
$$;

-- 3. salary_logs 생성 트리거 함수
-- job_assignments가 completed로 변경될 때 자동으로 salary_logs 생성
CREATE OR REPLACE FUNCTION create_salary_log_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rank INTEGER;
    v_watch_pct INTEGER;
    v_actual_duration INTEGER;
BEGIN
    -- status가 'completed'로 변경된 경우에만 처리
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        
        -- watch_percentage 검증 (0-100 범위)
        v_watch_pct := COALESCE(NEW.watch_percentage, 0);
        IF v_watch_pct < 0 THEN
            v_watch_pct := 0;
        ELSIF v_watch_pct > 100 THEN
            v_watch_pct := 100;
        END IF;
        
        -- actual_duration_sec 검증 (음수 방지)
        v_actual_duration := COALESCE(NEW.final_duration_sec, 0);
        IF v_actual_duration < 0 THEN
            v_actual_duration := 0;
        END IF;
        
        -- rank_in_group 계산 (이 job에서 몇 번째로 완료했는지)
        v_rank := compute_rank_in_group(NEW.job_id, NEW.id);
        
        -- 중복 방지: 이미 salary_log가 있으면 생성하지 않음
        IF NOT EXISTS (
            SELECT 1 FROM salary_logs WHERE assignment_id = NEW.id
        ) THEN
            INSERT INTO salary_logs (
                assignment_id,
                job_id,
                watch_percentage,
                actual_duration_sec,
                rank_in_group,
                created_at
            ) VALUES (
                NEW.id,
                NEW.job_id,
                v_watch_pct,
                v_actual_duration,
                v_rank,
                NOW()
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 4. 트리거 생성 (기존 트리거가 있으면 삭제 후 재생성)
DROP TRIGGER IF EXISTS trigger_create_salary_log ON job_assignments;
CREATE TRIGGER trigger_create_salary_log
    AFTER UPDATE ON job_assignments
    FOR EACH ROW
    EXECUTE FUNCTION create_salary_log_on_completion();

-- 5. RLS 정책: salary_logs 직접 INSERT 차단
-- 클라이언트(anon, authenticated 역할)는 salary_logs에 직접 INSERT 불가
-- service_role 또는 SECURITY DEFINER 함수만 INSERT 가능

-- 먼저 기존 정책 삭제 (있을 경우)
DROP POLICY IF EXISTS "Deny direct client inserts on salary_logs" ON salary_logs;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON salary_logs;

-- RLS 활성화
ALTER TABLE salary_logs ENABLE ROW LEVEL SECURITY;

-- SELECT는 인증된 사용자에게 허용 (자신의 급여 로그 조회)
CREATE POLICY "Allow select for authenticated users"
    ON salary_logs
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT는 모든 클라이언트 역할에서 차단
-- SECURITY DEFINER 함수(트리거)만 삽입 가능
CREATE POLICY "Deny direct client inserts on salary_logs"
    ON salary_logs
    FOR INSERT
    WITH CHECK (false);

-- UPDATE/DELETE도 차단 (급여 로그는 변경 불가)
DROP POLICY IF EXISTS "Deny updates on salary_logs" ON salary_logs;
DROP POLICY IF EXISTS "Deny deletes on salary_logs" ON salary_logs;

CREATE POLICY "Deny updates on salary_logs"
    ON salary_logs
    FOR UPDATE
    USING (false);

CREATE POLICY "Deny deletes on salary_logs"
    ON salary_logs
    FOR DELETE
    USING (false);

-- 6. job_assignments 테이블 RLS (클라이언트가 status 업데이트 가능하게)
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;

-- job_assignments에 agent_id 컬럼 추가 (없는 경우)
-- 이 컬럼은 assignment를 소유한 에이전트의 auth.uid()를 저장
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES auth.users(id);

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow agents to update their assignments" ON job_assignments;

-- 에이전트가 자신의 assignment만 업데이트 가능
-- agent_id가 NULL인 경우 모든 인증된 사용자가 업데이트 가능 (하위 호환성)
-- agent_id가 설정된 경우 본인만 업데이트 가능
CREATE POLICY "Allow agents to update their assignments"
    ON job_assignments
    FOR UPDATE
    USING (
        -- agent_id가 NULL이면 인증된 사용자 모두 허용 (개발 단계 호환성)
        -- agent_id가 설정되면 본인만 허용
        agent_id IS NULL OR agent_id = auth.uid()
    )
    WITH CHECK (
        agent_id IS NULL OR agent_id = auth.uid()
    );

COMMENT ON FUNCTION create_salary_log_on_completion() IS 
'job_assignments 완료 시 salary_logs를 자동 생성하는 트리거 함수. 
클라이언트가 직접 salary_logs에 INSERT하는 것을 방지하고 서버에서 데이터 검증 후 생성.';
