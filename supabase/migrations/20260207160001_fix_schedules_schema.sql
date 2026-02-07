-- Migration: Fix schedules table schema to match frontend expectations
-- The DB had: schedule_type CHECK(workflow, video_batch, ...) + cron_expression NOT NULL
-- Frontend expects: schedule_type CHECK(interval, cron, once) + interval_minutes + target_type + task_config

-- 1. Drop old schedule_type CHECK and update values
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_schedule_type_check;

-- Migrate existing schedule_type values to new enum
UPDATE schedules SET schedule_type = 'cron' WHERE schedule_type IN ('workflow', 'video_batch', 'channel_collect', 'keyword_collect', 'maintenance');
UPDATE schedules SET schedule_type = 'interval' WHERE schedule_type IS NULL;

ALTER TABLE schedules ADD CONSTRAINT schedules_schedule_type_check
    CHECK (schedule_type IN ('interval', 'cron', 'once'));

ALTER TABLE schedules ALTER COLUMN schedule_type SET DEFAULT 'interval';

-- 2. Make cron_expression nullable (not needed for interval/once types)
ALTER TABLE schedules ALTER COLUMN cron_expression DROP NOT NULL;

-- 3. Add new columns for frontend support
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS interval_minutes INT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'all_videos'
    CHECK (target_type IN ('all_videos', 'by_channel', 'by_keyword', 'specific_videos'));
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS target_ids TEXT[];
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS task_config JSONB DEFAULT '{}';

-- 4. Migrate old params/batch_size/max_concurrent into task_config
UPDATE schedules SET task_config = jsonb_build_object(
    'batch_size', COALESCE(batch_size, 100),
    'max_concurrent', COALESCE(max_concurrent, 50),
    'priority', 'normal',
    'distribute_evenly', true
) WHERE task_config IS NULL OR task_config = '{}';

-- 5. Drop deprecated columns (keep for safety, just mark nullable)
-- workflow_id, video_id, video_filter, batch_size, max_concurrent, params, last_status
-- Not dropping yet to avoid data loss — they will be ignored by frontend
