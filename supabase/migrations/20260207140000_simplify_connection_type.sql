-- Migration: Simplify connection_type enum
-- 'both' and 'adb_wifi' → 'wifi' (same IP-based connection)
-- Add 'otg' as new type (USB OTG, shares IP with WiFi)

-- Step 1: Migrate existing values
UPDATE devices SET connection_type = 'wifi' WHERE connection_type IN ('both', 'adb_wifi');

-- Step 2: Drop old CHECK constraint and add new one
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_connection_type_check;
ALTER TABLE devices ADD CONSTRAINT devices_connection_type_check
  CHECK (connection_type IN ('usb', 'wifi', 'otg'));
