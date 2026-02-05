-- =============================================
-- DoAi.Me Initial Schema
-- 모니터링 시스템 기본 테이블 구조
-- =============================================

-- ============================================
-- 0. 유틸리티 함수
-- ============================================

-- updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 별칭 함수 (다른 마이그레이션과 호환)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. 테이블 생성
-- ============================================

-- 노드 (PC) - 디바이스를 관리하는 PC 클라이언트
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,                              -- 노드 ID (예: node_001)
  name TEXT,                                         -- 표시 이름
  status TEXT DEFAULT 'offline' 
    CHECK (status IN ('online', 'offline', 'error')),
  ip_address TEXT,                                   -- IP 주소
  device_capacity INT DEFAULT 100,                   -- 최대 연결 가능 디바이스 수
  cpu_usage DECIMAL(5,2),                            -- CPU 사용률 (%)
  memory_usage DECIMAL(5,2),                         -- 메모리 사용률 (%)
  connected_devices INT DEFAULT 0,                   -- 현재 연결된 디바이스 수
  last_seen TIMESTAMPTZ,                             -- 마지막 하트비트
  metadata JSONB DEFAULT '{}',                       -- 추가 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 디바이스 (스마트폰) - 작업을 실행하는 안드로이드 디바이스
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,                              -- 시리얼 번호
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  serial_number TEXT,                               -- ADB 시리얼 번호
  name TEXT,                                         -- 표시 이름
  state TEXT DEFAULT 'DISCONNECTED' 
    CHECK (state IN ('DISCONNECTED', 'IDLE', 'QUEUED', 'RUNNING', 'ERROR', 'QUARANTINE')),
  model TEXT,                                        -- 디바이스 모델
  android_version TEXT,                              -- 안드로이드 버전
  battery INT CHECK (battery >= 0 AND battery <= 100),
  ip_address TEXT,                                   -- 디바이스 IP
  error_count INT DEFAULT 0,                         -- 연속 에러 횟수
  last_error TEXT,                                   -- 마지막 에러 메시지
  last_workflow_id TEXT,                             -- 마지막 실행 워크플로우
  last_seen TIMESTAMPTZ,                             -- 마지막 상태 업데이트
  metadata JSONB DEFAULT '{}',                       -- 추가 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 디바이스 상태 (실시간 상태 추적용)
CREATE TABLE IF NOT EXISTS device_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  state TEXT DEFAULT 'DISCONNECTED'
    CHECK (state IN ('DISCONNECTED', 'IDLE', 'QUEUED', 'RUNNING', 'ERROR', 'QUARANTINE')),
  current_workflow_id TEXT,
  current_step TEXT,
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  battery INT,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- Note: PRIMARY KEY on (id) already ensures uniqueness; removed redundant UNIQUE(device_id)
  -- as device_id uniqueness is enforced through application logic (upsert pattern)
);

-- 워크플로우 정의
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,                              -- 워크플로우 ID (예: youtube_watch)
  name TEXT NOT NULL,                               -- 표시 이름
  description TEXT,                                  -- 설명
  category TEXT,                                     -- 카테고리 (youtube, app, etc.)
  version INT DEFAULT 1,                             -- 버전
  steps JSONB NOT NULL DEFAULT '[]',                 -- Step 배열
  params JSONB DEFAULT '{}',                         -- 기본 파라미터
  params_schema JSONB DEFAULT '{}',                  -- 파라미터 스키마
  timeout INT DEFAULT 300000,                        -- 타임아웃 (ms)
  retry_policy JSONB DEFAULT '{}',                   -- 재시도 정책
  is_active BOOLEAN DEFAULT true,                    -- 활성화 여부
  tags TEXT[] DEFAULT '{}',                          -- 태그 (검색용)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT workflows_version_unique UNIQUE (id, version)
);

