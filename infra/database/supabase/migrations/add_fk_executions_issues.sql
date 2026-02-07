-- Migration: Add FK relationships for video_executions and device_issues
-- Run in Supabase Dashboard SQL Editor

-- 1. video_executions.video_id → videos.id (TEXT → TEXT)
ALTER TABLE video_executions
  ADD CONSTRAINT fk_video_executions_video_id
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;

-- 2. device_issues.device_id is TEXT but devices.id is UUID
--    Option A: Change device_issues.device_id to reference devices.serial_number
ALTER TABLE device_issues
  ADD CONSTRAINT fk_device_issues_device_serial
  FOREIGN KEY (device_id) REFERENCES devices(serial_number) ON DELETE CASCADE;

-- If Option A fails (serial_number not UNIQUE), run this first:
-- ALTER TABLE devices ADD CONSTRAINT devices_serial_number_unique UNIQUE (serial_number);
-- Then retry the FK above.

-- After running this migration, the PostgREST join syntax will work:
--   video_executions.select('*, videos(title, thumbnail_url, channel_name)')
--   device_issues.select('*, devices(serial_number, name)')
