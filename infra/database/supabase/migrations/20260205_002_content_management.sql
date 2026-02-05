-- ============================================
-- DoAi.Me 콘텐츠 관리 시스템 마이그레이션
-- Version: 002
-- Date: 2026-02-05
-- ============================================

-- ============================================
-- 1. videos 테이블 (시청할 영상)
-- ============================================
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                    -- YouTube Video ID (예: dQw4w9WgXcQ)
  title TEXT,
  channel_id TEXT,                        -- YouTube Channel ID
  channel_name TEXT,                      -- 채널명 (조회 편의)
  thumbnail_url TEXT,
  video_duration_sec INT,                 -- 원본 영상 길이
  
  -- 시청 설정
  target_views INT DEFAULT 100,           -- 목표 시청 횟수
  completed_views INT DEFAULT 0,          -- 완료된 시청 횟수
  failed_views INT DEFAULT 0,             -- 실패 횟수
  watch_duration_sec INT DEFAULT 60,      -- 시청할 시간 (초)
  watch_duration_min_pct INT DEFAULT 30,  -- 최소 시청 비율 (%)
  watch_duration_max_pct INT DEFAULT 90,  -- 최대 시청 비율 (%)
  
  -- 행동 확률 (0-100)
  prob_like INT DEFAULT 0,
  prob_comment INT DEFAULT 0,
  prob_subscribe INT DEFAULT 0,
  
  -- 상태 관리
  status TEXT DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority TEXT DEFAULT 'normal' 
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  
  -- 메타
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_priority ON videos(priority);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

-- ============================================
-- 2. channels 테이블 (채널 관리)
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,                    -- YouTube Channel ID
  name TEXT NOT NULL,
  handle TEXT,                            -- @handle
  profile_url TEXT,
  banner_url TEXT,
  subscriber_count TEXT,                  -- "12.5만" 형식
  video_count INT,
  
  -- 자동 수집 설정
  auto_collect BOOLEAN DEFAULT false,
  collect_interval_hours INT DEFAULT 24,  -- 수집 주기
  last_collected_at TIMESTAMPTZ,
  
  -- 기본 시청 설정 (영상별 오버라이드 가능)
  default_watch_duration_sec INT DEFAULT 60,
  default_prob_like INT DEFAULT 0,
  default_prob_comment INT DEFAULT 0,
  default_prob_subscribe INT DEFAULT 0,
  
  -- 상태
  status TEXT DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'archived')),
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_auto_collect ON channels(auto_collect) WHERE auto_collect = true;

-- ============================================
-- 3. keywords 테이블 (검색 키워드)
-- ============================================
CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT,                          -- 분류 (테크, 음악, 게임 등)
  
  -- 수집 설정
  is_active BOOLEAN DEFAULT true,
  collect_interval_hours INT DEFAULT 12,
  max_results INT DEFAULT 10,             -- 수집할 최대 영상 수
  
  -- 통계
  discovered_count INT DEFAULT 0,         -- 발견한 영상 수
  used_count INT DEFAULT 0,               -- 사용 횟수
  last_collected_at TIMESTAMPTZ,
  
  -- 필터링
  min_views INT DEFAULT 0,                -- 최소 조회수 필터
  min_duration_sec INT DEFAULT 30,        -- 최소 영상 길이
  max_duration_sec INT DEFAULT 3600,      -- 최대 영상 길이
  exclude_keywords TEXT[] DEFAULT '{}',   -- 제외할 키워드
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);

