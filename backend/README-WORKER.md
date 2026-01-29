# PC Worker v5.1 - Execution Guide

## 📋 Overview

PC Worker v5.1 implements all 4 patches from `WORKER_V51_PATCH.md`:
- ✅ Patch 1: job.json file-based parameter passing
- ✅ Patch 2: Unique evidence file paths
- ✅ Patch 3: Completion flag polling
- ✅ Patch 4: Hash-based script deployment

---

## 🎯 Architecture

```
[Supabase] job_assignments (pending)
    │
    ▼ Poll every 5s
[PC Worker]
    │
    ├─► ADB: Deploy job.json to /sdcard/
    ├─► ADB: Deploy bot.js (cached via hash)
    ├─► ADB: Trigger AutoX.js execution
    │
    ▼ Wait for completion flag
[Android Device]
    ├─► AutoX.js: Read /sdcard/job.json
    ├─► AutoX.js: Execute automation
    ├─► AutoX.js: Capture screenshot → /sdcard/evidence/{device}_{job}_{timestamp}.png
    └─► AutoX.js: Write /sdcard/completion_{job}.flag
    │
    ▼ Pull evidence
[PC Worker]
    ├─► ADB: Pull screenshot
    ├─► Supabase Storage: Upload evidence
    └─► Supabase DB: Update job_assignments.screenshot_url
```

---

## ✅ Prerequisites

### 1. Environment Variables

Create `.env` file in `backend/`:

```env
# Supabase Configuration
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key-here

# Worker Configuration (optional)
WORKER_ID=worker-1
DEVICE_SERIAL=AUTO
BOT_SCRIPT_PATH=../mobile-agent/bot.js
POLL_INTERVAL=5000
MAX_CONCURRENT_JOBS=1
```

### 2. Android Device Setup

- **AutoX.js** installed and running
- **USB Debugging** enabled
- **ADB Broadcast Execution** enabled in AutoX.js settings
- Device connected via USB

### 3. Supabase Database

- `job_assignments` table exists (from `supabase-schema.sql`)
- `device-evidence` Storage bucket created (auto-created by worker)

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

Dependencies:
- `@supabase/supabase-js` (installed ✅)
- `ws` (already installed)

### Step 2: Connect Android Device

```bash
# Check device is connected
adb devices

# Expected output:
# List of devices attached
# R28M50BDXYZ    device
```

### Step 3: Start Worker

```bash
# With .env file
node worker.js

# Or with inline env vars
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_KEY="your-key" \
node worker.js
```

---

## 📊 Expected Output

### Startup

```
╔════════════════════════════════════════════════════════════╗
║  PC Worker v5.1 - DoAi.me Device Farm                     ║
╚════════════════════════════════════════════════════════════╝

Worker ID: worker-1
Supabase URL: https://xxx.supabase.co
Bot Script: ../mobile-agent/bot.js
Poll Interval: 5000ms

[Devices] Detecting connected devices...
[Devices] Found 1 device(s):
  - R28M50BDXYZ
[Devices] Auto-selected: R28M50BDXYZ

✅ Worker started - Polling for jobs...
```

### Job Processing

```
═══════════════════════════════════════════════════════════
📋 Processing Job: BTS Dynamite MV
   Assignment ID: 123e4567-e89b-12d3-a456-426614174000
   Device: R28M50BDXYZ
═══════════════════════════════════════════════════════════

[1/7] Claiming job...
[Claim] ✅ Job claimed by R28M50BDXYZ

[2/7] Deploying script...
[ADB] Local script hash: 7f8a9b2c...
[ADB] ✅ Script unchanged, skipping deployment

[3/7] Deploying job config...
[ADB] Job config created: ./temp/R28M50BDXYZ_job_abc123.json
[ADB] Pushing ./temp/R28M50BDXYZ_job_abc123.json → /sdcard/job.json
[ADB] ✅ Push complete
[ADB] ✅ Job config deployed to device

[4/7] Executing bot.js...
[ADB] Executing script: /sdcard/bot.js
[ADB] ✅ Script execution triggered

[5/7] Waiting for completion...
[ADB] Waiting for completion flag: /sdcard/completion_abc123.flag
[ADB] Max wait: 300s, polling every 5s
[ADB] ✅ Completion flag detected
[ADB] Completion status: success

[6/7] Retrieving evidence...
[ADB] Searching for evidence: /sdcard/evidence/R28M50BDXYZ_abc123_*.png
[ADB] Pulling /sdcard/evidence/R28M50BDXYZ_abc123_1738152340000.png → ./evidence/R28M50BDXYZ/abc123.png
[ADB] ✅ Pull complete
[ADB] ✅ Evidence retrieved: ./evidence/R28M50BDXYZ/abc123.png

[7/7] Uploading evidence...
[Upload] Uploading ./evidence/R28M50BDXYZ/abc123.png (234.5 KB)
[Upload] Storage path: evidence/R28M50BDXYZ/abc123.png
[Upload] ✅ Upload complete
[Upload] Public URL: https://xxx.supabase.co/storage/v1/object/public/device-evidence/evidence/R28M50BDXYZ/abc123.png
[Upload] Local file deleted: ./evidence/R28M50BDXYZ/abc123.png
[Upload] Updating assignment 123e4567-e89b-12d3-a456-426614174000 with screenshot URL
[Upload] ✅ Assignment updated
[Upload] ✅ Evidence processing complete

✅ Job completed successfully
   Screenshot: https://xxx.supabase.co/storage/v1/object/public/device-evidence/evidence/R28M50BDXYZ/abc123.png

📊 Total time: 125s
```

