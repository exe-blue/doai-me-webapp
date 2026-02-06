-- =============================================
-- Migration 002: Job System Enhancement
-- Created: 2026-01-29
-- Description: Add status, target management, and progress tracking to jobs
-- =============================================

-- =============================================
-- PART 1: jobs 테이블 확장
-- =============================================

-- 1.1 작업 상태 컬럼 추가
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- 1.2 status CHECK 제약조건
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'cancelled'));

-- 1.3 목표 타입 컬럼 추가
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) DEFAULT 'all_devices';

-- 1.4 target_type CHECK 제약조건
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_target_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_target_type_check
  CHECK (target_type IN ('all_devices', 'percentage', 'device_count'));

-- 1.5 목표 값 컬럼 (백분율 또는 기기 수)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_value INTEGER DEFAULT 100;

-- 1.6 진행 현황 추적 컬럼들
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_count INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_count INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;

-- 1.7 기존 데이터 마이그레이션
UPDATE jobs
SET status = 'active',
    target_type = 'all_devices',
    target_value = 100,
    assigned_count = COALESCE(total_assignments, 0),
    completed_count = 0,
    failed_count = 0
WHERE status IS NULL;

-- =============================================
-- PART 2: job_assignments 테이블 확장
-- =============================================

-- 2.1 paused 상태 추가를 위한 CHECK 제약조건 수정
ALTER TABLE job_assignments DROP CONSTRAINT IF EXISTS job_assignments_status_check;
ALTER TABLE job_assignments ADD CONSTRAINT job_assignments_status_check
  CHECK (status IN ('pending', 'paused', 'running', 'completed', 'failed', 'cancelled'));

-- =============================================
-- PART 3: 인덱스 추가
-- =============================================

-- 3.1 작업 상태별 인덱스
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON jobs(status);

-- 3.2 작업 생성일 인덱스 (최신순 정렬용)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON jobs(created_at DESC);

-- 3.3 활성 작업 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_jobs_active
  ON jobs(status, created_at DESC)
  WHERE status IN ('active', 'paused');

-- 3.4 assignment 상태별 인덱스 개선
DROP INDEX IF EXISTS idx_job_assignments_pending;
CREATE INDEX IF NOT EXISTS idx_job_assignments_status
  ON job_assignments(status, device_id)
  WHERE status IN ('pending', 'paused', 'running');

-- =============================================
-- PART 4: 통계 업데이트 함수 (선택사항)
-- =============================================

-- 작업 완료/실패 시 jobs 테이블 카운터 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_job_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- completed 상태로 변경된 경우
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      UPDATE jobs SET completed_count = completed_count + 1 WHERE id = NEW.job_id;
    END IF;

    -- failed 상태로 변경된 경우
    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
      UPDATE jobs SET failed_count = failed_count + 1 WHERE id = NEW.job_id;
    END IF;

    -- 이전에 completed/failed 였다가 다른 상태로 변경된 경우 (롤백)
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      UPDATE jobs SET completed_count = GREATEST(0, completed_count - 1) WHERE id = NEW.job_id;
    END IF;

    IF OLD.status = 'failed' AND NEW.status != 'failed' THEN
      UPDATE jobs SET failed_count = GREATEST(0, failed_count - 1) WHERE id = NEW.job_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_job_counts ON job_assignments;
CREATE TRIGGER trigger_update_job_counts
  AFTER UPDATE ON job_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_job_counts();

-- =============================================
-- 마이그레이션 완료 확인
-- =============================================
-- 다음 쿼리로 마이그레이션 결과 확인:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'jobs';