-- ============================================
-- 4. schedules 테이블 (자동 실행 스케줄)
-- Note: If you have already created a schedules table in another migration,
-- this CREATE TABLE IF NOT EXISTS will be a no-op. Use ALTER TABLE to add
-- any new columns needed instead of creating a duplicate.
-- ============================================
-- Check if schedules table needs schedule_type specific columns
DO $$
BEGIN
  -- Only create if not exists (original behavior, but with checks)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedules') THEN
    CREATE TABLE schedules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      
      -- 스케줄 설정
      cron_expression TEXT NOT NULL,          -- "0 9 * * *" (매일 9시)
      timezone TEXT DEFAULT 'Asia/Seoul',
      
      -- 실행 대상
      schedule_type TEXT NOT NULL 
        CHECK (schedule_type IN ('workflow', 'video_batch', 'channel_collect', 'keyword_collect', 'maintenance')),
      
      -- workflow 타입일 때
      workflow_id TEXT,
      
      -- video_batch 타입일 때
      video_filter JSONB DEFAULT '{}',        -- {"status": "active", "priority": "high"}
      batch_size INT DEFAULT 100,             -- 한 번에 실행할 영상 수
      
      -- 실행 옵션
      params JSONB DEFAULT '{}',
      max_concurrent INT DEFAULT 50,          -- 동시 실행 디바이스 수
      
      -- 상태
      is_active BOOLEAN DEFAULT true,
      run_count INT DEFAULT 0,
      success_count INT DEFAULT 0,
      fail_count INT DEFAULT 0,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      last_run_status TEXT,                   -- success|failed|partial
      last_run_result JSONB,
      
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Add columns that might be missing from other migrations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'timezone') THEN
      ALTER TABLE schedules ADD COLUMN timezone TEXT DEFAULT 'Asia/Seoul';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'schedule_type') THEN
      ALTER TABLE schedules ADD COLUMN schedule_type TEXT DEFAULT 'workflow' 
        CHECK (schedule_type IN ('workflow', 'video_batch', 'channel_collect', 'keyword_collect', 'maintenance'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'video_filter') THEN
      ALTER TABLE schedules ADD COLUMN video_filter JSONB DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'batch_size') THEN
      ALTER TABLE schedules ADD COLUMN batch_size INT DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'max_concurrent') THEN
      ALTER TABLE schedules ADD COLUMN max_concurrent INT DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'success_count') THEN
      ALTER TABLE schedules ADD COLUMN success_count INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'fail_count') THEN
      ALTER TABLE schedules ADD COLUMN fail_count INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'last_run_status') THEN
      ALTER TABLE schedules ADD COLUMN last_run_status TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedules' AND column_name = 'last_run_result') THEN
      ALTER TABLE schedules ADD COLUMN last_run_result JSONB;
    END IF;
  END IF;
END $$;

-- 인덱스 (will skip if exists)
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules(schedule_type);

