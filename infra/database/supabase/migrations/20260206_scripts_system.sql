-- ============================================
-- Scripts System Migration
-- 스크립트 관리 + 실행 + 디바이스별 결과
-- ============================================

-- 1. scripts 테이블
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('adb_shell', 'python', 'uiautomator2', 'javascript')),
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  target_group TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  params_schema JSONB NOT NULL DEFAULT '{}',
  default_params JSONB NOT NULL DEFAULT '{}',
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scripts IS '실행 가능한 스크립트 정의';
COMMENT ON COLUMN public.scripts.type IS 'adb_shell | python | uiautomator2 | javascript';
COMMENT ON COLUMN public.scripts.target_group IS 'PC01, all, null 등 대상 그룹';
COMMENT ON COLUMN public.scripts.params_schema IS 'JSON Schema for runtime parameters';

-- 2. script_executions 테이블
CREATE TABLE IF NOT EXISTS public.script_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  script_version INTEGER NOT NULL,
  device_ids TEXT[] NOT NULL DEFAULT '{}',
  pc_ids TEXT[] NOT NULL DEFAULT '{}',
  params JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'partial')),
  total_devices INTEGER NOT NULL DEFAULT 0,
  completed_devices INTEGER NOT NULL DEFAULT 0,
  failed_devices INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.script_executions IS '스크립트 실행 인스턴스';

-- 3. script_device_results 테이블
CREATE TABLE IF NOT EXISTS public.script_device_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.script_executions(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  management_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  output TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.script_device_results IS '디바이스별 스크립트 실행 결과';

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_scripts_status ON public.scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_type ON public.scripts(type);
CREATE INDEX IF NOT EXISTS idx_script_executions_script_id ON public.script_executions(script_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_status ON public.script_executions(status);
CREATE INDEX IF NOT EXISTS idx_script_device_results_execution_id ON public.script_device_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_script_device_results_device_id ON public.script_device_results(device_id);

-- 5. updated_at 트리거
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_scripts ON public.scripts;
CREATE TRIGGER set_updated_at_scripts
  BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_script_executions ON public.script_executions;
CREATE TRIGGER set_updated_at_script_executions
  BEFORE UPDATE ON public.script_executions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- 6. RPC: increment_script_version
CREATE OR REPLACE FUNCTION public.increment_script_version(p_script_id UUID)
RETURNS TABLE(version INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scripts
  SET version = scripts.version + 1, updated_at = now()
  WHERE id = p_script_id
  RETURNING scripts.version;
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: increment_script_exec_count
CREATE OR REPLACE FUNCTION public.increment_script_exec_count(p_execution_id UUID, p_count_type TEXT)
RETURNS VOID AS $$
BEGIN
  IF p_count_type = 'completed' THEN
    UPDATE public.script_executions
    SET completed_devices = completed_devices + 1, updated_at = now()
    WHERE id = p_execution_id;
  ELSIF p_count_type = 'failed' THEN
    UPDATE public.script_executions
    SET failed_devices = failed_devices + 1, updated_at = now()
    WHERE id = p_execution_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
