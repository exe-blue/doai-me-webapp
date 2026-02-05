-- =============================================
-- 콘텐츠 및 통계 테이블 마이그레이션
-- 2026-02-05
-- =============================================

-- =============================================
-- 1. 영상 테이블 (videos)
-- jobs에서 분리하여 영상 단위 관리
-- =============================================

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                    -- YouTube Video ID
  title TEXT,
  channel_id TEXT,
  channel_name TEXT,
  thumbnail_url TEXT,
  duration_sec INT,
  target_views INT DEFAULT 100,
  completed_views INT DEFAULT 0,
  failed_views INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  watch_duration_sec INT DEFAULT 60,
  tags TEXT[],                            -- 분류 태그
  metadata JSONB DEFAULT '{}',
  last_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_priority ON videos(priority, status);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

-- RLS
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'videos' AND policyname = 'Service role full access on videos') THEN
    CREATE POLICY "Service role full access on videos" ON videos FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'videos' AND policyname = 'Public read videos') THEN
    CREATE POLICY "Public read videos" ON videos FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 2. 채널 테이블 (channels)
-- =============================================

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,                    -- YouTube Channel ID
  name TEXT NOT NULL,
  thumbnail_url TEXT,
  subscriber_count INT,
  video_count INT DEFAULT 0,
  total_views INT DEFAULT 0,
  category TEXT,
  is_monitored BOOLEAN DEFAULT false,     -- 새 영상 모니터링 여부
  last_video_check_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_monitored ON channels(is_monitored) WHERE is_monitored = true;
CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category);

-- RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Service role full access on channels') THEN
    CREATE POLICY "Service role full access on channels" ON channels FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Public read channels') THEN
    CREATE POLICY "Public read channels" ON channels FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 3. 키워드 테이블 (keywords)
-- =============================================

CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  discovered_count INT DEFAULT 0,         -- 이 키워드로 발견된 영상 수
  used_count INT DEFAULT 0,               -- 검색에 사용된 횟수
  last_collected_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);

-- RLS
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'keywords' AND policyname = 'Service role full access on keywords') THEN
    CREATE POLICY "Service role full access on keywords" ON keywords FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'keywords' AND policyname = 'Public read keywords') THEN
    CREATE POLICY "Public read keywords" ON keywords FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 4. 스케줄 테이블 (schedules)
-- =============================================

CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,          -- "0 9 * * *" (매일 09:00)
  workflow_id TEXT,
  video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  params JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  run_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,                       -- 'success' | 'failed' | 'partial'
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active, next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);

-- RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedules' AND policyname = 'Service role full access on schedules') THEN
    CREATE POLICY "Service role full access on schedules" ON schedules FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedules' AND policyname = 'Public read schedules') THEN
    CREATE POLICY "Public read schedules" ON schedules FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 5. 일일 통계 테이블 (daily_stats)
-- =============================================

