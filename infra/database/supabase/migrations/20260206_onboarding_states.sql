-- =============================================
-- Migration: 20260206_onboarding_states
-- Purpose: Create device_onboarding_states table for tracking onboarding progress
-- Author: Cursor Agent
-- Date: 2026-02-06
-- =============================================

-- =============================================
-- 1. Create onboarding status enum type
-- =============================================

DO $$ BEGIN
    CREATE TYPE onboarding_status AS ENUM ('not_started', 'in_progress', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 2. Create device_onboarding_states table
-- =============================================

CREATE TABLE IF NOT EXISTS device_onboarding_states (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    node_id TEXT NOT NULL,
    status onboarding_status NOT NULL DEFAULT 'not_started',
    current_step TEXT,
    completed_steps TEXT[] DEFAULT '{}',
    error_message TEXT,
    config JSONB DEFAULT '{}',
    step_results JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. Create indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_onboarding_device_id 
ON device_onboarding_states(device_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_node_id 
ON device_onboarding_states(node_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_status 
ON device_onboarding_states(status);

CREATE INDEX IF NOT EXISTS idx_onboarding_created_at 
ON device_onboarding_states(created_at DESC);

-- =============================================
-- 4. Add column comments
-- =============================================

COMMENT ON TABLE device_onboarding_states IS 'Tracks device onboarding progress and state';
COMMENT ON COLUMN device_onboarding_states.device_id IS 'Device serial number or ADB ID';
COMMENT ON COLUMN device_onboarding_states.node_id IS 'Node/PC identifier (e.g., PC00, PC01)';
COMMENT ON COLUMN device_onboarding_states.status IS 'Current onboarding status';
COMMENT ON COLUMN device_onboarding_states.current_step IS 'Currently executing step (hardware, standardize, naming, accessibility, security, apps, network, account, ready)';
COMMENT ON COLUMN device_onboarding_states.completed_steps IS 'Array of completed step names';
COMMENT ON COLUMN device_onboarding_states.error_message IS 'Error message if status is failed';
COMMENT ON COLUMN device_onboarding_states.config IS 'Onboarding configuration used for this device';
COMMENT ON COLUMN device_onboarding_states.step_results IS 'Results from each completed step';
COMMENT ON COLUMN device_onboarding_states.started_at IS 'When onboarding started';
COMMENT ON COLUMN device_onboarding_states.completed_at IS 'When onboarding completed or failed';

-- =============================================
-- 5. Create updated_at trigger
-- =============================================

CREATE OR REPLACE FUNCTION update_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON device_onboarding_states;
CREATE TRIGGER trg_onboarding_updated_at
    BEFORE UPDATE ON device_onboarding_states
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_updated_at();

-- =============================================
-- 6. Row Level Security (RLS)
-- =============================================

ALTER TABLE device_onboarding_states ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (service role bypasses RLS)
CREATE POLICY "Allow all for authenticated users" ON device_onboarding_states
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Allow read for anon (public dashboard access)
CREATE POLICY "Allow read for anon" ON device_onboarding_states
    FOR SELECT
    TO anon
    USING (true);

-- =============================================
-- 7. Helper functions
-- =============================================

-- Function to upsert onboarding state
CREATE OR REPLACE FUNCTION upsert_onboarding_state(
    p_device_id TEXT,
    p_node_id TEXT,
    p_status onboarding_status DEFAULT 'not_started',
    p_current_step TEXT DEFAULT NULL,
    p_completed_steps TEXT[] DEFAULT '{}',
    p_error_message TEXT DEFAULT NULL,
    p_config JSONB DEFAULT '{}',
    p_step_results JSONB DEFAULT '{}'
)
RETURNS device_onboarding_states AS $$
DECLARE
    result device_onboarding_states;
BEGIN
    INSERT INTO device_onboarding_states (
        device_id, node_id, status, current_step, 
        completed_steps, error_message, config, step_results,
        started_at
    )
    VALUES (
        p_device_id, p_node_id, p_status, p_current_step,
        p_completed_steps, p_error_message, p_config, p_step_results,
        CASE WHEN p_status = 'in_progress' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (device_id) 
    DO UPDATE SET
        node_id = EXCLUDED.node_id,
        status = EXCLUDED.status,
        current_step = EXCLUDED.current_step,
        completed_steps = EXCLUDED.completed_steps,
        error_message = EXCLUDED.error_message,
        config = COALESCE(EXCLUDED.config, device_onboarding_states.config),
        step_results = COALESCE(EXCLUDED.step_results, device_onboarding_states.step_results),
        started_at = CASE 
            WHEN EXCLUDED.status = 'in_progress' AND device_onboarding_states.started_at IS NULL 
            THEN NOW() 
            ELSE device_onboarding_states.started_at 
        END,
        completed_at = CASE 
            WHEN EXCLUDED.status IN ('completed', 'failed') 
            THEN NOW() 
            ELSE NULL 
        END
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get onboarding summary
CREATE OR REPLACE FUNCTION get_onboarding_summary(p_node_id TEXT DEFAULT NULL)
RETURNS TABLE (
    total BIGINT,
    not_started BIGINT,
    in_progress BIGINT,
    completed BIGINT,
    failed BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total,
        COUNT(*) FILTER (WHERE status = 'not_started')::BIGINT as not_started,
        COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed
    FROM device_onboarding_states
    WHERE p_node_id IS NULL OR node_id = p_node_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- 8. Sample query for verification
-- =============================================

-- Verify table structure
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'device_onboarding_states'
ORDER BY ordinal_position;

-- =============================================
-- Migration Notes
-- =============================================

-- This migration is IDEMPOTENT - safe to run multiple times
-- - Uses IF NOT EXISTS for table and indexes
-- - Uses CREATE OR REPLACE for functions
-- - Uses DROP TRIGGER IF EXISTS before CREATE TRIGGER

-- Rollback (if needed):
/*
DROP FUNCTION IF EXISTS get_onboarding_summary(TEXT);
DROP FUNCTION IF EXISTS upsert_onboarding_state(TEXT, TEXT, onboarding_status, TEXT, TEXT[], TEXT, JSONB, JSONB);
DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON device_onboarding_states;
DROP FUNCTION IF EXISTS update_onboarding_updated_at();
DROP TABLE IF EXISTS device_onboarding_states;
DROP TYPE IF EXISTS onboarding_status;
*/

-- =============================================
-- End of Migration
-- =============================================
