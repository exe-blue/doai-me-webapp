-- ============================================
-- DoAi.Me 스키마 정렬 마이그레이션
-- Version: 20260206
-- Date: 2026-02-06
-- Purpose: API와 DB 스키마 정렬, 누락 테이블 추가
-- ============================================

-- ============================================
-- 1. system_logs 테이블 (시스템 로그)
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
  source TEXT NOT NULL CHECK (source IN ('api', 'worker', 'device', 'database', 'network', 'scheduler')),
  component TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  stack_trace TEXT,
  node_id TEXT,
  device_id TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_logs_node ON system_logs(node_id) WHERE node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_device ON system_logs(device_id) WHERE device_id IS NOT NULL;

-- RLS 활성화
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Service role 전체 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_logs' AND policyname = 'Service role full access on system_logs') THEN
    CREATE POLICY "Service role full access on system_logs" ON system_logs FOR ALL USING (true);
  END IF;
END $$;

-- ============================================
-- 2. device_issues 테이블 (디바이스 이슈)
-- ============================================
CREATE TABLE IF NOT EXISTS device_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'app_crash', 'network_error', 'adb_disconnect', 'low_battery',
    'high_temperature', 'memory_full', 'screen_freeze', 'unknown'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  auto_recoverable BOOLEAN DEFAULT false,
  recovery_attempts INT DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_device_issues_device ON device_issues(device_id);
CREATE INDEX IF NOT EXISTS idx_device_issues_status ON device_issues(status);
CREATE INDEX IF NOT EXISTS idx_device_issues_severity ON device_issues(severity);
CREATE INDEX IF NOT EXISTS idx_device_issues_type ON device_issues(type);
CREATE INDEX IF NOT EXISTS idx_device_issues_created ON device_issues(created_at DESC);

-- updated_at 트리거
DROP TRIGGER IF EXISTS update_device_issues_updated_at ON device_issues;
CREATE TRIGGER update_device_issues_updated_at
  BEFORE UPDATE ON device_issues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS 활성화
ALTER TABLE device_issues ENABLE ROW LEVEL SECURITY;

-- Service role 전체 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'device_issues' AND policyname = 'Service role full access on device_issues') THEN
    CREATE POLICY "Service role full access on device_issues" ON device_issues FOR ALL USING (true);
  END IF;
END $$;

-- ============================================
-- 3. daily_stats 테이블 보완 (리포트용)
-- ============================================
-- daily_stats 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS daily_stats (
  date DATE PRIMARY KEY,
  total_executions INT DEFAULT 0,
  total_completed INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  total_cancelled INT DEFAULT 0,
  success_rate DECIMAL(5,2),
  total_watch_time_sec BIGINT DEFAULT 0,
  avg_watch_time_sec DECIMAL(10,2),
  unique_videos INT DEFAULT 0,
  active_devices INT DEFAULT 0,
  by_hour JSONB DEFAULT '{}',
  by_node JSONB DEFAULT '{}',
  by_video JSONB DEFAULT '{}',
  by_status JSONB DEFAULT '{}',
  error_breakdown JSONB DEFAULT '{}',
  peak_hour INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_stats' AND policyname = 'Service role full access on daily_stats') THEN
    CREATE POLICY "Service role full access on daily_stats" ON daily_stats FOR ALL USING (true);
  END IF;
END $$;

-- ============================================
-- 4. Realtime 활성화
-- ============================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE system_logs;
  ALTER PUBLICATION supabase_realtime ADD TABLE device_issues;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================
-- 5. 테이블 코멘트
-- ============================================
COMMENT ON TABLE system_logs IS '시스템 로그 (API, Worker, Device 등)';
COMMENT ON TABLE device_issues IS '디바이스 이슈 추적';
COMMENT ON TABLE daily_stats IS '일일 통계 집계';

-- ============================================
-- 완료
-- ============================================
