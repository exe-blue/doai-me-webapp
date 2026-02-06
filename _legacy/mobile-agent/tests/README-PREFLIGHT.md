# Phase 0: Pre-Flight Validation - Execution Guide

## 📋 Overview

This document explains how to run the Phase 0 pre-flight validation script on an Android device with AutoX.js.

---

## 🎯 Purpose

Phase 0 validates that the AutoX.js environment supports the WebView APIs required for DOM-based YouTube automation. **DO NOT proceed to Phase 1 without passing all 5 tests.**

---

## ✅ Prerequisites

1. **Android Device**: Galaxy S9 or similar (Android 8.0+)
2. **AutoX.js App**: Installed and running
3. **USB Debugging**: Enabled on device
4. **ADB**: Installed on PC Worker
5. **Internet Connection**: Device connected to WiFi/4G

---

## 🚀 Execution Methods

### Method 1: ADB Push (Recommended for PC Worker)

```bash
# Navigate to mobile-agent directory
cd C:/Users/ChoiJoonho/doai-me-webapp/mobile-agent

# Push script to device
adb -s <DEVICE_SERIAL> push tests/pre-flight.js /sdcard/

# Trigger AutoX.js to execute
adb -s <DEVICE_SERIAL> shell am broadcast \
  -a com.stardust.autojs.execute \
  -d "file:///sdcard/pre-flight.js"
```

**Example with actual device serial:**
```bash
adb -s R28M50BDXYZ push tests/pre-flight.js /sdcard/
adb -s R28M50BDXYZ shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/pre-flight.js"
```

---

### Method 2: Manual Import (For Testing)

1. Open **AutoX.js** app on Android device
2. Tap **+** (New Script)
3. Tap **Import from File**
4. Navigate to `/sdcard/pre-flight.js`
5. Tap **Run** ▶️

---

### Method 3: PC Worker Automation Script

Create `backend/run-preflight.js`:

```javascript
const ADBController = require('./adb-controller');

async function runPreFlight(deviceSerial) {
  const adb = new ADBController(deviceSerial);

  console.log(`[PreFlight] Running on device: ${deviceSerial}`);

  // Check device is online
  const isOnline = await adb.isDeviceOnline();
  if (!isOnline) {
    throw new Error(`Device ${deviceSerial} is offline`);
  }

  // Push pre-flight script
  await adb.pushFile(
    'C:/Users/ChoiJoonho/doai-me-webapp/mobile-agent/tests/pre-flight.js',
    '/sdcard/pre-flight.js'
  );

  // Execute script
  await adb.executeScript('/sdcard/pre-flight.js');

  console.log('[PreFlight] Script launched. Check device screen for results.');

  // Wait for completion (60 seconds)
  console.log('[PreFlight] Waiting 60 seconds for test completion...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Pull report
  const reportPath = await adb.pullFile(
    '/sdcard/scripts/com.stardust.scriptdroid/PREFLIGHT_REPORT.md',
    './PREFLIGHT_REPORT.md'
  );

  console.log(`[PreFlight] Report downloaded: ${reportPath}`);

  // Display results
  const fs = require('fs');
  const report = fs.readFileSync(reportPath, 'utf8');
  console.log('\n' + report);
}

// Run on first device
runPreFlight('R28M50BDXYZ').catch(console.error);
```

Execute:
```bash
cd backend
node run-preflight.js
```

---

## 📊 Expected Output

### On Device Screen:

```
Phase 0: Pre-Flight Validation
═══════════════════════════════════

✅ Test 1: WebView Rendering: SUCCESS
✅ Test 2: WebSettings Configuration: SUCCESS
   - JavaScript enabled: ✓
   - DOM storage enabled: ✓
   - Mobile UA set: ✓
📄 Loading: https://m.youtube.com...
📄 Page loaded: https://m.youtube.com/
✅ Test 3: YouTube Mobile Loading: SUCCESS
   - URL: https://m.youtube.com/
✅ Test 4: evaluateJavascript Execution: SUCCESS
   - Title: YouTube
   - Has YouTube app element: true
   - User-Agent: Mozilla/5.0 (Linux; Android 10; SM-G973F)...
✅ Test 5: Search Selector Validation: SUCCESS
   - Found: 5/7 (71%)
   ✓ search_button_1
   ✓ search_button_2
   ✗ search_button_3
   ✓ search_input_1
   ✗ search_input_2
   ✓ video_result_1
   ✓ video_result_2

═══════════════════════════════════
📊 FINAL RESULTS
═══════════════════════════════════
Passed: 5/5
Failed: 0/5

🎉 ALL TESTS PASSED!

✅ Phase 0 complete
✅ Ready to proceed to Phase 1

Next steps:
1. Save this report as PREFLIGHT_REPORT.md
2. Execute: /sisyphus webview-dom-automation

💾 Report saved: /sdcard/scripts/com.stardust.scriptdroid/PREFLIGHT_REPORT.md
```

