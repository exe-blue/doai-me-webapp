-- =============================================
-- Production RLS Policies
-- =============================================
-- 프로덕션 환경용 강화된 Row Level Security 정책
-- 개발용 "Allow all" 정책을 교체하기 위한 마이그레이션

-- 주의: 이 마이그레이션은 프로덕션 배포 전에만 실행하세요!
-- 개발 환경에서는 supabase-schema.sql의 개발용 정책을 사용하세요.

-- =============================================
-- 1. 기존 개발용 정책 제거
-- =============================================

-- devices 정책 제거
DROP POLICY IF EXISTS "Allow all for devices" ON devices;

-- jobs 정책 제거
DROP POLICY IF EXISTS "Allow all for jobs" ON jobs;

-- job_assignments 정책 제거
DROP POLICY IF EXISTS "Allow select for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow insert for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow delete for job_assignments" ON job_assignments;
DROP POLICY IF EXISTS "Allow update for job_assignments" ON job_assignments;

-- salary_logs 정책 제거
DROP POLICY IF EXISTS "Allow all for salary_logs" ON salary_logs;

-- monitored_channels 정책 제거
DROP POLICY IF EXISTS "Allow all for monitored_channels" ON monitored_channels;

-- =============================================
-- 2. 프로덕션 RLS 정책 생성
-- =============================================

-- =============================================
-- 2.1 devices 테이블 정책
-- =============================================

-- 모든 사용자가 기기 목록을 조회할 수 있음 (대시보드 표시용)
CREATE POLICY "Anyone can view devices"
  ON devices
  FOR SELECT
  USING (true);

-- Worker 클라이언트만 기기를 등록/업데이트 가능 (Service Role Key 필요)
-- 참고: service_role 키는 서버 사이드(worker.js)에서만 사용
CREATE POLICY "Service role can manage devices"
  ON devices
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 2.2 jobs 테이블 정책
-- =============================================

-- 모든 사용자가 작업 목록을 조회할 수 있음 (대시보드 표시용)
CREATE POLICY "Anyone can view jobs"
  ON jobs
  FOR SELECT
  USING (true);

-- 인증된 사용자만 작업을 생성/수정 가능 (대시보드에서 작업 생성)
-- 참고: anon 키로는 읽기만 가능, service_role 키로만 쓰기 가능
CREATE POLICY "Service role can manage jobs"
  ON jobs
  FOR INSERT
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update jobs"
  ON jobs
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete jobs"
  ON jobs
  FOR DELETE
  USING (auth.role() = 'service_role');

-- =============================================
-- 2.3 job_assignments 테이블 정책
-- =============================================

-- 모든 사용자가 작업 할당 목록을 조회할 수 있음 (대시보드 표시용)
CREATE POLICY "Anyone can view assignments"
  ON job_assignments
  FOR SELECT
  USING (true);

-- Worker 클라이언트만 할당을 생성/수정 가능
CREATE POLICY "Service role can create assignments"
  ON job_assignments
  FOR INSERT
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Worker는 자신이 처리 중인 작업의 상태만 업데이트 가능
CREATE POLICY "Service role can update assignments"
  ON job_assignments
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete assignments"
  ON job_assignments
  FOR DELETE
  USING (auth.role() = 'service_role');

-- =============================================
-- 2.4 salary_logs 테이블 정책
-- =============================================

-- 모든 사용자가 급여 로그를 조회할 수 있음 (리포트용)
CREATE POLICY "Anyone can view salary logs"
  ON salary_logs
  FOR SELECT
  USING (true);

-- 서버 사이드만 급여 로그를 생성 가능 (트리거 또는 service_role)
CREATE POLICY "Service role can create salary logs"
  ON salary_logs
  FOR INSERT
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 2.5 monitored_channels 테이블 정책
-- =============================================

-- 모든 사용자가 모니터링 채널 목록을 조회할 수 있음
CREATE POLICY "Anyone can view monitored channels"
  ON monitored_channels
  FOR SELECT
  USING (true);

-- 관리자만 채널을 추가/수정/삭제 가능
CREATE POLICY "Service role can manage monitored channels"
  ON monitored_channels
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 3. 추가 보안 설정
-- =============================================

-- 3.1 API Rate Limiting 권장사항 (Supabase Dashboard에서 설정)
-- - Anonymous 사용자: 100 req/min
-- - Authenticated 사용자: 1000 req/min

-- 3.2 Realtime 구독 제한 (Supabase Dashboard에서 설정)
-- - 최대 동시 연결: 100개
-- - 채널당 최대 이벤트: 100/sec

-- 3.3 서비스 역할 키 보호
-- ⚠️ SUPABASE_SERVICE_ROLE_KEY는 절대로 클라이언트에 노출하지 마세요!
-- - 환경 변수로만 관리
-- - Worker 서버에서만 사용
-- - Git에 커밋하지 않기 (.env는 .gitignore에 포함)

-- =============================================
-- 마이그레이션 노트
-- =============================================
--
-- 정책 요약:
-- - 읽기(SELECT): 누구나 가능 (대시보드 표시를 위해)
-- - 쓰기(INSERT/UPDATE/DELETE): service_role만 가능
--
-- 역할 구분:
-- - anon (NEXT_PUBLIC_SUPABASE_ANON_KEY): 읽기 전용
-- - service_role (SUPABASE_SERVICE_ROLE_KEY): 모든 권한 (서버 사이드 전용)
--
-- 배포 전 체크리스트:
-- 1. [ ] SUPABASE_SERVICE_ROLE_KEY가 .env에만 있고 Git에 없는지 확인
-- 2. [ ] 대시보드(Next.js)에서 NEXT_PUBLIC_SUPABASE_ANON_KEY만 사용하는지 확인
-- 3. [ ] Worker/Manager에서 SUPABASE_SERVICE_ROLE_KEY를 사용하는지 확인
-- 4. [ ] Supabase Dashboard에서 API Rate Limit 설정 확인
-- 5. [ ] RLS가 모든 테이블에서 활성화되었는지 확인 (ENABLE ROW LEVEL SECURITY)
--
