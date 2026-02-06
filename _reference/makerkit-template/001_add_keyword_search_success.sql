-- =============================================
-- Migration: Add keyword, duration_sec, search_success columns
-- Version: 001
-- Date: 2026-01-29
-- Description: WebView 기반 검색 유입 자동화 지원
-- =============================================

-- 1. jobs 테이블에 keyword 컬럼 추가
-- NULL이면 URL 직접 진입 방식 사용
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;

-- 2. jobs 테이블에 duration_sec 컬럼 추가
-- 영상 시청 시간(초), 기본값 60초
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS duration_sec INTEGER DEFAULT 60;

-- 3. job_assignments 테이블에 search_success 컬럼 추가
-- 검색으로 영상을 찾았는지 여부 추적
ALTER TABLE job_assignments
ADD COLUMN IF NOT EXISTS search_success BOOLEAN DEFAULT FALSE;

-- 4. 인덱스 추가 (검색 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
CREATE INDEX IF NOT EXISTS idx_assignments_search_success ON job_assignments(search_success);

-- 5. 코멘트 추가 (문서화)
COMMENT ON COLUMN jobs.keyword IS '검색어. NULL이면 URL 직접 진입';
COMMENT ON COLUMN jobs.duration_sec IS '영상 시청 시간(초). 기본값 60초';
COMMENT ON COLUMN job_assignments.search_success IS '검색으로 영상을 찾았는지 여부';

-- 6. 기존 monitored_channels preset_settings 업데이트 (duration_sec 추가)
UPDATE monitored_channels
SET preset_settings = preset_settings || '{"duration_sec": 60, "script_type": "youtube_search"}'::jsonb
WHERE NOT (preset_settings ? 'duration_sec');

-- =============================================
-- 검증 쿼리 (마이그레이션 후 실행)
-- =============================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'jobs' AND column_name IN ('keyword', 'duration_sec');

-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'job_assignments' AND column_name = 'search_success';
