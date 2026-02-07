-- Migration: Add missing tables and columns identified by dashboard audit
-- 1. nodes table (desktop agent nodes)
-- 2. channels: push_status, push_expires_at
-- 3. devices: monitoring columns
-- 4. videos: priority_enabled, priority_updated_at

-- ============================================
-- 1. Nodes table
-- ============================================
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT DEFAULT 'offline'
        CHECK (status IN ('online', 'offline', 'error')),
    ip_address TEXT,
    connected_at TIMESTAMPTZ,
    total_devices INT DEFAULT 0,
    active_devices INT DEFAULT 0,
    idle_devices INT DEFAULT 0,
    error_devices INT DEFAULT 0,
    tasks_per_minute NUMERIC(6,2) DEFAULT 0,
    cpu_usage NUMERIC(5,2) DEFAULT 0,
    memory_usage NUMERIC(5,2) DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Channels: WebSub push notification columns
-- ============================================
ALTER TABLE channels ADD COLUMN IF NOT EXISTS push_status TEXT DEFAULT 'none'
    CHECK (push_status IN ('active', 'pending', 'expired', 'none'));
ALTER TABLE channels ADD COLUMN IF NOT EXISTS push_expires_at TIMESTAMPTZ;

-- ============================================
-- 3. Devices: monitoring columns (agent heartbeat)
-- ============================================
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_usage NUMERIC(5,2) DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory_used INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory_total INT DEFAULT 4096;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_used INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_total INT DEFAULT 64;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS temperature NUMERIC(4,1) DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_signal INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_charging BOOLEAN DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS uptime_seconds INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_tasks_completed INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_tasks_failed INT DEFAULT 0;

-- ============================================
-- 4. Videos: priority toggle
-- ============================================
ALTER TABLE videos ADD COLUMN IF NOT EXISTS priority_enabled BOOLEAN DEFAULT false;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS priority_updated_at TIMESTAMPTZ;