-- ============================================
-- 5. daily_stats 테이블 (일일 통계)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_stats (
  date DATE PRIMARY KEY,
  
  -- 전체 통계
  total_executions INT DEFAULT 0,
  total_completed INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  success_rate DECIMAL(5,2),              -- 성공률 (%)
  
  -- 시청 통계
  total_watch_time_sec BIGINT DEFAULT 0,
  avg_watch_time_sec DECIMAL(10,2),
  
  -- 행동 통계
  total_likes INT DEFAULT 0,
  total_comments INT DEFAULT 0,
  total_subscribes INT DEFAULT 0,
  
  -- 상세 분석 (JSONB)
  by_hour JSONB DEFAULT '{}',             -- {"9": 234, "10": 345, ...}
  by_node JSONB DEFAULT '{}',             -- {"node_1": {"completed": 1234, "failed": 12}}
  by_video JSONB DEFAULT '{}',            -- {"video_id": {"views": 100, "watch_time": 6000}}
  by_status JSONB DEFAULT '{}',           -- {"completed": 4500, "failed": 50}
  
  -- 디바이스 통계
  active_devices INT DEFAULT 0,
  avg_tasks_per_device DECIMAL(10,2),
  
  -- 에러 분석
  error_breakdown JSONB DEFAULT '{}',     -- {"timeout": 20, "element_not_found": 15}
  peak_hour INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. video_executions 테이블 (영상별 실행 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS video_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  node_id TEXT,
  
  -- 실행 결과
  status TEXT DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  
  -- 시청 정보
  actual_watch_duration_sec INT,
  watch_percentage INT,                   -- 실제 시청 비율
  
  -- 행동 결과
  did_like BOOLEAN DEFAULT false,
  did_comment BOOLEAN DEFAULT false,
  did_subscribe BOOLEAN DEFAULT false,
  comment_text TEXT,
  
  -- 에러 정보
  error_code TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  
  -- 타임스탬프
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 날짜 컬럼 (파티셔닝용)
  execution_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_video_executions_video ON video_executions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_executions_device ON video_executions(device_id);
CREATE INDEX IF NOT EXISTS idx_video_executions_status ON video_executions(status);
CREATE INDEX IF NOT EXISTS idx_video_executions_created ON video_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_executions_date ON video_executions(execution_date);

-- ============================================
-- 7. 트리거: updated_at 자동 갱신
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 트리거 적용
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['videos', 'channels', 'keywords', 'schedules', 'daily_stats'])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
      CREATE TRIGGER update_%s_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END $$;

-- ============================================
-- 8. RPC 함수
-- ============================================

-- 영상 시청 완료 시 카운트 증가
CREATE OR REPLACE FUNCTION increment_video_views(p_video_id TEXT, p_success BOOLEAN DEFAULT true)
RETURNS void AS $$
BEGIN
  IF p_success THEN
    UPDATE videos 
    SET 
      completed_views = completed_views + 1,
      status = CASE 
        WHEN completed_views + 1 >= target_views THEN 'completed'
        ELSE status 
      END
    WHERE id = p_video_id;
  ELSE
    UPDATE videos 
    SET failed_views = failed_views + 1
    WHERE id = p_video_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 일일 통계 업데이트 (upsert)
CREATE OR REPLACE FUNCTION update_daily_stats(
  p_date DATE,
  p_completed INT DEFAULT 0,
  p_failed INT DEFAULT 0,
  p_watch_time INT DEFAULT 0,
  p_node_id TEXT DEFAULT NULL,
  p_video_id TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_by_hour JSONB;
  v_by_node JSONB;
  v_by_video JSONB;
  v_hour TEXT;
BEGIN
  v_hour := EXTRACT(HOUR FROM NOW())::TEXT;
  
  INSERT INTO daily_stats (date, total_completed, total_failed, total_watch_time_sec)
  VALUES (p_date, p_completed, p_failed, p_watch_time)
  ON CONFLICT (date) DO UPDATE SET
    total_completed = daily_stats.total_completed + p_completed,
    total_failed = daily_stats.total_failed + p_failed,
    total_watch_time_sec = daily_stats.total_watch_time_sec + p_watch_time,
    total_executions = daily_stats.total_executions + p_completed + p_failed,
    success_rate = CASE 
      WHEN (daily_stats.total_completed + p_completed + daily_stats.total_failed + p_failed) > 0 
      THEN ROUND((daily_stats.total_completed + p_completed)::DECIMAL / 
           (daily_stats.total_completed + p_completed + daily_stats.total_failed + p_failed) * 100, 2)
      ELSE 0 
    END,
    by_hour = jsonb_set(
      COALESCE(daily_stats.by_hour, '{}'::JSONB),
      ARRAY[v_hour],
      to_jsonb(COALESCE((daily_stats.by_hour->>v_hour)::INT, 0) + p_completed)
    ),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 활성 영상 목록 조회 (우선순위 정렬)
CREATE OR REPLACE FUNCTION get_active_videos(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  channel_name TEXT,
  target_views INT,
  completed_views INT,
  remaining_views INT,
  priority TEXT,
  watch_duration_sec INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.title,
    v.channel_name,
    v.target_views,
    v.completed_views,
    (v.target_views - v.completed_views) AS remaining_views,
    v.priority,
    v.watch_duration_sec
  FROM videos v
  WHERE v.status = 'active'
  ORDER BY 
    CASE v.priority 
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1 
      WHEN 'normal' THEN 2 
      WHEN 'low' THEN 3 
    END,
    (v.target_views - v.completed_views) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 랜덤 활성 키워드 가져오기
CREATE OR REPLACE FUNCTION get_random_keywords(p_count INT DEFAULT 5)
RETURNS TABLE(keyword TEXT, category TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT k.keyword, k.category
  FROM keywords k
  WHERE k.is_active = true
  ORDER BY random()
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- 키워드 사용 기록
CREATE OR REPLACE FUNCTION mark_keyword_used(p_keyword TEXT)
RETURNS void AS $$
BEGIN
  UPDATE keywords
  SET 
    used_count = used_count + 1,
    last_collected_at = NOW(),
    updated_at = NOW()
  WHERE keyword = p_keyword;
END;
$$ LANGUAGE plpgsql;

-- 제목에서 키워드 추출
CREATE OR REPLACE FUNCTION extract_keyword_from_title(p_title TEXT)
RETURNS TEXT AS $$
DECLARE
  v_keyword TEXT;
BEGIN
  IF p_title IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- #해시태그 제거
  v_keyword := regexp_replace(p_title, '#[^\s]+', '', 'g');
  -- 괄호 내용 제거
  v_keyword := regexp_replace(v_keyword, '\[[^\]]*\]', '', 'g');
  v_keyword := regexp_replace(v_keyword, '\([^\)]*\)', '', 'g');
  -- 공백 정리
  v_keyword := trim(regexp_replace(v_keyword, '\s+', ' ', 'g'));
  
  IF length(v_keyword) < 3 THEN
    RETURN NULL;
  END IF;
  
  RETURN v_keyword;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 영상 추가 시 키워드 자동 등록
CREATE OR REPLACE FUNCTION auto_create_keyword_from_video()
RETURNS TRIGGER AS $$
DECLARE
  v_keyword TEXT;
BEGIN
  v_keyword := extract_keyword_from_title(NEW.title);
  
  IF v_keyword IS NOT NULL AND length(v_keyword) > 0 THEN
    INSERT INTO keywords (keyword, category, metadata)
    VALUES (
      v_keyword, 
      'auto', 
      jsonb_build_object('source_video_id', NEW.id, 'original_title', NEW.title)
    )
    ON CONFLICT (keyword) DO UPDATE SET
      discovered_count = keywords.discovered_count + 1,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 적용
DROP TRIGGER IF EXISTS video_auto_keyword ON videos;
CREATE TRIGGER video_auto_keyword
  AFTER INSERT ON videos
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_keyword_from_video();

-- ============================================
-- 9. 뷰 (Views)
-- ============================================

-- 콘텐츠 현황 뷰
CREATE OR REPLACE VIEW content_overview AS
SELECT
  (SELECT COUNT(*) FROM videos WHERE status = 'active') AS active_videos,
  (SELECT COUNT(*) FROM videos WHERE status = 'paused') AS paused_videos,
  (SELECT COUNT(*) FROM videos WHERE status = 'completed') AS completed_videos,
  (SELECT SUM(target_views - completed_views) FROM videos WHERE status = 'active') AS remaining_views,
  (SELECT COUNT(*) FROM channels WHERE status = 'active') AS active_channels,
  (SELECT COUNT(*) FROM channels WHERE auto_collect = true) AS auto_collect_channels,
  (SELECT COUNT(*) FROM keywords WHERE is_active = true) AS active_keywords,
  (SELECT COUNT(*) FROM schedules WHERE is_active = true) AS active_schedules;

-- 오늘 통계 뷰
CREATE OR REPLACE VIEW today_stats AS
SELECT
  COALESCE(ds.total_completed, 0) AS completed,
  COALESCE(ds.total_failed, 0) AS failed,
  COALESCE(ds.total_executions, 0) AS total,
  COALESCE(ds.success_rate, 0) AS success_rate,
  COALESCE(ds.total_watch_time_sec, 0) AS watch_time_sec,
  COALESCE(ds.by_hour, '{}'::JSONB) AS by_hour
FROM daily_stats ds
WHERE ds.date = CURRENT_DATE;

-- 대시보드 요약 뷰
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM videos WHERE status = 'active') as active_videos,
  (SELECT COUNT(*) FROM videos WHERE status = 'completed') as completed_videos,
  (SELECT SUM(completed_views) FROM videos) as total_views,
  (SELECT COUNT(*) FROM keywords WHERE is_active = true) as active_keywords,
  (SELECT COUNT(*) FROM schedules WHERE is_active = true) as active_schedules,
  (SELECT COUNT(*) FROM nodes WHERE status = 'online') as online_nodes,
  (SELECT COUNT(*) FROM devices WHERE state = 'IDLE') as idle_devices,
  (SELECT COUNT(*) FROM devices WHERE state = 'RUNNING') as running_devices,
  (SELECT COUNT(*) FROM devices WHERE state IN ('ERROR', 'QUARANTINE')) as problem_devices,
  (SELECT total_completed FROM daily_stats WHERE date = CURRENT_DATE) as today_completed,
  (SELECT total_failed FROM daily_stats WHERE date = CURRENT_DATE) as today_failed;

-- ============================================
-- 10. RLS 정책
-- ============================================

-- 모든 테이블에 RLS 활성화
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_executions ENABLE ROW LEVEL SECURITY;

-- Service role 전체 접근 (backend에서만)
DO $$
BEGIN
  -- videos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'videos' AND policyname = 'Service role full access on videos') THEN
    CREATE POLICY "Service role full access on videos" ON videos FOR ALL USING (auth.role() = 'service_role');
  END IF;
  -- channels
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Service role full access on channels') THEN
    CREATE POLICY "Service role full access on channels" ON channels FOR ALL USING (auth.role() = 'service_role');
  END IF;
  -- keywords
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'keywords' AND policyname = 'Service role full access on keywords') THEN
    CREATE POLICY "Service role full access on keywords" ON keywords FOR ALL USING (auth.role() = 'service_role');
  END IF;
  -- schedules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedules' AND policyname = 'Service role full access on schedules') THEN
    CREATE POLICY "Service role full access on schedules" ON schedules FOR ALL USING (auth.role() = 'service_role');
  END IF;
  -- daily_stats
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_stats' AND policyname = 'Service role full access on daily_stats') THEN
    CREATE POLICY "Service role full access on daily_stats" ON daily_stats FOR ALL USING (auth.role() = 'service_role');
  END IF;
  -- video_executions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_executions' AND policyname = 'Service role full access on video_executions') THEN
    CREATE POLICY "Service role full access on video_executions" ON video_executions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Public/Authenticated 읽기 전용 (Dashboard에서 조회용)
DO $$
BEGIN
  -- videos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'videos' AND policyname = 'Public read videos') THEN
    CREATE POLICY "Public read videos" ON videos FOR SELECT USING (true);
  END IF;
  -- channels
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Public read channels') THEN
    CREATE POLICY "Public read channels" ON channels FOR SELECT USING (true);
  END IF;
  -- keywords
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'keywords' AND policyname = 'Public read keywords') THEN
    CREATE POLICY "Public read keywords" ON keywords FOR SELECT USING (true);
  END IF;
  -- schedules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedules' AND policyname = 'Public read schedules') THEN
    CREATE POLICY "Public read schedules" ON schedules FOR SELECT USING (true);
  END IF;
  -- daily_stats
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_stats' AND policyname = 'Public read daily_stats') THEN
    CREATE POLICY "Public read daily_stats" ON daily_stats FOR SELECT USING (true);
  END IF;
  -- video_executions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_executions' AND policyname = 'Public read video_executions') THEN
    CREATE POLICY "Public read video_executions" ON video_executions FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================