---

## 🐛 Troubleshooting

### Error: "No Android devices connected"

**Solution:**
```bash
# Check ADB connection
adb devices

# If device not listed:
# 1. Enable USB Debugging on device
# 2. Reconnect USB cable
# 3. Accept "Allow USB debugging" prompt on device
```

### Error: "AutoX.js broadcast failed"

**Solution:**
1. Open AutoX.js app on device
2. Go to Settings → Advanced Settings
3. Enable **"ADB Broadcast Execution"**
4. Enable **Accessibility Service**

### Error: "No evidence file found"

**Possible causes:**
1. bot.js crashed during execution
2. Screenshot capture failed (permissions)
3. File path mismatch

**Debug:**
```bash
# Check device files
adb -s <DEVICE_SERIAL> shell ls /sdcard/evidence/
adb -s <DEVICE_SERIAL> shell ls /sdcard/completion_*.flag

# Check AutoX.js logs
adb -s <DEVICE_SERIAL> logcat | grep AutoX
```

### Error: "Job timeout after 300s"

**Possible causes:**
1. bot.js execution took longer than 5 minutes
2. bot.js crashed without writing completion flag
3. Network issues (YouTube not loading)

**Solution:**
1. Increase timeout: Set env var `MAX_WAIT_SEC=600` (10 minutes)
2. Check device screen for errors
3. Pull AutoX.js logs

---

## 📁 File Structure

```
backend/
├── worker.js                  # Main worker process
├── adb-controller.js          # ADB command wrapper
├── evidence-uploader.js       # Supabase Storage uploader
├── run-preflight.js           # Pre-flight test runner
├── temp/                      # Temporary job.json files
└── evidence/                  # Downloaded screenshots (temp)
    └── <DEVICE_SERIAL>/
        └── <JOB_ID>.png

mobile-agent/
└── bot.js                     # AutoX.js automation script (v2.1)
```

---

## 🔧 Advanced Configuration

### Multiple Devices

Edit `.env`:
```env
DEVICE_SERIAL=R28M50BDXYZ,R28M60CFABC
MAX_CONCURRENT_JOBS=2
```

Worker will distribute jobs across both devices.

### Custom Script Path

If bot.js is in a different location:
```env
BOT_SCRIPT_PATH=/path/to/custom/bot.js
```

### Faster Polling

For lower latency (higher CPU usage):
```env
POLL_INTERVAL=2000  # 2 seconds
```

---

## 🧪 Testing Worker v5.1

### Test 1: job.json Loading

Create test job manually:
```bash
# Create test job.json
echo '{
  "job_id": "test-001",
  "assignment_id": "test-assignment-001",
  "device_id": "R28M50BDXYZ",
  "keyword": "BTS Dynamite",
  "target_title": "Official MV",
  "duration_min_pct": 30,
  "duration_max_pct": 90,
  "base_duration_sec": 60,
  "prob_like": 50,
  "prob_comment": 30,
  "prob_subscribe": 10
}' > ./temp/test_job.json

# Push to device
adb push ./temp/test_job.json /sdcard/job.json

# Trigger bot.js manually
adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/bot.js"

# Check if bot.js loaded job.json
adb logcat | grep "Parameters loaded from job.json"
```

**Expected**: `✅ [v5.1] Parameters loaded from job.json`

### Test 2: Unique Evidence Paths

Run 3 jobs in parallel, verify no file collisions:
```bash
# Each job should create unique evidence file
# Expected pattern: /sdcard/evidence/{device}_{job}_{timestamp}.png
```

### Test 3: Completion Flag

After job finishes:
```bash
adb shell cat /sdcard/completion_test-001.flag
```

**Expected output:**
```json
{
  "status": "success",
  "job_id": "test-001",
  "completed_at": "2026-01-29T12:30:00.000Z",
  "screenshot_path": "/sdcard/evidence/R28M50BDXYZ_test-001_1738152340000.png",
  "error": null
}
```

---

## 🎯 Next Steps

After Worker v5.1 is running:

1. ✅ **Verify Patches**
   - Check job.json is created and pushed
   - Verify unique evidence filenames
   - Confirm completion flags appear

2. 🚀 **Run Pre-Flight**
   ```bash
   node run-preflight.js
   ```
   - Validates AutoX.js WebView compatibility
   - Tests module loading

3. 🏗️ **Phase 1: WebView Migration**
   - Implement `webview_bot.js` (WebView-based automation)
   - Replace Native YouTube app control with DOM manipulation

---

## 📞 Support

**Common Issues:**
- ADB connection: Check USB cable, USB Debugging enabled
- AutoX.js not responding: Restart AutoX.js app, check Accessibility Service
- Supabase errors: Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct

**Logs:**
- Worker logs: Console output
- AutoX.js logs: `adb logcat | grep AutoX`
- ADB logs: `adb logcat | grep adb`

---

**Version**: v5.1
**Last Updated**: 2026-01-29
**Author**: Axon (Implementation Engineer)
