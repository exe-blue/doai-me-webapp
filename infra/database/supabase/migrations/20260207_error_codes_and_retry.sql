-- =============================================
-- Error Code System + retry_count
-- SYSTEM-SPECIFICATION.md 섹션 7 에러 코드 체계 구현
-- =============================================

-- job_assignments에 error_code, retry_count 추가
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- status CHECK 제약 확장 (cancelled 추가)
ALTER TABLE job_assignments DROP CONSTRAINT IF EXISTS job_assignments_status_check;
ALTER TABLE job_assignments ADD CONSTRAINT job_assignments_status_check
  CHECK (status IN ('pending', 'paused', 'running', 'completed', 'failed', 'cancelled'));

-- retry_count 범위 제약
ALTER TABLE job_assignments ADD CONSTRAINT job_assignments_retry_count_check
  CHECK (retry_count >= 0 AND retry_count <= 10);

-- error_code 인덱스 (에러 분석용)
CREATE INDEX IF NOT EXISTS idx_assignments_error_code ON job_assignments(error_code);