-- 11. Realtime 활성화
-- ============================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE videos;
  ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
  ALTER PUBLICATION supabase_realtime ADD TABLE daily_stats;
  ALTER PUBLICATION supabase_realtime ADD TABLE video_executions;
EXCEPTION WHEN OTHERS THEN
  -- 이미 추가된 경우 무시
  NULL;
END $$;

-- ============================================
-- 12. 초기 데이터
-- ============================================
INSERT INTO schedules (name, description, cron_expression, schedule_type, is_active) VALUES
  ('일일 리셋', '매일 새벽 3시 디바이스 초기화', '0 3 * * *', 'maintenance', true),
  ('오전 시청', '오전 9시~12시 영상 시청', '0 9 * * *', 'video_batch', false),
  ('오후 시청', '오후 14시~18시 영상 시청', '0 14 * * *', 'video_batch', false),
  ('저녁 시청', '저녁 19시~22시 영상 시청', '0 19 * * *', 'video_batch', false)
ON CONFLICT DO NOTHING;

-- ============================================
-- 13. 키워드 자동 추출 (DB 트리거)
-- ============================================

-- videos 테이블에 search_keyword 필드 추가
ALTER TABLE videos ADD COLUMN IF NOT EXISTS search_keyword TEXT;

-- 해시태그 제거 함수
CREATE OR REPLACE FUNCTION extract_search_keyword(p_title TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_title IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- #해시태그 제거, 연속 공백 정리, 앞뒤 공백 제거
  RETURN TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(p_title, '#[^\s]+', '', 'g'),  -- #태그 제거
      '\s+', ' ', 'g'                                -- 연속 공백 → 단일 공백
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- INSERT/UPDATE 트리거: search_keyword가 비어있으면 제목에서 추출
CREATE OR REPLACE FUNCTION auto_fill_search_keyword()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.search_keyword IS NULL OR TRIM(NEW.search_keyword) = '' THEN
    NEW.search_keyword := extract_search_keyword(NEW.title);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_search_keyword ON videos;
CREATE TRIGGER trigger_auto_search_keyword
  BEFORE INSERT OR UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION auto_fill_search_keyword();

-- 인덱스 (검색용)
CREATE INDEX IF NOT EXISTS idx_videos_search_keyword ON videos(search_keyword);

-- ============================================
-- 완료
-- ============================================
COMMENT ON TABLE videos IS '시청할 YouTube 영상 목록';
COMMENT ON TABLE channels IS 'YouTube 채널 관리';
COMMENT ON TABLE keywords IS '검색 키워드 관리';
COMMENT ON TABLE schedules IS '자동 실행 스케줄';
COMMENT ON TABLE daily_stats IS '일일 통계';
COMMENT ON TABLE video_executions IS '영상별 실행 기록';
COMMENT ON COLUMN videos.search_keyword IS '검색용 키워드 (해시태그 제거된 제목)';

-- 뷰 권한
GRANT SELECT ON content_overview TO anon, authenticated;
GRANT SELECT ON today_stats TO anon, authenticated;
GRANT SELECT ON dashboard_summary TO anon, authenticated;
