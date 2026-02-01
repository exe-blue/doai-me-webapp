-- =============================================
-- Add Search Fields to Jobs Table (BE-01)
-- =============================================
-- 목적: WebView 검색 자동화를 위한 keyword, video_title 컬럼 추가
-- 작성일: 2026-01-29
-- 버전: Worker v5.1

-- jobs 테이블에 검색 관련 컬럼 추가
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS keyword TEXT,
ADD COLUMN IF NOT EXISTS video_title TEXT;

-- 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
CREATE INDEX IF NOT EXISTS idx_jobs_video_title ON jobs(video_title);

-- 컬럼 설명 추가
COMMENT ON COLUMN jobs.keyword IS 'YouTube 검색어 (검색 모드 사용 시)';
COMMENT ON COLUMN jobs.video_title IS '타겟 동영상 제목 (검색 결과에서 선택할 때 사용)';

-- 기존 데이터 마이그레이션 (title을 keyword로 복사)
UPDATE jobs
SET keyword = title
WHERE keyword IS NULL AND title IS NOT NULL;

-- =============================================
-- 사용 예시
-- =============================================
-- 검색 모드 Job 생성:
-- INSERT INTO jobs (title, keyword, video_title, script_type)
-- VALUES ('[검색] GPT-4 설명', 'OpenAI GPT-4', '대화형 AI의 미래', 'youtube_search');

-- URL 직접 모드 Job 생성 (기존 방식):
-- INSERT INTO jobs (title, target_url, script_type)
-- VALUES ('[직접] 특정 영상 시청', 'https://youtu.be/abc123', 'youtube_watch');
