-- ============================================
-- Migration: 20260206_celery_tasks
-- Description: Celery 작업 이력 관리 테이블
-- ============================================

-- ============================================
-- Task 상태 ENUM
-- ============================================
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'pending',    -- 대기 중
        'running',    -- 실행 중
        'success',    -- 성공
        'failed',     -- 실패
        'retrying',   -- 재시도 중
        'cancelled'   -- 취소됨
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Tasks 테이블 (Celery 작업 이력)
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Celery task 식별자
    celery_task_id VARCHAR(255) UNIQUE,  -- Celery에서 생성한 task ID
    
    -- 작업 정보
    task_name VARCHAR(100) NOT NULL,  -- install_apk, health_check, run_youtube_bot 등
    queue_name VARCHAR(50),           -- pc01, pc02, ... (라우팅된 큐)
    
    -- 대상 정보
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL,
    
    -- 상태
    status task_status NOT NULL DEFAULT 'pending',
    
    -- 작업 데이터
    payload JSONB DEFAULT '{}',       -- 입력 파라미터
    result JSONB DEFAULT '{}',        -- 실행 결과
    error TEXT,                       -- 에러 메시지
    error_traceback TEXT,             -- 에러 스택 트레이스
    
    -- 재시도 정보
    retries INT DEFAULT 0,            -- 현재 재시도 횟수
    max_retries INT DEFAULT 3,        -- 최대 재시도 횟수
    
    -- 진행률 (옵션)
    progress INT DEFAULT 0,           -- 0~100
    progress_message TEXT,            -- 진행 상태 메시지
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- 실행 시간 (초)
    duration_seconds DECIMAL(10, 2),
    
    -- 메타데이터
    meta JSONB DEFAULT '{}',          -- 추가 정보 (예: worker 정보)
    
    -- 제약조건
    CONSTRAINT progress_range CHECK (progress BETWEEN 0 AND 100)
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_celery_task_id ON tasks(celery_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_name ON tasks(task_name);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_device_id ON tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_tasks_pc_id ON tasks(pc_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_name ON tasks(queue_name);

-- 복합 인덱스: 디바이스별 최근 작업 조회
CREATE INDEX IF NOT EXISTS idx_tasks_device_recent 
    ON tasks(device_id, created_at DESC) WHERE device_id IS NOT NULL;

-- 복합 인덱스: PC별 최근 작업 조회
CREATE INDEX IF NOT EXISTS idx_tasks_pc_recent 
    ON tasks(pc_id, created_at DESC) WHERE pc_id IS NOT NULL;

-- ============================================
-- 트리거: updated_at 자동 갱신 (duration 계산 포함)
-- ============================================
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- 완료 시 duration 계산
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated ON tasks;
CREATE TRIGGER tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_task_timestamp();

-- ============================================
-- 뷰: 최근 작업 현황
-- ============================================
CREATE OR REPLACE VIEW recent_tasks AS
SELECT 
    t.id,
    t.celery_task_id,
    t.task_name,
    t.queue_name,
    t.status,
    t.progress,
    t.progress_message,
    t.retries,
    t.error,
    t.created_at,
    t.started_at,
    t.completed_at,
    t.duration_seconds,
    d.serial_number as device_serial,
    get_management_code(d.pc_id, d.device_number) as device_code,
    p.pc_number
FROM tasks t
LEFT JOIN devices d ON t.device_id = d.id
LEFT JOIN pcs p ON t.pc_id = p.id
ORDER BY t.created_at DESC;

-- ============================================
-- 뷰: 작업 통계
-- ============================================
CREATE OR REPLACE VIEW task_stats AS
SELECT 
    task_name,
    queue_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE status = 'running') as running_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration,
    MAX(created_at) as last_task_at
FROM tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY task_name, queue_name
ORDER BY task_name, queue_name;

-- ============================================
-- 함수: 작업 생성 (Celery 연동용)
-- ============================================
CREATE OR REPLACE FUNCTION create_task(
    p_task_name VARCHAR,
    p_celery_task_id VARCHAR DEFAULT NULL,
    p_device_id UUID DEFAULT NULL,
    p_pc_id UUID DEFAULT NULL,
    p_queue_name VARCHAR DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_task_id UUID;
BEGIN
    INSERT INTO tasks (
        task_name, celery_task_id, device_id, pc_id, queue_name, payload, status
    ) VALUES (
        p_task_name, p_celery_task_id, p_device_id, p_pc_id, p_queue_name, p_payload, 'pending'
    ) RETURNING id INTO v_task_id;
    
    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 함수: 작업 상태 업데이트
-- ============================================
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id UUID,
    p_status task_status,
    p_result JSONB DEFAULT NULL,
    p_error TEXT DEFAULT NULL,
    p_progress INT DEFAULT NULL,
    p_progress_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE tasks SET
        status = p_status,
        result = COALESCE(p_result, result),
        error = COALESCE(p_error, error),
        progress = COALESCE(p_progress, progress),
        progress_message = COALESCE(p_progress_message, progress_message),
        started_at = CASE 
            WHEN p_status = 'running' AND started_at IS NULL THEN NOW()
            ELSE started_at
        END,
        completed_at = CASE 
            WHEN p_status IN ('success', 'failed', 'cancelled') THEN NOW()
            ELSE completed_at
        END
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 함수: 재시도 카운트 증가
-- ============================================
CREATE OR REPLACE FUNCTION increment_task_retry(
    p_task_id UUID
)
RETURNS INT AS $$
DECLARE
    v_retries INT;
BEGIN
    UPDATE tasks SET
        retries = retries + 1,
        status = 'retrying'
    WHERE id = p_task_id
    RETURNING retries INTO v_retries;
    
    RETURN v_retries;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 함수: 오래된 작업 정리 (30일 이상)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_tasks(
    p_days INT DEFAULT 30
)
RETURNS INT AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM tasks
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL
      AND status IN ('success', 'failed', 'cancelled');
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 권한 설정
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
GRANT SELECT ON recent_tasks TO authenticated;
GRANT SELECT ON task_stats TO authenticated;
GRANT EXECUTE ON FUNCTION create_task(VARCHAR, VARCHAR, UUID, UUID, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_task_status(UUID, task_status, JSONB, TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_task_retry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_tasks(INT) TO authenticated;

-- ============================================
-- 테스트 데이터 (주석 처리)
-- ============================================
/*
INSERT INTO tasks (task_name, queue_name, status, payload) VALUES
('health_check', 'pc01', 'success', '{"check_battery": true}'::jsonb),
('install_apk', 'pc01', 'running', '{"apk_name": "autox.js.apk"}'::jsonb);
*/
