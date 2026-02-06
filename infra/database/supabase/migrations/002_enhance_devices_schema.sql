-- =============================================
-- Migration: 002_enhance_devices_schema
-- Purpose: Enhance devices table with management number and telemetry
-- Author: Axon (BE-02)
-- Date: 2026-01-29
-- =============================================

-- =============================================
-- 1. Add new columns to devices table
-- =============================================

-- Add management_number column (logical identifier)
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS management_number TEXT;

-- Add model_name column (device model)
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Add battery_level column (battery percentage)
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS battery_level INTEGER
CHECK (battery_level >= 0 AND battery_level <= 100);

-- Add comment for documentation
COMMENT ON COLUMN devices.management_number IS 'Logical management identifier (e.g., P00-B01-S01)';
COMMENT ON COLUMN devices.model_name IS 'Device model name from adb devices -l';
COMMENT ON COLUMN devices.battery_level IS 'Battery level percentage (0-100)';

-- =============================================
-- 2. Create index for management_number
-- =============================================

CREATE INDEX IF NOT EXISTS idx_devices_management_number
ON devices(management_number);

-- =============================================
-- 3. Update existing records (optional - set defaults)
-- =============================================

-- Set default management_number for existing devices
-- Format: AUTO-{first 8 chars of serial}
UPDATE devices
SET management_number = 'AUTO-' || SUBSTRING(serial_number, 1, 8)
WHERE management_number IS NULL;

-- =============================================
-- 4. Schema validation query
-- =============================================

-- Verify new columns exist
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'devices'
  AND column_name IN ('management_number', 'model_name', 'battery_level')
ORDER BY column_name;

-- =============================================
-- 5. Sample data for testing (commented out)
-- =============================================

/*
-- Example: Insert test device
INSERT INTO devices (serial_number, management_number, pc_id, model_name, battery_level, status)
VALUES
    ('R28M50BDXYZ', 'P00-B01-S01', 'PC-01', 'SM-G973F', 85, 'idle'),
    ('R28M60CFABC', 'P00-B01-S02', 'PC-01', 'SM-G973F', 92, 'idle');

-- Verify inserted data
SELECT serial_number, management_number, model_name, battery_level, status
FROM devices;
*/

-- =============================================
-- Migration Notes
-- =============================================

-- This migration is IDEMPOTENT - safe to run multiple times
-- - Uses IF NOT EXISTS for columns
-- - Uses IF NOT EXISTS for indexes
-- - UPDATE only affects rows where management_number IS NULL

-- Rollback (if needed):
/*
ALTER TABLE devices DROP COLUMN IF EXISTS management_number;
ALTER TABLE devices DROP COLUMN IF EXISTS model_name;
ALTER TABLE devices DROP COLUMN IF EXISTS battery_level;
DROP INDEX IF EXISTS idx_devices_management_number;
*/

-- =============================================
-- End of Migration
-- =============================================
