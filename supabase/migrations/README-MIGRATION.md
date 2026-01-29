# Database Migration Guide - BE-02

## 📋 Migration: 002_enhance_devices_schema

**Purpose**: Enhance devices table with management number and telemetry data

**Date**: 2026-01-29
**Author**: Axon (BE-02)

---

## 🎯 Changes Summary

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `management_number` | TEXT | Logical identifier | `P00-B01-S01` |
| `model_name` | TEXT | Device model | `SM-G973F` |
| `battery_level` | INTEGER (0-100) | Battery percentage | `85` |

---

## 📊 Before & After Schema

### Before (Original)
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  serial_number TEXT NOT NULL UNIQUE,
  pc_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT 'P1-G1',
  status TEXT NOT NULL DEFAULT 'idle',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

### After (Enhanced)
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  serial_number TEXT NOT NULL UNIQUE,
  management_number TEXT,               -- NEW
  pc_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT 'P1-G1',
  model_name TEXT,                      -- NEW
  battery_level INTEGER CHECK (0-100),  -- NEW
  status TEXT NOT NULL DEFAULT 'idle',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

---

## 🚀 Execution Steps

### Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project: **DoAi.me Device Farm**
3. Navigate to: **SQL Editor** (left sidebar)

---

### Step 2: Execute Migration

Copy and paste the contents of `002_enhance_devices_schema.sql`:

```bash
cat supabase/migrations/002_enhance_devices_schema.sql
```

Click **Run** in Supabase SQL Editor.

---

### Step 3: Verify Migration

Run this verification query:

```sql
-- Check new columns exist
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'devices'
  AND column_name IN ('management_number', 'model_name', 'battery_level')
ORDER BY column_name;
```

**Expected Output**:
```
column_name         | data_type | column_default | is_nullable
--------------------|-----------|----------------|-------------
battery_level       | integer   | null           | YES
management_number   | text      | null           | YES
model_name          | text      | null           | YES
```

---

### Step 4: Test Insert

```sql
-- Insert test device
INSERT INTO devices (serial_number, management_number, pc_id, model_name, battery_level, status)
VALUES ('TEST123456', 'P00-B01-S99', 'PC-TEST', 'SM-TEST', 75, 'idle')
ON CONFLICT (serial_number) DO UPDATE
SET
  management_number = EXCLUDED.management_number,
  model_name = EXCLUDED.model_name,
  battery_level = EXCLUDED.battery_level;

-- Verify insert
SELECT serial_number, management_number, model_name, battery_level, status
FROM devices
WHERE serial_number = 'TEST123456';
```

**Expected**:
```
serial_number | management_number | model_name | battery_level | status
--------------|-------------------|------------|---------------|-------
TEST123456    | P00-B01-S99       | SM-TEST    | 75            | idle
```

---

### Step 5: Cleanup Test Data

```sql
DELETE FROM devices WHERE serial_number = 'TEST123456';
```

---

## 🔄 Rollback (If Needed)

If you need to undo this migration:

```sql
ALTER TABLE devices DROP COLUMN IF EXISTS management_number;
ALTER TABLE devices DROP COLUMN IF EXISTS model_name;
ALTER TABLE devices DROP COLUMN IF EXISTS battery_level;
DROP INDEX IF EXISTS idx_devices_management_number;
```

---

## ✅ Post-Migration Checklist

- [ ] Migration executed successfully in Supabase SQL Editor
- [ ] Verification query shows 3 new columns
- [ ] Test insert/update works
- [ ] Test data cleaned up
- [ ] Worker v5.1 ready to collect telemetry (Step 3)

---

## 📞 Next Steps

After migration completes:
1. ✅ Deploy Worker v5.1 with telemetry (Step 3)
2. ✅ Worker will auto-populate `model_name` and `battery_level`
3. ✅ Dashboard can display device telemetry

---

## 🐛 Troubleshooting

### Error: "column already exists"

**Cause**: Migration already run previously

**Solution**: Safe to ignore - migration is idempotent (uses `IF NOT EXISTS`)

### Error: "permission denied"

**Cause**: Insufficient privileges

**Solution**: Use Supabase Service Role Key or run via SQL Editor (authenticated)

### Error: "check constraint violated"

**Cause**: battery_level value outside 0-100 range

**Solution**: Ensure Worker sends valid battery percentage

---

**Status**: ✅ Migration Ready to Execute
**Estimated Time**: 2-3 minutes
