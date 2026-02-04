-- ============================================
-- 워크플로우 & 실행 로그 테이블 마이그레이션
-- Command & Control 아키텍처 지원
-- ============================================

-- ============================================
-- 1. workflows 테이블 - 워크플로우 정의 저장
-- ============================================

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,                    -- 워크플로우 ID (예: youtube_watch)
  name TEXT NOT NULL,                     -- 표시 이름
  version INTEGER NOT NULL DEFAULT 1,     -- 버전
  description TEXT,                       -- 설명
  
  -- 워크플로우 정의
  steps JSONB NOT NULL DEFAULT '[]',      -- Step 배열 (YAML에서 파싱)
  params_schema JSONB DEFAULT '{}',       -- 파라미터 스키마
  
  -- 설정
  timeout_ms INTEGER DEFAULT 600000,      -- 전역 타임아웃 (ms)
  retry_policy JSONB DEFAULT '{}',        -- 전역 retry 정책
  on_error JSONB DEFAULT '{}',            -- 전역 에러 핸들러
  
  -- 메타데이터
  tags TEXT[] DEFAULT '{}',               -- 태그 (검색용)
  category TEXT,                          -- 카테고리
  is_active BOOLEAN DEFAULT true,         -- 활성화 여부
  
  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 제약조건
  CONSTRAINT workflows_version_unique UNIQUE (id, version)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows USING GIN(tags);

-- 트리거: updated_at 자동 갱신
DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. workflow_executions 테이블 - 워크플로우 실행 상태
-- ============================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT UNIQUE NOT NULL,      -- 실행 ID (서버 생성)
  
  -- 워크플로우 정보
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  workflow_version INTEGER,
  
  -- 실행 대상
  device_ids UUID[] NOT NULL DEFAULT '{}', -- 대상 디바이스 목록
  node_ids TEXT[] DEFAULT '{}',            -- 실행 노드 목록
  
  -- 실행 파라미터
  params JSONB DEFAULT '{}',
  
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- 대기 중
    'running',      -- 실행 중
    'completed',    -- 완료
    'failed',       -- 실패
    'cancelled',    -- 취소됨
    'partial'       -- 부분 완료 (일부 성공)
  )),
  
  -- 진행률
  total_devices INTEGER NOT NULL DEFAULT 0,
  completed_devices INTEGER NOT NULL DEFAULT 0,
  failed_devices INTEGER NOT NULL DEFAULT 0,
  
  -- 에러 정보
  error_message TEXT,
  
  -- 사용자 정보
  triggered_by UUID REFERENCES auth.users(id),
  
  -- 타임스탬프
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started ON workflow_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_execution_id ON workflow_executions(execution_id);

-- 트리거
DROP TRIGGER IF EXISTS workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER workflow_executions_updated_at
  BEFORE UPDATE ON workflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. execution_logs 테이블 - 실행 로그 (상세)
-- ============================================

CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- 참조
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  workflow_id TEXT,
  execution_id TEXT,                      -- workflow_executions.execution_id
  step_id TEXT,
  
  -- 로그 정보
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN (
    'debug', 'info', 'warn', 'error', 'fatal'
  )),
  status TEXT CHECK (status IN (
    'started', 'progress', 'completed', 'failed', 'skipped', 'retrying'
  )),
  message TEXT NOT NULL,
  
  -- 상세 정보
  details JSONB DEFAULT '{}',
  
  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 파티셔닝을 위한 날짜 컬럼
  log_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_execution_logs_device ON execution_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_workflow ON execution_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution ON execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_logs_device_time ON execution_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_logs_level ON execution_logs(level) WHERE level IN ('error', 'fatal');

-- ============================================
-- 4. device_states 테이블 업데이트 (current_step 추가)
-- ============================================

ALTER TABLE device_states 
  ADD COLUMN IF NOT EXISTS current_step TEXT,
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);

-- ============================================
-- 5. RLS 정책
-- ============================================