-- 워크플로우 실행 기록
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT UNIQUE,                         -- 실행 ID (서버 생성)
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_version INT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  device_ids TEXT[] DEFAULT '{}',                   -- 대상 디바이스 목록 (배치용, TEXT[] to match devices.id type)
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  node_ids TEXT[] DEFAULT '{}',                     -- 실행 노드 목록
  status TEXT DEFAULT 'queued' 
    CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed', 'cancelled', 'partial')),
  params JSONB DEFAULT '{}',                        -- 실행 파라미터
  result JSONB,                                      -- 실행 결과
  error_message TEXT,                                -- 에러 메시지
  current_step TEXT,                                 -- 현재 진행 Step
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_devices INT DEFAULT 0,                       -- 전체 디바이스 수
  completed_devices INT DEFAULT 0,                   -- 완료 디바이스 수
  failed_devices INT DEFAULT 0,                      -- 실패 디바이스 수
  triggered_by UUID,                                 -- 실행 요청자 (auth.users 참조)
  started_at TIMESTAMPTZ,                            -- 실행 시작 시간
  completed_at TIMESTAMPTZ,                          -- 실행 완료 시간
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 실행 로그 (상세)
CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGSERIAL PRIMARY KEY,
  execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
  device_id TEXT,                                    -- 디바이스 ID
  workflow_id TEXT,                                  -- 워크플로우 ID
  step_id TEXT,                                      -- Step ID
  level TEXT DEFAULT 'info' 
    CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  status TEXT 
    CHECK (status IN ('started', 'progress', 'completed', 'failed', 'skipped', 'retrying')),
  message TEXT,                                      -- 로그 메시지
  data JSONB DEFAULT '{}',                           -- 상세 데이터
  details JSONB DEFAULT '{}',                        -- 추가 상세 정보 (호환용)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 시스템 설정
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 알림 기록
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  level TEXT CHECK (level IN ('critical', 'warning', 'info')),
  message TEXT NOT NULL,
  source TEXT,                                       -- 알림 소스 (system, workflow, device 등)
  data JSONB DEFAULT '{}',                           -- 상세 데이터
  acknowledged BOOLEAN DEFAULT false,                -- 확인 여부
  acknowledged_by UUID,                              -- 확인한 사용자
  acknowledged_at TIMESTAMPTZ,                       -- 확인 시간
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 인덱스 생성 (성능 최적화)
-- ============================================

-- nodes 인덱스
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen DESC);

-- devices 인덱스
CREATE INDEX IF NOT EXISTS idx_devices_node ON devices(node_id);
CREATE INDEX IF NOT EXISTS idx_devices_state ON devices(state);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);

-- device_states 인덱스
CREATE INDEX IF NOT EXISTS idx_device_states_device ON device_states(device_id);
CREATE INDEX IF NOT EXISTS idx_device_states_node ON device_states(node_id);
CREATE INDEX IF NOT EXISTS idx_device_states_state ON device_states(state);

-- workflows 인덱스
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows USING GIN(tags);

-- workflow_executions 인덱스
CREATE INDEX IF NOT EXISTS idx_executions_device ON workflow_executions(device_id);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created ON workflow_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_execution_id ON workflow_executions(execution_id);

-- execution_logs 인덱스
CREATE INDEX IF NOT EXISTS idx_logs_execution ON execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_logs_device ON execution_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_logs_level ON execution_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created ON execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_error ON execution_logs(level) WHERE level IN ('error', 'fatal');

-- alerts 인덱스
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON alerts(acknowledged) WHERE acknowledged = false;

-- ============================================
-- 3. RLS (Row Level Security) 정책
-- ============================================

-- RLS 활성화
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- 서비스 역할 전체 접근 (Backend)
DO $$
BEGIN
  -- nodes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nodes' AND policyname = 'Service role full access on nodes') THEN
    CREATE POLICY "Service role full access on nodes" ON nodes FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- devices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'Service role full access on devices') THEN
    CREATE POLICY "Service role full access on devices" ON devices FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- device_states
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'device_states' AND policyname = 'Service role full access on device_states') THEN
    CREATE POLICY "Service role full access on device_states" ON device_states FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- workflows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflows' AND policyname = 'Service role full access on workflows') THEN
    CREATE POLICY "Service role full access on workflows" ON workflows FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- workflow_executions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_executions' AND policyname = 'Service role full access on workflow_executions') THEN
    CREATE POLICY "Service role full access on workflow_executions" ON workflow_executions FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- execution_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'execution_logs' AND policyname = 'Service role full access on execution_logs') THEN
    CREATE POLICY "Service role full access on execution_logs" ON execution_logs FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'Service role full access on settings') THEN
    CREATE POLICY "Service role full access on settings" ON settings FOR ALL USING (auth.role() = 'service_role');
  END IF;
  
  -- alerts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Service role full access on alerts') THEN
    CREATE POLICY "Service role full access on alerts" ON alerts FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Anon/Authenticated 읽기 전용 (Dashboard)
DO $$
BEGIN
  -- nodes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nodes' AND policyname = 'Public read nodes') THEN
    CREATE POLICY "Public read nodes" ON nodes FOR SELECT USING (true);
  END IF;
  
  -- devices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'Public read devices') THEN
    CREATE POLICY "Public read devices" ON devices FOR SELECT USING (true);
  END IF;
  
  -- device_states
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'device_states' AND policyname = 'Public read device_states') THEN
    CREATE POLICY "Public read device_states" ON device_states FOR SELECT USING (true);
  END IF;
  
  -- workflows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflows' AND policyname = 'Public read workflows') THEN
    CREATE POLICY "Public read workflows" ON workflows FOR SELECT USING (true);
  END IF;
  
  -- workflow_executions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_executions' AND policyname = 'Public read workflow_executions') THEN
    CREATE POLICY "Public read workflow_executions" ON workflow_executions FOR SELECT USING (true);
  END IF;
  
  -- execution_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'execution_logs' AND policyname = 'Public read execution_logs') THEN
    CREATE POLICY "Public read execution_logs" ON execution_logs FOR SELECT USING (true);
  END IF;
  
  -- settings (읽기 전용 - 민감 설정 제외)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'Public read settings') THEN
    CREATE POLICY "Public read settings" ON settings FOR SELECT USING (key NOT LIKE 'secret_%');
  END IF;
  
  -- alerts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Public read alerts') THEN
    CREATE POLICY "Public read alerts" ON alerts FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================
