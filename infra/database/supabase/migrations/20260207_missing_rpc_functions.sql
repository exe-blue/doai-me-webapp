-- =============================================
-- Missing RPC Functions Migration
-- 2026-02-07
-- 코드에서 .rpc()로 호출하지만 스키마에 없는 함수들
-- =============================================

-- =============================================
-- 1. comments 테이블 (스키마에 누락)
-- =============================================

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_by_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_job_id ON comments(job_id);
CREATE INDEX IF NOT EXISTS idx_comments_unused ON comments(job_id, is_used) WHERE is_used = false;

-- =============================================
-- 2. exec_sql (마이그레이션 유틸리티)
-- =============================================

CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- =============================================
-- 3. get_and_use_comment (원자적 댓글 취득 + 사용 마킹)
-- =============================================

CREATE OR REPLACE FUNCTION get_and_use_comment(
    p_job_id UUID,
    p_device_id UUID
)
RETURNS TABLE (
    comment_id UUID,
    comment_content TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_comment_id UUID;
    v_content TEXT;
BEGIN
    -- 미사용 댓글 하나를 원자적으로 선택 + 잠금
    SELECT c.id, c.content
    INTO v_comment_id, v_content
    FROM comments c
    WHERE c.job_id = p_job_id
      AND c.is_used = false
    ORDER BY c.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_comment_id IS NULL THEN
        RETURN;
    END IF;

    -- 사용 처리
    UPDATE comments
    SET is_used = true,
        used_by_device_id = p_device_id,
        used_at = NOW(),
        updated_at = NOW()
    WHERE id = v_comment_id;

    comment_id := v_comment_id;
    comment_content := v_content;
    RETURN NEXT;
END;
$$;

-- =============================================
-- 4. get_device_by_management_code
-- =============================================

CREATE OR REPLACE FUNCTION get_device_by_management_code(p_code TEXT)
RETURNS TABLE (
    id UUID,
    pc_id UUID,
    pc_number TEXT,
    device_number INT,
    management_code TEXT,
    serial_number TEXT,
    ip_address TEXT,
    model TEXT,
    state TEXT,
    battery INT,
    connection_type TEXT,
    usb_port INT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.pc_id,
        p.pc_number,
        d.device_number,
        d.management_code,
        d.serial_number,
        d.ip_address,
        d.model,
        d.state,
        d.battery,
        d.connection_type,
        d.usb_port,
        d.created_at
    FROM devices d
    LEFT JOIN pcs p ON p.id = d.pc_id
    WHERE d.management_code = UPPER(p_code);
END;
$$;

-- =============================================
-- 5. get_node_device_summary
-- =============================================

CREATE OR REPLACE FUNCTION get_node_device_summary(p_node_id TEXT DEFAULT NULL)
RETURNS TABLE (
    node_id UUID,
    node_name TEXT,
    node_status TEXT,
    total_devices BIGINT,
    idle_devices BIGINT,
    running_devices BIGINT,
    error_devices BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        n.id AS node_id,
        n.name AS node_name,
        n.status AS node_status,
        COUNT(d.id) AS total_devices,
        COUNT(*) FILTER (WHERE d.state IN ('IDLE', 'idle')) AS idle_devices,
        COUNT(*) FILTER (WHERE d.state IN ('RUNNING', 'running')) AS running_devices,
        COUNT(*) FILTER (WHERE d.state IN ('ERROR', 'QUARANTINE', 'error')) AS error_devices
    FROM nodes n
    LEFT JOIN devices d ON d.node_id = n.id
    WHERE p_node_id IS NULL OR n.id = p_node_id
    GROUP BY n.id, n.name, n.status
    ORDER BY n.name;
$$;

-- =============================================
-- 6. increment_device_error_count
-- =============================================

CREATE OR REPLACE FUNCTION increment_device_error_count(device_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE devices
    SET error_count = error_count + 1,
        updated_at = NOW()
    WHERE id = device_id;
END;
$$;

-- =============================================
-- 7. update_device_status_with_error
-- =============================================

CREATE OR REPLACE FUNCTION update_device_status_with_error(
    p_device_id UUID,
    p_last_error TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE devices
    SET error_count = error_count + 1,
        last_error = p_last_error,
        last_error_at = NOW(),
        state = 'ERROR',
        updated_at = NOW()
    WHERE id = p_device_id;
END;
$$;

-- =============================================
-- 8. increment_execution_device_count
-- =============================================

CREATE OR REPLACE FUNCTION increment_execution_device_count(
    exec_id UUID,
    count_type TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF count_type = 'completed' THEN
        UPDATE workflow_executions
        SET completed_devices = completed_devices + 1,
            status = CASE
                WHEN (completed_devices + 1 + failed_devices) >= total_devices THEN 'completed'
                ELSE status
            END,
            completed_at = CASE
                WHEN (completed_devices + 1 + failed_devices) >= total_devices THEN NOW()
                ELSE completed_at
            END,
            updated_at = NOW()
        WHERE id = exec_id;
    ELSIF count_type = 'failed' THEN
        UPDATE workflow_executions
        SET failed_devices = failed_devices + 1,
            status = CASE
                WHEN (completed_devices + failed_devices + 1) >= total_devices THEN 'completed'
                ELSE status
            END,
            completed_at = CASE
                WHEN (completed_devices + failed_devices + 1) >= total_devices THEN NOW()
                ELSE completed_at
            END,
            updated_at = NOW()
        WHERE id = exec_id;
    END IF;
END;
$$;

-- =============================================
-- 9. increment_recovery_attempts
-- =============================================

CREATE OR REPLACE FUNCTION increment_recovery_attempts(ids UUID[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE device_issues
    SET recovery_attempts = recovery_attempts + 1,
        updated_at = NOW()
    WHERE id = ANY(ids);
END;
$$;

-- =============================================
-- 10. increment_workflow_version
-- =============================================

CREATE OR REPLACE FUNCTION increment_workflow_version(workflow_id TEXT)
RETURNS TABLE(version INT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE workflows
    SET version = workflows.version + 1,
        updated_at = NOW()
    WHERE id = workflow_id
    RETURNING workflows.version;
END;
$$;

-- =============================================
-- 11. batch_retry_issues
-- =============================================

CREATE OR REPLACE FUNCTION batch_retry_issues(p_issue_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE device_issues
    SET status = 'in_progress',
        recovery_attempts = recovery_attempts + 1,
        updated_at = NOW()
    WHERE id = ANY(p_issue_ids)
      AND auto_recoverable = true;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;