-- workflows
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_select" ON workflows
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "workflows_all" ON workflows
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- workflow_executions
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_executions_select" ON workflow_executions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "workflow_executions_all" ON workflow_executions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- execution_logs
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_logs_select" ON execution_logs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "execution_logs_all" ON execution_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. Supabase Realtime 활성화
-- ============================================

-- device_states 테이블 Realtime 활성화 (대시보드 실시간 모니터링)
ALTER PUBLICATION supabase_realtime ADD TABLE device_states;

-- workflow_executions 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_executions;

-- 참고: execution_logs는 데이터량이 많아 Realtime에서 제외
-- 대신 Socket.IO로 실시간 로그 스트리밍

-- ============================================
-- 7. 유용한 함수들
-- ============================================

-- 워크플로우 실행 통계 조회
CREATE OR REPLACE FUNCTION get_workflow_execution_stats(
  p_execution_id TEXT
)
RETURNS TABLE (
  total_devices INTEGER,
  completed_devices INTEGER,
  failed_devices INTEGER,
  running_devices INTEGER,
  progress_percent INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    we.total_devices,
    we.completed_devices,
    we.failed_devices,
    (we.total_devices - we.completed_devices - we.failed_devices)::INTEGER AS running_devices,
    CASE 
      WHEN we.total_devices = 0 THEN 0
      ELSE ROUND((we.completed_devices + we.failed_devices)::NUMERIC / we.total_devices * 100)::INTEGER
    END AS progress_percent
  FROM workflow_executions we
  WHERE we.execution_id = p_execution_id;
END;
$$;

-- 디바이스 상태별 카운트
CREATE OR REPLACE FUNCTION get_device_state_counts()
RETURNS TABLE (
  state TEXT,
  count BIGINT
)
LANGUAGE sql
AS $$
  SELECT state, COUNT(*) 
  FROM device_states 
  GROUP BY state
  ORDER BY 
    CASE state
      WHEN 'RUNNING' THEN 1
      WHEN 'IDLE' THEN 2
      WHEN 'ERROR' THEN 3
      WHEN 'QUARANTINE' THEN 4
      WHEN 'DISCONNECTED' THEN 5
    END;
$$;

-- 실행 로그 삽입 헬퍼
CREATE OR REPLACE FUNCTION insert_execution_log(
  p_device_id UUID,
  p_workflow_id TEXT,
  p_execution_id TEXT,
  p_step_id TEXT,
  p_level TEXT,
  p_status TEXT,
  p_message TEXT,
  p_details JSONB DEFAULT '{}'
)
RETURNS execution_logs
LANGUAGE plpgsql
AS $$
DECLARE
  v_log execution_logs;
BEGIN
  INSERT INTO execution_logs (device_id, workflow_id, execution_id, step_id, level, status, message, details)
  VALUES (p_device_id, p_workflow_id, p_execution_id, p_step_id, p_level, p_status, p_message, p_details)
  RETURNING * INTO v_log;
  
  RETURN v_log;
END;
$$;

-- ============================================
-- 8. 초기 워크플로우 데이터
-- ============================================

INSERT INTO workflows (id, name, version, description, steps, params_schema, timeout_ms, category, tags) VALUES
(
  'youtube_watch',
  '유튜브 영상 시청',
  2,
  'YouTube 앱에서 키워드 검색 후 첫 번째 영상 시청',
  '[
    {"id": "open_app", "action": "autox", "script": "launch(''com.google.android.youtube'')", "timeout": 10000},
    {"id": "search", "action": "autox", "script": "click(''search_btn''); input(''{{keyword}}'')", "timeout": 5000},
    {"id": "play_video", "action": "autox", "script": "click_first_result()", "timeout": 5000},
    {"id": "watch_duration", "action": "wait", "params": {"duration": "{{duration}}"}, "timeout": 600000},
    {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
  ]'::jsonb,
  '{
    "keyword": {"type": "string", "required": true},
    "duration": {"type": "number", "default": 60}
  }'::jsonb,
  300000,
  'youtube',
  ARRAY['youtube', 'video', 'watch']
),
(
  'youtube_subscribe',
  '유튜브 채널 구독',
  1,
  'YouTube에서 채널 검색 후 구독',
  '[
    {"id": "open_app", "action": "autox", "script": "launch(''com.google.android.youtube'')", "timeout": 10000},
    {"id": "search_channel", "action": "autox", "script": "click(''search_btn''); input(''{{channel_name}}'')", "timeout": 8000},
    {"id": "select_channel", "action": "autox", "script": "click_channel_result(''{{channel_name}}'')", "timeout": 5000},
    {"id": "click_subscribe", "action": "autox", "script": "click(''subscribe_btn'')", "timeout": 5000},
    {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
  ]'::jsonb,
  '{
    "channel_name": {"type": "string", "required": true}
  }'::jsonb,
  120000,
  'youtube',
  ARRAY['youtube', 'subscribe', 'channel']
),
(
  'app_install',
  'Play Store 앱 설치',
  1,
  'Play Store에서 앱 검색 후 설치',
  '[
    {"id": "open_playstore", "action": "autox", "script": "launch(''com.android.vending'')", "timeout": 10000},
    {"id": "search_app", "action": "autox", "script": "click(''search_bar''); input(''{{app_name}}'')", "timeout": 8000},
    {"id": "select_app", "action": "autox", "script": "click_app_result(''{{app_name}}'')", "timeout": 5000},
    {"id": "click_install", "action": "autox", "script": "click(''install_btn'')", "timeout": 5000},
    {"id": "wait_install", "action": "autox", "script": "wait_for_element(''open_btn'', timeout=180s)", "timeout": 180000},
    {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
  ]'::jsonb,
  '{
    "app_name": {"type": "string", "required": true},
    "package_name": {"type": "string", "required": false}
  }'::jsonb,
  300000,
  'app',
  ARRAY['playstore', 'install', 'app']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  steps = EXCLUDED.steps,
  params_schema = EXCLUDED.params_schema,
  timeout_ms = EXCLUDED.timeout_ms,
  updated_at = NOW();

