# Pre-Flight Test Execution Guide

## Overview

The Pre-Flight test validates the complete Worker v5.1 + WebView Bot integration before production deployment. It executes 4 critical checkpoints with detailed diagnostics.

**Execution Time**: ~3-5 minutes
**Prerequisites**:
- 1 Android device with AutoX.js installed
- ADB configured
- Supabase accessible
- Node.js installed

---

## Prerequisites Checklist

### 1. Android Device Setup

- [ ] AutoX.js app installed on device
- [ ] USB debugging enabled (Settings → Developer Options → USB Debugging)
- [ ] Device connected via USB cable
- [ ] Device authorized for debugging (accept USB debugging prompt on device)

### 2. PC Setup

- [ ] ADB installed (executable at `C:\Users\ChoiJoonho\adb.exe` or set `ADB_PATH` environment variable)
- [ ] Node.js installed (v14 or higher)
- [ ] Dependencies installed (`npm install` in `doai-me-webapp/`)

### 3. Environment Configuration

- [ ] `.env` file exists in `doai-me-webapp/` with valid Supabase credentials
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set

---

## Verification Steps

### Verify ADB Connection

```bash
cd C:\Users\ChoiJoonho
./adb.exe devices
```

**Expected Output**:
```
List of devices attached
ABC123456789    device
```

If you see "unauthorized" or no devices, check USB debugging settings on the device.

### Verify AutoX.js Installation

```bash
./adb.exe shell pm list packages | grep autojs
```

**Expected Output**:
```
package:org.autojs.autojs
```

If not found, install AutoX.js from the APK.

---

## Running the Pre-Flight Test

### Step 1: Navigate to Project Directory

```bash
cd doai-me-webapp
```

### Step 2: Execute Pre-Flight Test

```bash
node run-preflight.js
```

### Step 3: Monitor Output

The test will execute 4 checkpoints sequentially:

**Expected Output** (Success):
```
🚀 Pre-Flight Test - Worker v5.1 + WebView Bot

📋 Setup Phase...
✓ Device detected: ABC123456789
✓ Logcat capture started
   Logcat output: .preflight/logs/logcat_2026-01-29T13-45-00.txt
✓ Old test files cleaned

📁 Checkpoint 1: File Sync Validation...
   Deploying bot files...
   ✓ client-mobile/bot-webview-autojs.js → /sdcard/Scripts/webview_bot.js
   ✓ client-mobile/config.json → /sdcard/Scripts/config.json
   ✓ client-mobile/selectors.json → /sdcard/Scripts/selectors.json
   ✓ client-mobile/modules/webview-setup.js → /sdcard/Scripts/modules/webview-setup.js
   ✓ client-mobile/modules/dom-control.js → /sdcard/Scripts/modules/dom-control.js
   ✓ client-mobile/modules/search-flow.js → /sdcard/Scripts/modules/search-flow.js
   ✓ test_job.json created
   ✓ job.json pushed to device
   ✓ Verified: /sdcard/Scripts/webview_bot.js
   ✓ Verified: /sdcard/Scripts/config.json
   ✓ Verified: /sdcard/Scripts/selectors.json
   ✓ Verified: /sdcard/Scripts/modules/webview-setup.js
   ✓ Verified: /sdcard/Scripts/modules/dom-control.js
   ✓ Verified: /sdcard/Scripts/modules/search-flow.js
   ✓ Verified: /sdcard/job.json
✅ Checkpoint 1 PASSED (2543ms)

📡 Checkpoint 2: Intent Broadcast Validation...
   Executing ADB broadcast...
   ✓ Broadcast sent
   Waiting for bot startup log...
   ✓ Bot startup confirmed
   ✓ Bot process verified
✅ Checkpoint 2 PASSED (3812ms)

🌐 Checkpoint 3: WebView Injection Validation...
   Waiting for WebView init...
   ✓ WebView initialized
   Waiting for search execution...
   ✓ Search executed
   ✓ No DOM selector errors
✅ Checkpoint 3 PASSED (15234ms)

📸 Checkpoint 4: Evidence Path Validation...
   Waiting for screenshot save...
   ✓ Screenshot saved
   Waiting for flag file creation...
   ✓ Flag file created
   ✓ Evidence file exists on device
   ✓ Evidence pulled to .preflight/evidence/test_evidence.png
   ✓ File size: 345.67 KB
✅ Checkpoint 4 PASSED (8912ms)

🧹 Cleanup...
✓ Logcat capture stopped
✓ Test files cleaned from device

==================================================
📊 PRE-FLIGHT TEST RESULTS
==================================================

1. File Sync: ✅ PASS (2543ms)
2. Intent Broadcast: ✅ PASS (3812ms)
3. WebView Injection: ✅ PASS (15234ms)
4. Evidence Path: ✅ PASS (8912ms)

==================================================
🎉 ALL CHECKPOINTS PASSED - Ready for deployment!
==================================================
```

---

## Checkpoint Details

### Checkpoint 1: File Sync Validation
- **Purpose**: Verify bot files deploy correctly to device
- **Success Criteria**: All bot files and job.json exist on device
- **Duration**: ~2-3 seconds

### Checkpoint 2: Intent Broadcast Validation
- **Purpose**: Verify ADB can trigger bot execution
- **Success Criteria**: Bot process starts and logs startup message
- **Duration**: ~3-5 seconds