CREATE TABLE IF NOT EXISTS daily_stats (
  date DATE PRIMARY KEY,
  total_completed INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  total_watch_time_sec BIGINT DEFAULT 0,
  unique_devices INT DEFAULT 0,
  unique_videos INT DEFAULT 0,
  by_hour JSONB DEFAULT '{}',             -- {"9": 234, "10": 345}
  by_node JSONB DEFAULT '{}',             -- {"node_1": 1234}
  by_video JSONB DEFAULT '{}',            -- {"video_id": count}
  by_workflow JSONB DEFAULT '{}',         -- {"workflow_id": count}
  error_summary JSONB DEFAULT '{}',       -- {"error_type": count}
  peak_hour INT,
  avg_completion_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- RLS
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_stats' AND policyname = 'Service role full access on daily_stats') THEN
    CREATE POLICY "Service role full access on daily_stats" ON daily_stats FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_stats' AND policyname = 'Public read daily_stats') THEN
    CREATE POLICY "Public read daily_stats" ON daily_stats FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================
-- 6. 실행 로그 테이블 (execution_logs) 확장
-- =============================================

-- 기존 execution_logs 테이블에 컬럼 추가 (있으면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_logs' AND column_name = 'video_id') THEN
    ALTER TABLE execution_logs ADD COLUMN video_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_logs' AND column_name = 'watch_duration_sec') THEN
    ALTER TABLE execution_logs ADD COLUMN watch_duration_sec INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_logs' AND column_name = 'error_category') THEN
    ALTER TABLE execution_logs ADD COLUMN error_category TEXT;
  END IF;
END $$;

-- =============================================
-- 7. 유틸리티 함수
-- =============================================

-- 일일 통계 업데이트 함수
CREATE OR REPLACE FUNCTION update_daily_stats(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
  stats_record RECORD;
BEGIN
  -- 해당 날짜의 통계 계산
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COALESCE(SUM(CASE WHEN status = 'completed' THEN 
      EXTRACT(EPOCH FROM (completed_at - started_at))::INT 
    END), 0) as watch_time,
    COUNT(DISTINCT device_id) as unique_devices,
    COUNT(DISTINCT video_id) as unique_videos
  INTO stats_record
  FROM workflow_executions
  WHERE DATE(created_at) = target_date;

  -- UPSERT
  INSERT INTO daily_stats (
    date, total_completed, total_failed, total_watch_time_sec,
    unique_devices, unique_videos, updated_at
  ) VALUES (
    target_date, 
    stats_record.completed, 
    stats_record.failed, 
    stats_record.watch_time,
    stats_record.unique_devices,
    stats_record.unique_videos,
    NOW()
  )
  ON CONFLICT (date) DO UPDATE SET
    total_completed = EXCLUDED.total_completed,
    total_failed = EXCLUDED.total_failed,
    total_watch_time_sec = EXCLUDED.total_watch_time_sec,
    unique_devices = EXCLUDED.unique_devices,
    unique_videos = EXCLUDED.unique_videos,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 영상 완료 카운트 증가 함수
CREATE OR REPLACE FUNCTION increment_video_views(vid TEXT, success BOOLEAN)
RETURNS void AS $$
BEGIN
  IF success THEN
    UPDATE videos SET 
      completed_views = completed_views + 1,
      updated_at = NOW()
    WHERE id = vid;
  ELSE
    UPDATE videos SET 
      failed_views = failed_views + 1,
      updated_at = NOW()
    WHERE id = vid;
  END IF;
  
  -- target 달성 시 상태 변경
  UPDATE videos SET 
    status = 'completed',
    updated_at = NOW()
  WHERE id = vid 
    AND completed_views >= target_views 
    AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- 다음 스케줄 실행 시간 계산 (cron 파싱 - 간단 버전)
-- Note: This is a simplified cron parser that handles common patterns.
-- For full cron support, consider using pg_cron extension or computing in application code.
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr TEXT, from_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ AS $$
DECLARE
  parts TEXT[];
  minute_part TEXT;
  hour_part TEXT;
  day_of_month_part TEXT;
  month_part TEXT;
  day_of_week_part TEXT;
  next_time TIMESTAMPTZ;
  check_time TIMESTAMPTZ;
  max_iterations INT := 366;  -- Max days to search forward
  i INT := 0;
BEGIN
  -- Parse cron expression (minute hour day_of_month month day_of_week)
  -- Example: "0 9 * * *" -> 09:00 every day
  parts := string_to_array(cron_expr, ' ');
  
  -- Validate cron expression has 5 parts
  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 5 THEN
    RAISE WARNING 'Invalid cron expression: %. Expected 5 parts (min hour dom mon dow)', cron_expr;
    -- Return NULL to indicate invalid expression rather than bogus time
    RETURN NULL;
  END IF;
  
  minute_part := parts[1];
  hour_part := parts[2];
  day_of_month_part := parts[3];
  month_part := parts[4];
  day_of_week_part := parts[5];
  
  -- Handle simple cases: wildcards for day/month/dow (run every day at specific time)
  IF day_of_month_part = '*' AND month_part = '*' AND day_of_week_part = '*' THEN
    -- Simple daily schedule
    IF minute_part = '*' THEN
      minute_part := '0';
    END IF;
    IF hour_part = '*' THEN
      hour_part := '0';
    END IF;
    
    -- Calculate next occurrence
    next_time := DATE_TRUNC('day', from_time) + 
                 (hour_part::INT || ' hours')::INTERVAL + 
                 (minute_part::INT || ' minutes')::INTERVAL;
    
    -- If already passed today, schedule for tomorrow
    IF next_time <= from_time THEN
      next_time := next_time + INTERVAL '1 day';
    END IF;
    
    RETURN next_time;
  END IF;
  
  -- For more complex cron expressions (specific days, months, day-of-week),
  -- iterate through days to find the next matching time
  check_time := DATE_TRUNC('minute', from_time) + INTERVAL '1 minute';
  
  WHILE i < max_iterations LOOP
    -- Check if this day matches the cron pattern
    -- Day of month check
    IF day_of_month_part != '*' AND 
       EXTRACT(DAY FROM check_time)::TEXT != day_of_month_part THEN
      check_time := DATE_TRUNC('day', check_time) + INTERVAL '1 day';
      i := i + 1;
      CONTINUE;
    END IF;
    
    -- Month check
    IF month_part != '*' AND 
       EXTRACT(MONTH FROM check_time)::TEXT != month_part THEN
      check_time := DATE_TRUNC('day', check_time) + INTERVAL '1 day';
      i := i + 1;
      CONTINUE;
    END IF;
    
    -- Day of week check (0-6, Sunday=0)
    IF day_of_week_part != '*' AND 
       EXTRACT(DOW FROM check_time)::TEXT != day_of_week_part THEN
      check_time := DATE_TRUNC('day', check_time) + INTERVAL '1 day';
      i := i + 1;
      CONTINUE;
    END IF;
    
    -- Found a matching day, now set the time
    IF minute_part = '*' THEN
      minute_part := '0';
    END IF;
    IF hour_part = '*' THEN
      hour_part := '0';
    END IF;
    
    next_time := DATE_TRUNC('day', check_time) + 
                 (hour_part::INT || ' hours')::INTERVAL + 
                 (minute_part::INT || ' minutes')::INTERVAL;
    
    -- Make sure it's in the future
    IF next_time > from_time THEN
      RETURN next_time;
    END IF;
    
    -- Move to next day
    check_time := DATE_TRUNC('day', check_time) + INTERVAL '1 day';
    i := i + 1;
  END LOOP;
  
  -- Could not find next run within max_iterations
  RAISE WARNING 'Could not calculate next run for cron expression: % within % days', cron_expr, max_iterations;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 8. 트리거
-- =============================================

-- updated_at 자동 업데이트
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_keywords_updated_at BEFORE UPDATE ON keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_daily_stats_updated_at BEFORE UPDATE ON daily_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 9. Realtime 활성화
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE videos;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_stats;

-- =============================================
-- 10. 뷰: 대시보드 요약
-- =============================================

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

-- 뷰에 대한 접근 권한
GRANT SELECT ON dashboard_summary TO anon, authenticated;

COMMENT ON TABLE videos IS '영상 관리 테이블 - YouTube 영상 단위 작업 관리';
COMMENT ON TABLE channels IS '채널 관리 테이블 - YouTube 채널 모니터링';
COMMENT ON TABLE keywords IS '키워드 관리 테이블 - 검색 키워드';
COMMENT ON TABLE schedules IS '스케줄 관리 테이블 - 정기 작업 스케줄';
COMMENT ON TABLE daily_stats IS '일일 통계 테이블 - 일별 집계 데이터';

-- =============================================
-- 11. 키워드 자동 생성 함수
-- =============================================

-- 제목에서 키워드 추출 (해시태그 제외)
-- 예시: "아이폰 16 프로 리뷰 #apple #iphone16 #테크" -> "아이폰 16 프로 리뷰"
CREATE OR REPLACE FUNCTION extract_keyword_from_title(p_title TEXT)
RETURNS TEXT AS $$
DECLARE
  v_keyword TEXT;
BEGIN
  -- NULL 체크
  IF p_title IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- 1. #해시태그 제거
  v_keyword := regexp_replace(p_title, '#[^\s]+', '', 'g');
  
  -- 2. 특수문자 정리 (괄호 내용 등)
  v_keyword := regexp_replace(v_keyword, '\[[^\]]*\]', '', 'g');  -- [대괄호 내용] 제거
  v_keyword := regexp_replace(v_keyword, '\([^\)]*\)', '', 'g');  -- (소괄호 내용) 제거
  
  -- 3. 앞뒤 공백 제거, 연속 공백을 단일 공백으로
  v_keyword := trim(regexp_replace(v_keyword, '\s+', ' ', 'g'));
  
  -- 4. 너무 짧은 키워드는 NULL 반환
  IF length(v_keyword) < 3 THEN
    RETURN NULL;
  END IF;
  
  RETURN v_keyword;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 영상 추가 시 키워드 자동 등록 트리거 함수
CREATE OR REPLACE FUNCTION auto_create_keyword_from_video()
RETURNS TRIGGER AS $$
DECLARE
  v_keyword TEXT;
BEGIN
  -- 제목에서 키워드 추출
  v_keyword := extract_keyword_from_title(NEW.title);
  
  -- 비어있지 않으면 keywords 테이블에 추가 (중복 무시)
  IF v_keyword IS NOT NULL AND length(v_keyword) > 0 THEN
    INSERT INTO keywords (keyword, category, metadata)
    VALUES (
      v_keyword, 
      'auto', 
      jsonb_build_object(
        'source_video_id', NEW.id, 
        'original_title', NEW.title,
        'created_from', 'video_trigger'
      )
    )
    ON CONFLICT (keyword) DO UPDATE SET
      -- 이미 존재하면 discovered_count 증가
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

-- =============================================
-- 12. 키워드 검색 유틸리티 함수
-- =============================================

-- 활성 키워드 중 랜덤하게 N개 선택
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

-- 키워드 사용 횟수 증가
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

-- 키워드로 발견된 영상 수 증가
CREATE OR REPLACE FUNCTION increment_keyword_discovered(p_keyword TEXT, p_count INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE keywords
  SET 
    discovered_count = discovered_count + p_count,
    last_collected_at = NOW(),
    updated_at = NOW()
  WHERE keyword = p_keyword;
END;
$$ LANGUAGE plpgsql;