---

## 📄 Report File Location

After execution, the report is saved to:

**On Device:**
```
/sdcard/scripts/com.stardust.scriptdroid/PREFLIGHT_REPORT.md
```

**Retrieve via ADB:**
```bash
adb -s <DEVICE_SERIAL> pull /sdcard/scripts/com.stardust.scriptdroid/PREFLIGHT_REPORT.md .
```

---

## ⚠️ Troubleshooting

### Test 1 Failed: WebView Rendering

**Error**: `Cannot create WebView`

**Solution**:
- Update AutoX.js to latest version
- Ensure Android System WebView is installed (Play Store)
- Try AutoX.js Pro version

---

### Test 2 Failed: WebSettings

**Error**: `JavaScript not enabled`

**Solution**:
- Check AutoX.js permissions (Settings → Apps → AutoX.js → Permissions)
- Ensure "Display over other apps" is enabled

---

### Test 3 Failed: YouTube Loading

**Error**: `Page load timeout`

**Solution**:
- Check internet connection (WiFi or 4G)
- Disable VPN if active
- Try loading `https://m.youtube.com` in Chrome browser first
- Check DNS settings (try `8.8.8.8`)

**Error**: `Loaded URL is not YouTube`

**Solution**:
- YouTube may have redirected (check redirect URL)
- Clear browser cache/cookies
- Verify User-Agent is set correctly

---

### Test 4 Failed: evaluateJavascript

**Error**: `Parse error`

**Solution**:
- This indicates AutoX.js WebView API limitations
- Upgrade to AutoX.js Pro ($9.99)
- Alternative: Use Appium instead of AutoX.js

**Error**: `Timeout`

**Solution**:
- Increase timeout in script (line 280: `10000` → `20000`)
- Page may be slow to load

---

### Test 5 Failed: Search Selector

**Error**: `Low selector success rate: 30%`

**Solution**:
- YouTube DOM has changed recently
- Update `selectors.json` with new selectors
- Use Chrome DevTools on desktop to inspect m.youtube.com
- Document new selectors in Metis risk log

**Threshold**: Need ≥50% success rate (3.5/7 selectors working)

---

## 🎯 Success Criteria

| Test | Criteria | Blocking? |
|------|----------|-----------|
| 1. WebView Rendering | UI displays WebView | Yes |
| 2. WebSettings | All settings apply | Yes |
| 3. YouTube Loading | Loads within 30s | Yes |
| 4. JavaScript Eval | Returns valid JSON | Yes |
| 5. Selector Validation | ≥50% selectors found | No (can update) |

**Decision Rule:**
- Tests 1-4 must all pass (4/4)
- Test 5 can fail if selectors are outdated (update `selectors.json`)
- Overall: 4/5 minimum to proceed

---

## 📝 Next Steps After Passing

1. **Save the report**: Copy `PREFLIGHT_REPORT.md` to project root
2. **Update work plan**: Mark Phase 0 as complete
3. **Start Phase 1**: Execute `/sisyphus` or manually start implementing WebView modules
4. **Budget approval**: If Test 4 failed due to free version limits, approve AutoX.js Pro purchase

---

## 🔧 Manual Debugging

If tests fail and you need to debug interactively:

1. Open AutoX.js console
2. Run this minimal test:

```javascript
"ui";

ui.layout(
    <webview id="wv" w="*" h="*"/>
);

const wv = ui.wv;
wv.loadUrl("https://m.youtube.com");

setTimeout(() => {
    wv.evaluateJavascript("document.title", (result) => {
        toast("Title: " + result);
    });
}, 5000);
```

3. Verify WebView loads and title is returned

---

## 📞 Support

If all troubleshooting fails:
- Check AutoX.js documentation: https://pro.autojs.org/
- Verify Android System WebView version: Settings → Apps → Android System WebView
- Consider alternative: Migrate to Appium (requires PC Worker only)

---

**Last Updated**: 2026-01-29
**Author**: Axon (Implementation Engineer)
