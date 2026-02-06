-- =============================================
-- DoAi.me Device Farm - Complete Database Schema
-- =============================================
-- 이 SQL을 Supabase SQL Editor에서 실행하세요

-- =============================================
-- 1. devices 테이블 (기기 정보)
-- =============================================
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  pc_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT 'P1-G1',
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. jobs 테이블 (작업 공고)
-- =============================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  keyword TEXT DEFAULT NULL,  -- 검색어. NULL이면 URL 직접 진입
  duration_sec INTEGER DEFAULT 60,  -- 영상 시청 시간(초)
  target_group TEXT,
  target_url TEXT NOT NULL,
  video_url TEXT,  -- 호환성을 위해 유지 (target_url의 alias)
  script_type TEXT NOT NULL DEFAULT 'youtube_watch',
  duration_min_pct INTEGER NOT NULL DEFAULT 30,
  duration_max_pct INTEGER NOT NULL DEFAULT 90,
  prob_like INTEGER NOT NULL DEFAULT 0,
  like_probability INTEGER,  -- 호환성을 위해 유지 (prob_like의 alias)
  prob_comment INTEGER NOT NULL DEFAULT 0,
  prob_playlist INTEGER NOT NULL DEFAULT 0,
  base_reward INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_assignments INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. job_assignments 테이블 (작업 할당)
-- =============================================
CREATE TABLE IF NOT EXISTS job_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_serial TEXT,  -- 호환성을 위해 유지 (non-FK, 정보성)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paused', 'running', 'completed', 'failed', 'cancelled')),
  progress_pct INTEGER NOT NULL DEFAULT 0,
  final_duration_sec INTEGER,
  did_like BOOLEAN DEFAULT false,
  did_comment BOOLEAN DEFAULT false,
  did_playlist BOOLEAN DEFAULT false,
  search_success BOOLEAN DEFAULT false,  -- 검색으로 영상을 찾았는지 여부
  error_log TEXT,
  error_code TEXT,                        -- 에러 코드 (E1001~E4001)
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 10),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- =============================================
-- 4. salary_logs 테이블 (급여 로그)
-- =============================================
CREATE TABLE IF NOT EXISTS salary_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES job_assignments(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  watch_percentage INTEGER NOT NULL,
  actual_duration_sec INTEGER NOT NULL,
  rank_in_group INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 5. monitored_channels 테이블 (채널 모니터링)
-- =============================================
CREATE TABLE IF NOT EXISTS monitored_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_video_id TEXT,
  last_checked_at TIMESTAMPTZ,
  preset_settings JSONB DEFAULT '{
    "duration_sec": 60,
    "duration_min_pct": 30,
    "duration_max_pct": 90,
    "prob_like": 50,
    "prob_comment": 30,
    "prob_playlist": 10,
    "script_type": "youtube_search"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 인덱스 생성
-- =============================================

-- devices 인덱스
CREATE INDEX IF NOT EXISTS idx_devices_id ON devices(id);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON devices(pc_id);

-- jobs 인덱스
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_target_group ON jobs(target_group);
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

-- job_assignments 인덱스
CREATE INDEX IF NOT EXISTS idx_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_device ON job_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON job_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_search_success ON job_assignments(search_success);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_at ON job_assignments(assigned_at);

-- monitored_channels 인덱스
CREATE INDEX IF NOT EXISTS idx_monitored_channels_active ON monitored_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_monitored_channels_channel_id ON monitored_channels(channel_id);

-- =============================================
-- Realtime 활성화
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS devices;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS job_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS monitored_channels;

-- =============================================
-- RLS 정책 활성화
-- =============================================
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_channels ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS 정책 정의 (개발용 - 모든 작업 허용)
-- =============================================
-- ⚠️ 주의: 프로덕션 배포 전 반드시 적절한 RLS 정책으로 교체 필요

-- devices 정책
DROP POLICY IF EXISTS "Allow all for devices" ON devices;
CREATE POLICY "Allow all for devices" ON devices FOR ALL USING (true) WITH CHECK (true);

-- jobs 정책
DROP POLICY IF EXISTS "Allow all for jobs" ON jobs;
CREATE POLICY "Allow all for jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- job_assignments 정책 (개별 작업별 분리)
DROP POLICY IF EXISTS "Allow select for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow insert for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow delete for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow update for job_assignments" ON job_assignments;

CREATE POLICY "Allow select for job_assignments" ON job_assignments FOR SELECT USING (true);
CREATE POLICY "Allow insert for job_assignments" ON job_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete for job_assignments" ON job_assignments FOR DELETE USING (true);
CREATE POLICY "Allow update for job_assignments" ON job_assignments FOR UPDATE USING (true) WITH CHECK (true);

-- salary_logs 정책
DROP POLICY IF EXISTS "Allow all for salary_logs" ON salary_logs;
CREATE POLICY "Allow all for salary_logs" ON salary_logs FOR ALL USING (true) WITH CHECK (true);

-- monitored_channels 정책
DROP POLICY IF EXISTS "Allow all for monitored_channels" ON monitored_channels;
CREATE POLICY "Allow all for monitored_channels" ON monitored_channels FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 트리거 함수: updated_at 자동 업데이트
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- jobs 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- monitored_channels 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS update_monitored_channels_updated_at ON monitored_channels;
CREATE TRIGGER update_monitored_channels_updated_at
  BEFORE UPDATE ON monitored_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 마이그레이션 노트
-- =============================================
--
-- 변경 사항:
-- 1. devices 테이블에 id (UUID) 컬럼 추가 (PK), serial_number는 UNIQUE 제약
-- 2. jobs 테이블에 누락된 컬럼 추가: title, script_type, base_reward, prob_comment, prob_playlist
-- 3. job_assignments 테이블:
--    - device_serial → device_id (UUID FK) 변경
--    - 누락된 컬럼 추가: assigned_at, did_like, did_comment, did_playlist, error_log
-- 4. monitored_channels 테이블 신규 생성
-- 5. 인덱스 최적화 및 추가
-- 6. RLS 정책 명시적 정의 (DROP IF EXISTS 추가)
-- 7. updated_at 자동 업데이트 트리거 추가
--
-- 기존 데이터 마이그레이션 시 주의사항:
-- - devices: serial_number를 유지하면서 UUID id 할당 필요
-- - job_assignments: device_serial → device_id 매핑 필요
--
