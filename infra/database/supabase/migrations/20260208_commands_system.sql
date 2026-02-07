-- =============================================
-- 원격 명령 시스템 마이그레이션
-- 노드/디바이스에 대한 원격 명령 전송 및 추적
-- Date: 2026-02-08
-- =============================================

-- =============================================
-- 1. commands 테이블 생성
-- 원격 명령의 생성, 상태 추적, 결과 저장
-- =============================================

CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reboot', 'shell', 'install', 'screenshot', 'ping')),
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT')),
  result JSONB,
  error TEXT,
  claimed_by TEXT,
  timeout_ms INT DEFAULT 30000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- =============================================
-- 2. command_events 테이블 생성
-- 명령 실행 과정의 이벤트 로그 (stdout, stderr 등)
-- =============================================

CREATE TABLE IF NOT EXISTS command_events (
  id BIGSERIAL PRIMARY KEY,
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('CREATED', 'CLAIMED', 'STARTED', 'STDOUT', 'STDERR', 'SUCCEEDED', 'FAILED', 'TIMEOUT')),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. 인덱스 생성
-- 명령 조회 성능 최적화
-- =============================================

CREATE INDEX idx_commands_node_status ON commands(node_id, status);
CREATE INDEX idx_commands_device ON commands(device_id);
CREATE INDEX idx_commands_created ON commands(created_at DESC);
CREATE INDEX idx_command_events_command ON command_events(command_id, created_at);

-- =============================================
-- 4. claim_command RPC 함수 생성
-- 목적: Race condition 방지하여 동일 명령을 여러 노드가 가져가는 문제 해결
-- 패턴: claim_job과 동일한 FOR UPDATE SKIP LOCKED 사용
-- =============================================

CREATE OR REPLACE FUNCTION claim_command(
  p_node_id TEXT,
  p_device_id TEXT
)
RETURNS TABLE(
  id UUID,
  type TEXT,
  payload JSONB,
  timeout_ms INT
) AS $$
DECLARE
  v_id UUID;
  v_type TEXT;
  v_payload JSONB;
  v_timeout_ms INT;
BEGIN
  -- Atomic update: PENDING 상태의 첫 번째 명령을 CLAIMED로 변경
  -- FOR UPDATE SKIP LOCKED로 동시성 제어
  UPDATE commands c
  SET
    status = 'CLAIMED',
    claimed_by = p_node_id,
    claimed_at = NOW()
  WHERE c.id = (
    SELECT c2.id
    FROM commands c2
    WHERE c2.status = 'PENDING'
      AND c2.node_id = p_node_id
      AND c2.device_id = p_device_id
    ORDER BY c2.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING c.id, c.type, c.payload, c.timeout_ms
  INTO v_id, v_type, v_payload, v_timeout_ms;

  -- 명령이 할당되지 않은 경우 (PENDING 명령 없음)
  IF v_id IS NULL THEN
    RETURN; -- 빈 결과 반환
  END IF;

  -- 명령 할당 이벤트 기록
  INSERT INTO command_events (command_id, type, payload)
  VALUES (v_id, 'CLAIMED', jsonb_build_object('node_id', p_node_id));

  -- 결과 반환
  id := v_id;
  type := v_type;
  payload := v_payload;
  timeout_ms := v_timeout_ms;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 함수 설명 추가
COMMENT ON FUNCTION claim_command(TEXT, TEXT) IS
'Atomically claims a pending command for a specific node and device. Uses FOR UPDATE SKIP LOCKED for concurrency control.';

-- =============================================
-- 5. RLS (Row Level Security) 정책 설정
-- service_role: 전체 접근 (RLS 우회)
-- public: 읽기 전용
-- =============================================

ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_events ENABLE ROW LEVEL SECURITY;

-- commands 테이블 정책
CREATE POLICY "Allow public select on commands" ON commands
  FOR SELECT USING (true);
CREATE POLICY "Allow service_role all on commands" ON commands
  FOR ALL USING (true) WITH CHECK (true);

-- command_events 테이블 정책
CREATE POLICY "Allow public select on command_events" ON command_events
  FOR SELECT USING (true);
CREATE POLICY "Allow service_role all on command_events" ON command_events
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 6. Realtime 구독 활성화
-- 명령 상태 변경 및 이벤트를 실시간으로 클라이언트에 전달
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE commands;
ALTER PUBLICATION supabase_realtime ADD TABLE command_events;

-- =============================================
-- 테스트 쿼리 (개발용)
-- =============================================
-- 명령 생성:
-- INSERT INTO commands (node_id, device_id, type, payload)
-- VALUES ('NODE-01', 'DEVICE-001', 'shell', '{"cmd": "ls -la"}');
--
-- 명령 클레임:
-- SELECT * FROM claim_command('NODE-01', 'DEVICE-001');
--
-- 예상 결과:
-- id      | type    | payload            | timeout_ms
-- --------|---------|--------------------|-----------
-- (UUID)  | "shell" | {"cmd": "ls -la"}  | 30000
--
-- 명령이 없는 경우:
-- (빈 테이블)
