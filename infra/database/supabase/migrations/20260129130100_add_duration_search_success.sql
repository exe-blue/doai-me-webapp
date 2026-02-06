-- =============================================
-- Add duration_sec and search_success columns (BE-01 Part 2)
-- =============================================
-- 목적: WebView 검색 자동화 - 시청 시간 및 검색 성공 여부 추적
-- 작성일: 2026-01-29

-- 1. jobs 테이블에 duration_sec 컬럼 추가
-- 영상 시청 시간(초), 기본값 60초
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS duration_sec INTEGER DEFAULT 60;

-- 2. job_assignments 테이블에 search_success 컬럼 추가
-- 검색으로 영상을 찾았는지 여부 추적
ALTER TABLE job_assignments
ADD COLUMN IF NOT EXISTS search_success BOOLEAN DEFAULT FALSE;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_assignments_search_success ON job_assignments(search_success);

-- 4. 컬럼 설명 추가
COMMENT ON COLUMN jobs.duration_sec IS '영상 시청 시간(초). 기본값 60초';
COMMENT ON COLUMN job_assignments.search_success IS '검색으로 영상을 찾았는지 여부';

-- 5. 기존 monitored_channels preset_settings 업데이트
UPDATE monitored_channels
SET preset_settings = preset_settings || '{"duration_sec": 60, "script_type": "youtube_search"}'::jsonb
WHERE NOT (preset_settings ? 'duration_sec');