### Checkpoint 3: WebView Injection Validation
- **Purpose**: Verify WebView initializes and DOM control works
- **Success Criteria**: WebView loads, search executes, no selector errors
- **Duration**: ~15-20 seconds (longest checkpoint)

### Checkpoint 4: Evidence Path Validation
- **Purpose**: Verify screenshot capture and file transfer
- **Success Criteria**: Screenshot saved on device, pulled to PC, file size > 1KB
- **Duration**: ~8-10 seconds

---

## Troubleshooting

### Checkpoint 1 Fails

**Error**: "Local file not found"
- **Cause**: Missing bot files in `client-mobile/`
- **Fix**: Ensure all bot files exist in `client-mobile/` directory

**Error**: "File not found: /sdcard/Scripts/..."
- **Cause**: ADB push failed
- **Fix**: Check device storage space, ensure USB connection is stable

### Checkpoint 2 Fails

**Error**: "Bot startup log not detected within 60 seconds"
- **Cause**: AutoX.js not installed or broadcast intent incorrect
- **Fix**: Install AutoX.js, verify package name with `adb shell pm list packages | grep autojs`

**Error**: "Bot process not running"
- **Cause**: Bot crashed on startup
- **Fix**: Check logcat file in `.preflight/logs/` for error messages

### Checkpoint 3 Fails

**Error**: "WebView initialization not detected within 45 seconds"
- **Cause**: YouTube app not opening or WebView disabled
- **Fix**: Manually open YouTube app to verify it works, check app permissions

**Error**: "DOM selector errors: ..."
- **Cause**: YouTube DOM structure changed
- **Fix**: Update `client-mobile/selectors.json` with current YouTube selectors

### Checkpoint 4 Fails

**Error**: "Screenshot save not detected within 30 seconds"
- **Cause**: Screenshot API failed or permissions denied
- **Fix**: Grant AutoX.js all required permissions (Storage, Accessibility, Display over other apps)

**Error**: "Evidence file too small: X bytes"
- **Cause**: Screenshot captured blank screen
- **Fix**: Check if YouTube video is actually playing during capture

---

## Output Files

After test execution, the following files are created:

### Logs Directory: `.preflight/logs/`
- `logcat_TIMESTAMP.txt` - Full logcat output from device during test

### Evidence Directory: `.preflight/evidence/`
- `test_evidence.png` - Screenshot captured during test execution

### Temporary Files (auto-cleaned)
- `test_job.json` - Test job configuration (created in project root)
- `/sdcard/job.json` - Job config on device (deleted after test)
- `/sdcard/evidence_preflight-test-001.png` - Evidence on device (deleted after test)
- `/sdcard/done_preflight-test-001.flag` - Flag file on device (deleted after test)

---

## Next Steps After Success

1. **Review logs**: Check `.preflight/logs/` for any warnings
2. **Verify evidence**: Inspect screenshot quality in `.preflight/evidence/`
3. **Update selectors**: If any DOM warnings present, update `selectors.json`
4. **Proceed to deployment**: Follow `DEPLOY-CHECKLIST.md` for production deployment

---

## Next Steps After Failure

1. **DO NOT DEPLOY**
2. **Diagnose failure** using error messages and logcat
3. **Fix root cause** (ADB, selectors, permissions, etc.)
4. **Re-run Pre-Flight** with `node run-preflight.js`
5. **Repeat until all checkpoints pass**

---

## Configuration

### Timeout Settings

Edit `preflight-config.json` to adjust timeouts:

```json
{
  "timeout": {
    "file_sync": 30000,         // 30 seconds
    "bot_startup": 60000,       // 60 seconds
    "webview_init": 45000,      // 45 seconds
    "evidence_collect": 30000   // 30 seconds
  }
}
```

### Test Job Parameters

Edit `preflight-config.json` to customize test job:

```json
{
  "test_job": {
    "assignment_id": "preflight-test-001",
    "keyword": "OpenAI GPT-4",
    "video_title": "Test Video",
    "duration_sec": 15,
    "evidence_path": "/sdcard/evidence_preflight-test-001.png",
    "done_flag_path": "/sdcard/done_preflight-test-001.flag"
  }
}
```

---

## Manual Verification (Alternative)

If automated test fails consistently, perform manual verification:

1. **Deploy files manually**:
   ```bash
   adb push client-mobile/bot-webview-autojs.js /sdcard/Scripts/webview_bot.js
   adb push client-mobile/config.json /sdcard/Scripts/config.json
   adb push client-mobile/selectors.json /sdcard/Scripts/selectors.json
   ```

2. **Trigger bot manually**:
   ```bash
   adb shell am broadcast -a org.autojs.autojs.action.startup -e path /sdcard/Scripts/webview_bot.js
   ```

3. **Monitor logs**:
   ```bash
   adb logcat | grep -E "Bot|WebView|Search|Main"
   ```

4. **Verify evidence**:
   ```bash
   adb shell ls -l /sdcard/evidence_*
   adb pull /sdcard/evidence_*.png ./
   ```

---

## Support

For issues or questions:
- Check logcat output in `.preflight/logs/`
- Review `INTEGRATION-TEST.md` for detailed integration test procedures
- Review `DEPLOY-CHECKLIST.md` for deployment guidance
