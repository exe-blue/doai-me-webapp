-- Migration: Add device_commands and scrcpy_commands tables
-- These tables are used by the dashboard API for device command queueing

-- Device Commands (reboot, clear_cache, etc.)
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    command_type TEXT NOT NULL
        CHECK (command_type IN ('reboot', 'clear_cache', 'kill_app', 'screenshot', 'enable', 'disable')),
    options JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Scrcpy Commands (screen control, streaming)
CREATE TABLE IF NOT EXISTS scrcpy_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    pc_id TEXT,
    command_type TEXT NOT NULL
        CHECK (command_type IN ('input', 'screenshot', 'scrcpy_start', 'scrcpy_stop', 'stream_start', 'stream_stop', 'frame')),
    command_data JSONB DEFAULT '{}',
    options JSONB DEFAULT '{}',
    result_data JSONB,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_commands_device ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON device_commands(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_device ON scrcpy_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_status ON scrcpy_commands(status);
CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_type ON scrcpy_commands(command_type);
CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_created ON scrcpy_commands(created_at DESC);

-- RLS
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrcpy_commands ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['device_commands', 'scrcpy_commands'])
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "Service role full access on %s" ON %s;
             CREATE POLICY "Service role full access on %s" ON %s FOR ALL USING (auth.role() = ''service_role'');',
            t, t, t, t
        );
        EXECUTE format(
            'DROP POLICY IF EXISTS "Public read %s" ON %s;
             CREATE POLICY "Public read %s" ON %s FOR SELECT USING (true);',
            t, t, t, t
        );
    END LOOP;
END $$;

-- Realtime
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_commands;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE scrcpy_commands;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE device_commands IS '디바이스 명령 큐 (reboot, clear_cache 등)';
COMMENT ON TABLE scrcpy_commands IS '스크린 제어 명령 (scrcpy, screenshot, stream)';
