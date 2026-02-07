-- Migration: Add missing RLS policies + schedule_runs table
-- 1. Create schedule_runs table (referenced by dashboard but didn't exist)
-- 2. Enable RLS on missing tables: nodes, schedule_runs, device_commands, scrcpy_commands
-- 3. Create service role + public read policies for all new tables

-- ============================================
-- 1. Schedule Runs table
-- ============================================
CREATE TABLE IF NOT EXISTS schedule_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    tasks_created INT DEFAULT 0,
    tasks_completed INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule_id ON schedule_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_started_at ON schedule_runs(started_at DESC);

-- ============================================
-- 2. Enable RLS on missing tables
-- ============================================
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_runs ENABLE ROW LEVEL SECURITY;

-- Only add if tables exist (they may not in all environments)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'device_commands') THEN
        EXECUTE 'ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scrcpy_commands') THEN
        EXECUTE 'ALTER TABLE scrcpy_commands ENABLE ROW LEVEL SECURITY';
    END IF;
END $$;

-- ============================================
-- 3. RLS policies for new tables
-- ============================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'nodes', 'schedule_runs'
    ])
    LOOP
        -- Service role full access
        EXECUTE format(
            'DROP POLICY IF EXISTS "Service role full access on %s" ON %s;
             CREATE POLICY "Service role full access on %s" ON %s FOR ALL USING (auth.role() = ''service_role'');',
            t, t, t, t
        );
        -- Public read
        EXECUTE format(
            'DROP POLICY IF EXISTS "Public read %s" ON %s;
             CREATE POLICY "Public read %s" ON %s FOR SELECT USING (true);',
            t, t, t, t
        );
    END LOOP;
END $$;

-- device_commands and scrcpy_commands (conditional)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'device_commands') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Service role full access on device_commands" ON device_commands';
        EXECUTE 'CREATE POLICY "Service role full access on device_commands" ON device_commands FOR ALL USING (auth.role() = ''service_role'')';
        EXECUTE 'DROP POLICY IF EXISTS "Public read device_commands" ON device_commands';
        EXECUTE 'CREATE POLICY "Public read device_commands" ON device_commands FOR SELECT USING (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scrcpy_commands') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Service role full access on scrcpy_commands" ON scrcpy_commands';
        EXECUTE 'CREATE POLICY "Service role full access on scrcpy_commands" ON scrcpy_commands FOR ALL USING (auth.role() = ''service_role'')';
        EXECUTE 'DROP POLICY IF EXISTS "Public read scrcpy_commands" ON scrcpy_commands';
        EXECUTE 'CREATE POLICY "Public read scrcpy_commands" ON scrcpy_commands FOR SELECT USING (true)';
    END IF;
END $$;
