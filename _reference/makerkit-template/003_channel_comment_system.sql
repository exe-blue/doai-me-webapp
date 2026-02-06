-- =============================================
-- Migration 003: Channel & Comment System
-- Created: 2026-01-30
-- Description: Add channels table for auto-monitoring and comments table for comment pool
-- =============================================

-- =============================================
-- PART 1: channels 테이블 (채널 자동 모니터링)
-- =============================================

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(50) NOT NULL UNIQUE,     -- YouTube Channel ID (UC...)
  channel_name VARCHAR(200) NOT NULL,          -- 채널명 (예: 짐승남)
  channel_url TEXT NOT NULL,                   -- 채널 URL
  is_active BOOLEAN DEFAULT TRUE,              -- 모니터링 활성화 여부
  last_video_id VARCHAR(50),                   -- 마지막으로 감지한 영상 ID
  last_checked_at TIMESTAMPTZ,                 -- 마지막 체크 시간
  check_interval_min INTEGER DEFAULT 30,       -- 체크 주기 (분)

  -- 채널별 기본 작업 설정
  default_duration_sec INTEGER DEFAULT 60,
  default_prob_like INTEGER DEFAULT 30,
  default_prob_comment INTEGER DEFAULT 5,
  default_prob_playlist INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_active
  ON channels(is_active, last_checked_at)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_channels_channel_id
  ON channels(channel_id);

-- =============================================
-- PART 2: comments 테이블 (댓글 풀)
-- =============================================

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,  -- 작업별 댓글 풀
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,  -- 또는 채널별 공용 댓글
  content TEXT NOT NULL,                       -- 댓글 내용
  is_used BOOLEAN DEFAULT FALSE,               -- 사용 여부
  used_by_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스: 미사용 댓글 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_comments_unused
  ON comments(job_id, is_used)
  WHERE is_used = FALSE;

CREATE INDEX IF NOT EXISTS idx_comments_channel_unused
  ON comments(channel_id, is_used)
  WHERE is_used = FALSE;

-- =============================================
-- PART 3: jobs 테이블 확장 (type 컬럼)
-- =============================================

-- 작업 유형 추가 (VIDEO_URL: 단일 영상, CHANNEL_AUTO: 채널 자동)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'VIDEO_URL';

-- type CHECK 제약조건
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN ('VIDEO_URL', 'CHANNEL_AUTO'));

-- 채널 참조 (CHANNEL_AUTO 타입인 경우)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- display_name 컬럼 (이미 존재할 수 있음)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS display_name VARCHAR(50);

-- priority 컬럼 (우선순위 플래그)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT FALSE;

-- 인덱스: 우선순위 및 타입
CREATE INDEX IF NOT EXISTS idx_jobs_priority
  ON jobs(priority DESC, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_jobs_type
  ON jobs(type);

-- =============================================
-- PART 4: devices 테이블 확장 (IP 등)
-- =============================================

-- IP 주소 컬럼
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- 기기 연결 상태 상세 정보
ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_info JSONB DEFAULT '{}';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_devices_status_seen
  ON devices(status, last_seen_at DESC);

-- =============================================
-- PART 5: 채널 체크 결과 로그 (옵션)
-- =============================================

CREATE TABLE IF NOT EXISTS channel_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  videos_found INTEGER DEFAULT 0,
  new_video_id VARCHAR(50),
  job_created_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_channel_logs_channel
  ON channel_check_logs(channel_id, checked_at DESC);

-- =============================================
-- PART 6: 함수 - 미사용 댓글 가져오기
-- =============================================

-- 특정 작업의 미사용 댓글 하나를 가져와서 사용 처리
CREATE OR REPLACE FUNCTION get_and_use_comment(
  p_job_id UUID,
  p_device_id UUID
)
RETURNS TABLE (
  comment_id UUID,
  comment_content TEXT
) AS $$
DECLARE
  v_comment_id UUID;
  v_content TEXT;
BEGIN
  -- 미사용 댓글 하나 선택 (FOR UPDATE SKIP LOCKED로 동시성 처리)
  SELECT c.id, c.content INTO v_comment_id, v_content
  FROM comments c
  WHERE c.job_id = p_job_id
    AND c.is_used = FALSE
  ORDER BY c.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 댓글이 있으면 사용 처리
  IF v_comment_id IS NOT NULL THEN
    UPDATE comments
    SET is_used = TRUE,
        used_by_device_id = p_device_id,
        used_at = NOW()
    WHERE id = v_comment_id;

    RETURN QUERY SELECT v_comment_id, v_content;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 마이그레이션 완료 확인
-- =============================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('channels', 'comments', 'channel_check_logs');
