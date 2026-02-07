-- Migration: Add FK relationships for video_executions and device_issues

-- 1. Ensure devices.serial_number has a UNIQUE constraint (needed for FK reference)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'devices'::regclass
    AND contype = 'u'
    AND conname = 'devices_serial_number_unique'
  ) THEN
    ALTER TABLE devices ADD CONSTRAINT devices_serial_number_unique UNIQUE (serial_number);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. video_executions.video_id → videos.id (TEXT → TEXT)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_video_executions_video_id'
  ) THEN
    ALTER TABLE video_executions
      ADD CONSTRAINT fk_video_executions_video_id
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. device_issues.device_id → devices.serial_number (TEXT → TEXT)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_device_issues_device_serial'
  ) THEN
    ALTER TABLE device_issues
      ADD CONSTRAINT fk_device_issues_device_serial
      FOREIGN KEY (device_id) REFERENCES devices(serial_number) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