-- 4. 트리거 (자동 updated_at)
-- ============================================

DROP TRIGGER IF EXISTS nodes_updated_at ON nodes;
CREATE TRIGGER nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS device_states_updated_at ON device_states;
CREATE TRIGGER device_states_updated_at
  BEFORE UPDATE ON device_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER workflow_executions_updated_at
  BEFORE UPDATE ON workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 5. 로그 정리 함수 (크론 작업용)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- 30일 이상 된 실행 로그 삭제
  DELETE FROM execution_logs WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- 90일 이상 된 실행 기록 삭제
  DELETE FROM workflow_executions WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 30일 이상 된 확인된 알림 삭제
  DELETE FROM alerts WHERE acknowledged = true AND created_at < NOW() - INTERVAL '30 days';
  
  -- 7일 이상 오프라인 노드 정리 (선택적)
  -- UPDATE nodes SET status = 'offline' WHERE last_seen < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. 유용한 함수들
-- ============================================

-- 디바이스 상태별 카운트
CREATE OR REPLACE FUNCTION get_device_state_counts()
RETURNS TABLE (
  state TEXT,
  count BIGINT
)
LANGUAGE sql
AS $$
  SELECT state, COUNT(*) 
  FROM devices 
  GROUP BY state
  ORDER BY 
    CASE state
      WHEN 'RUNNING' THEN 1
      WHEN 'IDLE' THEN 2
      WHEN 'QUEUED' THEN 3
      WHEN 'ERROR' THEN 4
      WHEN 'QUARANTINE' THEN 5
      WHEN 'DISCONNECTED' THEN 6
    END;
$$;

-- 노드별 디바이스 상태 요약
CREATE OR REPLACE FUNCTION get_node_device_summary(p_node_id TEXT DEFAULT NULL)
RETURNS TABLE (
  node_id TEXT,
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
    COUNT(*) FILTER (WHERE d.state = 'IDLE') AS idle_devices,
    COUNT(*) FILTER (WHERE d.state = 'RUNNING') AS running_devices,
    COUNT(*) FILTER (WHERE d.state IN ('ERROR', 'QUARANTINE')) AS error_devices
  FROM nodes n
  LEFT JOIN devices d ON d.node_id = n.id
  WHERE p_node_id IS NULL OR n.id = p_node_id
  GROUP BY n.id, n.name, n.status
  ORDER BY n.name;
$$;

-- ============================================
-- 7. 초기 데이터
-- ============================================

-- 기본 설정 삽입
INSERT INTO settings (key, value, description) VALUES
  ('max_concurrent_per_node', '20', '노드당 최대 동시 실행 워크플로우 수'),
  ('device_heartbeat_timeout', '30000', '디바이스 하트비트 타임아웃 (ms)'),
  ('workflow_default_timeout', '300000', '워크플로우 기본 타임아웃 (ms)'),
  ('error_threshold_quarantine', '3', '격리 전환 에러 횟수 임계값'),
  ('auto_recovery_enabled', 'true', '자동 복구 활성화 여부'),
  ('metrics_retention_days', '30', '메트릭 보관 기간 (일)')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 8. Supabase Realtime 활성화
-- ============================================

-- device_states 실시간 모니터링
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE device_states;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- workflow_executions 실시간 모니터링
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE workflow_executions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- alerts 실시간 모니터링
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 9. 뷰: 시스템 개요
-- ============================================

CREATE OR REPLACE VIEW system_overview AS
SELECT 
  (SELECT COUNT(*) FROM nodes WHERE status = 'online') AS online_nodes,
  (SELECT COUNT(*) FROM nodes) AS total_nodes,
  (SELECT COUNT(*) FROM devices) AS total_devices,
  (SELECT COUNT(*) FROM devices WHERE state = 'IDLE') AS idle_devices,
  (SELECT COUNT(*) FROM devices WHERE state = 'RUNNING') AS running_devices,
  (SELECT COUNT(*) FROM devices WHERE state IN ('ERROR', 'QUARANTINE')) AS error_devices,
  (SELECT COUNT(*) FROM workflow_executions WHERE status = 'running') AS running_workflows,
  (SELECT COUNT(*) FROM alerts WHERE acknowledged = false) AS unacknowledged_alerts;

COMMENT ON VIEW system_overview IS '시스템 전체 개요 뷰';

-- ============================================
-- 마이그레이션 완료
-- ============================================

-- 확인 쿼리
DO $$
BEGIN
  RAISE NOTICE 'DoAi.Me Initial Schema Migration Complete';
  RAISE NOTICE 'Tables: nodes, devices, device_states, workflows, workflow_executions, execution_logs, settings, alerts';
END $$;
