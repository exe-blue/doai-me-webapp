-- =============================================
-- Migration 001: Scrcpy Remote Trigger + Smart Heartbeat
-- Created: 2026-01-29
-- =============================================

-- =============================================
-- PART 1: devices 테이블 확장 (DB-01)
-- =============================================

-- 1.1 새 컬럼 추가
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_job_activity_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS adb_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'offline';

-- 1.2 health_status CHECK 제약조건
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_health_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_health_status_check
  CHECK (health_status IN ('healthy', 'zombie', 'offline'));

-- 1.3 기존 데이터 마이그레이션 (모두 offline으로 초기화)
UPDATE devices
SET health_status = 'offline',
    adb_connected = FALSE,
    consecutive_failures = 0
WHERE health_status IS NULL;

-- =============================================
-- PART 2: scrcpy_commands 테이블 생성 (DB-02)
-- =============================================

-- 2.1 테이블 생성
CREATE TABLE IF NOT EXISTS scrcpy_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  pc_id VARCHAR(50) NOT NULL,
  command_type VARCHAR(20) NOT NULL CHECK (command_type IN ('scrcpy_start', 'scrcpy_stop')),
  options JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT scrcpy_commands_status_check CHECK (status IN ('pending', 'received', 'executing', 'completed', 'failed', 'timeout')),
  process_pid INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 2.2 RLS 활성화
ALTER TABLE scrcpy_commands ENABLE ROW LEVEL SECURITY;

-- 2.3 RLS 정책
-- ⚠️ 프로덕션 환경에서는 SERVICE_ROLE 키를 사용하여 백엔드에서만 접근
-- 아래 정책은 인증된 사용자만 접근 가능하도록 제한
DROP POLICY IF EXISTS "Allow all for scrcpy_commands" ON scrcpy_commands;

-- 읽기: 인증된 사용자만 조회 가능
CREATE POLICY "Allow authenticated read for scrcpy_commands" ON scrcpy_commands
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 삽입: 인증된 사용자만 생성 가능
CREATE POLICY "Allow authenticated insert for scrcpy_commands" ON scrcpy_commands
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 업데이트: service_role만 가능 (PC Worker용)
CREATE POLICY "Allow service role update for scrcpy_commands" ON scrcpy_commands
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 삭제: service_role만 가능
CREATE POLICY "Allow service role delete for scrcpy_commands" ON scrcpy_commands
  FOR DELETE
  USING (auth.role() = 'service_role');

-- =============================================
-- PART 3: Realtime + 인덱스 설정 (DB-03)
-- =============================================

-- 3.1 Realtime Publication
-- IF NOT EXISTS는 지원되지 않으므로 DO 블록으로 조건부 실행
DO $$
BEGIN
  -- scrcpy_commands가 이미 publication에 있는지 확인
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_rel pr
    JOIN pg_catalog.pg_class c ON c.oid = pr.prrelid
    JOIN pg_catalog.pg_publication p ON p.oid = pr.prpubid
    WHERE c.relname = 'scrcpy_commands' AND p.pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scrcpy_commands;
  END IF;
END $$;

-- 3.2 scrcpy_commands 인덱스
CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_pending
  ON scrcpy_commands(pc_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_device
  ON scrcpy_commands(device_id);

CREATE INDEX IF NOT EXISTS idx_scrcpy_commands_created
  ON scrcpy_commands(created_at DESC);

-- 3.3 devices 인덱스 (health monitoring용)
CREATE INDEX IF NOT EXISTS idx_devices_health
  ON devices(pc_id, health_status);

CREATE INDEX IF NOT EXISTS idx_devices_heartbeat
  ON devices(last_heartbeat_at DESC NULLS LAST);

-- =============================================
-- 마이그레이션 완료 확인
-- =============================================
-- 다음 쿼리로 마이그레이션 결과 확인:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'devices';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scrcpy_commands';
