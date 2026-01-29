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

-- 2.3 RLS 정책 (역할 기반 접근 제어)
-- =============================================
-- 역할 정의:
--   - dashboard: 대시보드 사용자 (명령 생성)
--   - pc_worker: PC Worker (명령 수신 및 실행)
--   - admin: 관리자 (전체 권한)
--   - service_role: 백엔드 서비스 (전체 권한)
-- =============================================

-- 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow all for scrcpy_commands" ON scrcpy_commands;
DROP POLICY IF EXISTS "Allow authenticated read for scrcpy_commands" ON scrcpy_commands;
DROP POLICY IF EXISTS "Allow authenticated insert for scrcpy_commands" ON scrcpy_commands;
DROP POLICY IF EXISTS "Allow service role update for scrcpy_commands" ON scrcpy_commands;
DROP POLICY IF EXISTS "Allow service role delete for scrcpy_commands" ON scrcpy_commands;

-- 2.3.1 Dashboard INSERT 정책
-- Dashboard 사용자는 자신의 요청으로 명령을 생성할 수 있음
-- 참고: created_by 컬럼이 있으면 NEW.created_by = auth.uid() 검증 추가 권장
CREATE POLICY "Dashboard insert commands" ON scrcpy_commands
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'dashboard'
    OR (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- 2.3.2 PC Worker SELECT 정책
-- PC Worker는 자신에게 할당된 pending/received 상태의 명령만 조회 가능
CREATE POLICY "PC worker read pending assigned" ON scrcpy_commands
  FOR SELECT
  USING (
    (
      (auth.jwt() ->> 'role') = 'pc_worker'
      AND pc_id = (auth.jwt() ->> 'pc_id')  -- 자신의 PC에 할당된 명령만
      AND status IN ('pending', 'received', 'executing')  -- 처리 가능한 상태만
    )
    OR (auth.jwt() ->> 'role') = 'dashboard'  -- Dashboard는 모든 명령 조회 가능
    OR (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- 2.3.3 PC Worker UPDATE 정책  
-- PC Worker는 자신에게 할당된 pending/received/executing 상태의 명령만 업데이트 가능
CREATE POLICY "PC worker update assigned" ON scrcpy_commands
  FOR UPDATE
  USING (
    (
      (auth.jwt() ->> 'role') = 'pc_worker'
      AND pc_id = (auth.jwt() ->> 'pc_id')  -- 자신의 PC에 할당된 명령만
      AND status IN ('pending', 'received', 'executing')  -- 처리 중인 상태만
    )
    OR (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'role') = 'pc_worker'
      AND pc_id = (auth.jwt() ->> 'pc_id')
      -- 허용된 상태 전이만 가능
      AND status IN ('received', 'executing', 'completed', 'failed', 'timeout')
    )
    OR (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- 2.3.4 Admin 전체 접근 정책
-- 관리자는 모든 작업 가능 (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admin full access" ON scrcpy_commands
  FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- 2.3.5 Dashboard SELECT 정책 (명령 상태 모니터링용)
CREATE POLICY "Dashboard read all commands" ON scrcpy_commands
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'dashboard'
  );

-- 2.3.6 Dashboard DELETE 정책 (취소된 명령 정리용)
-- Dashboard는 pending 상태의 명령만 삭제 가능
CREATE POLICY "Dashboard delete pending commands" ON scrcpy_commands
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') = 'dashboard'
    AND status = 'pending'
  );

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
