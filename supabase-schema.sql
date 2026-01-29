-- Supabase 테이블 스키마
-- 이 SQL을 Supabase SQL Editor에서 실행하세요

-- 1. devices 테이블 (기기 정보)
CREATE TABLE IF NOT EXISTS devices (
  serial_number TEXT PRIMARY KEY,
  pc_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT 'P1-G1',
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. jobs 테이블 (작업 공고)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_group TEXT NOT NULL,
  video_url TEXT NOT NULL,
  duration_min_pct INTEGER NOT NULL DEFAULT 30,
  duration_max_pct INTEGER NOT NULL DEFAULT 90,
  like_probability INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_assignments INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. job_assignments 테이블 (작업 할당)
CREATE TABLE IF NOT EXISTS job_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL REFERENCES devices(serial_number),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0,
  final_duration_sec INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 4. salary_logs 테이블 (급여 로그)
CREATE TABLE IF NOT EXISTS salary_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES job_assignments(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  watch_percentage INTEGER NOT NULL,
  actual_duration_sec INTEGER NOT NULL,
  rank_in_group INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_target_group ON jobs(target_group);
CREATE INDEX IF NOT EXISTS idx_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON job_assignments(status);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE job_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE devices;

-- RLS 정책 (개발용으로 모두 허용)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_logs ENABLE ROW LEVEL SECURITY;

-- 모든 작업 허용 정책 (개발용)
-- 주의: 프로덕션 배포 전 반드시 적절한 RLS 정책으로 교체 필요
CREATE POLICY "Allow all for devices" ON devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- job_assignments: 개별 작업별 정책 (FOR ALL 대신 작업별 분리)
-- 이렇게 분리해야 마이그레이션의 "Allow agents to update their assignments" 정책과 충돌하지 않음
CREATE POLICY "Allow select for job_assignments" ON job_assignments FOR SELECT USING (true);
CREATE POLICY "Allow insert for job_assignments" ON job_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete for job_assignments" ON job_assignments FOR DELETE USING (true);
-- UPDATE는 마이그레이션(20260129_salary_logs_server_side.sql)에서 
-- "Allow agents to update their assignments" 정책으로 제어됨

-- salary_logs는 별도 마이그레이션(20260129_salary_logs_server_side.sql)에서 
-- 서버 사이드 전용 RLS 정책을 적용하므로 여기서는 생성하지 않음
-- CREATE POLICY "Allow all for salary_logs" ON salary_logs FOR ALL USING (true) WITH CHECK (true);