-- ============================================
-- 9. 뷰: 워크플로우 실행 요약
-- ============================================

CREATE OR REPLACE VIEW workflow_execution_summary AS
SELECT 
  we.id,
  we.execution_id,
  we.workflow_id,
  w.name AS workflow_name,
  we.status,
  we.total_devices,
  we.completed_devices,
  we.failed_devices,
  (we.total_devices - we.completed_devices - we.failed_devices) AS running_devices,
  CASE 
    WHEN we.total_devices = 0 THEN 0
    ELSE ROUND((we.completed_devices + we.failed_devices)::NUMERIC / we.total_devices * 100)
  END AS progress_percent,
  we.params,
  we.error_message,
  we.started_at,
  we.completed_at,
  we.created_at,
  EXTRACT(EPOCH FROM (COALESCE(we.completed_at, NOW()) - we.started_at)) AS duration_seconds
FROM workflow_executions we
LEFT JOIN workflows w ON we.workflow_id = w.id;

COMMENT ON VIEW workflow_execution_summary IS '워크플로우 실행 요약 뷰';

-- ============================================
-- 10. 코멘트
-- ============================================

COMMENT ON TABLE workflows IS '워크플로우 정의 테이블 - YAML에서 파싱된 워크플로우 저장';
COMMENT ON TABLE workflow_executions IS '워크플로우 실행 상태 테이블 - 배치 실행 추적';
COMMENT ON TABLE execution_logs IS '실행 로그 테이블 - 디바이스별 상세 로그';

COMMENT ON COLUMN device_states.current_step IS '현재 실행 중인 Step ID';
COMMENT ON COLUMN device_states.progress IS '현재 진행률 (0-100)';
