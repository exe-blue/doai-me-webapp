# Module Loader Deployment Instructions

## Prerequisites

1. **ADB Installed**: Android Debug Bridge must be installed on your PC
   - Download: https://developer.android.com/studio/releases/platform-tools
   - Add to PATH or use full path to adb.exe

2. **Android Device Connected**:
   - USB debugging enabled
   - Device connected via USB cable
   - Device authorized for debugging

3. **AutoX.js Running**: AutoX.js app running on device with:
   - "ADB broadcast execution" enabled
   - Accessibility service enabled

---

## Option 1: Automated Deployment (Recommended)

### On Windows:
```bash
cd C:\Users\ChoiJoonho\doai-me-webapp
.\.sisyphus\deploy-and-test.bat
```

### On Linux/Mac:
```bash
cd ~/doai-me-webapp
chmod +x .sisyphus/deploy-and-test.sh
./.sisyphus/deploy-and-test.sh
```

---

## Option 2: Manual Deployment

### Step 1: Verify ADB Connection
```bash
adb devices
```

**Expected Output**:
```
List of devices attached
R28M50BDXYZ    device
```

---

### Step 2: Create Remote Directories
```bash
adb shell "mkdir -p /sdcard/scripts/modules"
adb shell "mkdir -p /sdcard/evidence"
```

---

### Step 3: Deploy Module Loader
```bash
cd C:\Users\ChoiJoonho\doai-me-webapp

adb push client-mobile/modules/module-loader.js /sdcard/scripts/modules/
```

---

### Step 4: Deploy Refactored Files
```bash
adb push client-mobile/webview_bot.js /sdcard/scripts/
adb push client-mobile/bot-webview.js /sdcard/scripts/
adb push client-mobile/modules/search-flow.js /sdcard/scripts/modules/
```

---

### Step 5: Deploy Test Script
```bash
adb push client-mobile/test_require.js /sdcard/scripts/
```

---

### Step 6: Execute Test
```bash
adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/scripts/test_require.js"
```

**Expected Broadcast Response**:
```
Broadcasting: Intent { act=com.stardust.autojs.execute dat=file:///sdcard/scripts/test_require.js }
Broadcast completed: result=0
```

---

### Step 7: Monitor Output
```bash
# On Windows:
adb logcat | findstr /C:"Module Loading Test" /C:"ModuleLoader" /C:"Module Loaded"

# On Linux/Mac:
adb logcat | grep -E "(Module Loading Test|ModuleLoader|Module Loaded)"
```

---

## Expected Test Output (Success)

```
[Module Loading Test] ╔════════════════════════════════════════════════════════════╗
[Module Loading Test] ║  Module Loading Test - AutoX.js                           ║
[Module Loading Test] ╚════════════════════════════════════════════════════════════╝
[Module Loading Test]
[Module Loading Test] [Test 1] Loading module-loader.js...
[Module Loading Test] ✅ module-loader.js loaded (relative path)
[Module Loading Test]    Base path: /sdcard/scripts/modules/
[Module Loading Test]
[Module Loading Test] [Test 2] Loading config.js...
[ModuleLoader] Loading: config
[ModuleLoader] Found at: /sdcard/scripts/modules/config.js
[ModuleLoader] ✅ Loaded: config
[Module Loading Test] ✅ config.js loaded
[Module Loading Test]
[Module Loading Test] [Test 3] Loading dom_utils.js...
[ModuleLoader] Loading: dom_utils
[ModuleLoader] Found at: /sdcard/scripts/modules/dom_utils.js
[ModuleLoader] ✅ Loaded: dom_utils
[Module Loading Test] ✅ dom_utils.js loaded
[Module Loading Test]    ✓ getInjectionCode
[Module Loading Test]    ✓ waitForElement
[Module Loading Test]    ✓ clickElement
[Module Loading Test]    ✓ typeText
[Module Loading Test]    All expected functions present!
[Module Loading Test]
[Module Loading Test] [Test 4] Loading webview-setup.js...
[ModuleLoader] Loading: webview-setup
[ModuleLoader] Found at: /sdcard/scripts/modules/webview-setup.js
[ModuleLoader] ✅ Loaded: webview-setup
[Module Loading Test] ✅ webview-setup.js loaded
[Module Loading Test]    ✓ initializeWebView function exists
[Module Loading Test]
[Module Loading Test] [Test 5] Loading all webview_bot.js dependencies...
[ModuleLoader] Loading: job-loader
[ModuleLoader] Found at: /sdcard/scripts/modules/job-loader.js
[ModuleLoader] ✅ Loaded: job-loader
[ModuleLoader] Loading: evidence-manager
[ModuleLoader] Found at: /sdcard/scripts/modules/evidence-manager.js
[ModuleLoader] ✅ Loaded: evidence-manager
[Module Loading Test]    ✓ webview-setup
[Module Loading Test]    ✓ dom_utils
[Module Loading Test]    ✓ config
[Module Loading Test]    ✓ job-loader
[Module Loading Test]    ✓ evidence-manager
[Module Loading Test] ✅ All dependencies loaded successfully!
[Module Loading Test]
[Module Loading Test] [Test 6] Verifying module cache...
[Module Loading Test]    Cached modules (5):
[Module Loading Test]    1. config
[Module Loading Test]    2. dom_utils
[Module Loading Test]    3. webview-setup
[Module Loading Test]    4. job-loader
[Module Loading Test]    5. evidence-manager
[Module Loading Test]
[Module Loading Test] [Test 7] Testing function execution...
[Module Loading Test] ✅ getInjectionCode() executed successfully
[Module Loading Test]    Code length: 1234 characters
[Module Loading Test]
[Module Loading Test] ════════════════════════════════════════════════════════════
[Module Loading Test] 🎉 ALL TESTS PASSED!
[Module Loading Test] ════════════════════════════════════════════════════════════
[Module Loading Test]
[Module Loading Test] Module Loaded    <-- SUCCESS SIGNAL
```

---

## Troubleshooting

### Error: "adb: command not found"
**Solution**: Install Android Platform Tools and add to PATH
- Download: https://developer.android.com/studio/releases/platform-tools
- Extract and add to system PATH

### Error: "no devices/emulators found"
**Solution**:
1. Connect device via USB
2. Enable USB debugging in Developer Options
3. Authorize computer on device popup
4. Run `adb devices` to verify

### Error: "Broadcast completed: result=-1"
**Solution**:
1. Open AutoX.js app on device
2. Go to Settings → ADB broadcast execution → Enable
3. Grant Accessibility permissions
4. Re-run broadcast command

### Error: Module not found in test
**Solution**:
1. Check file exists on device: `adb shell ls -la /sdcard/scripts/modules/`
2. Re-push missing files
3. Check module name spelling (case-sensitive)

### Error: "Permission denied"
**Solution**:
```bash
adb shell chmod -R 755 /sdcard/scripts/
```

---

## After Successful Test

Once you see **"Module Loaded"** in the output:

1. **Ralph Loop Complete** ✅
2. **Deploy remaining module files** (if not already deployed):
   ```bash
   adb push client-mobile/modules/config.js /sdcard/scripts/modules/
   adb push client-mobile/modules/dom_utils.js /sdcard/scripts/modules/
   adb push client-mobile/modules/webview-setup.js /sdcard/scripts/modules/
   adb push client-mobile/modules/job-loader.js /sdcard/scripts/modules/
   adb push client-mobile/modules/evidence-manager.js /sdcard/scripts/modules/
   adb push client-mobile/modules/dom-control.js /sdcard/scripts/modules/
   ```

3. **Test actual bot execution**:
   ```bash
   adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/scripts/webview_bot.js"
   ```

---

## Quick Reference Commands

```bash
# Check connection
adb devices

# Deploy module loader
adb push client-mobile/modules/module-loader.js /sdcard/scripts/modules/

# Deploy test
adb push client-mobile/test_require.js /sdcard/scripts/

# Execute test
adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/scripts/test_require.js"

# Monitor output
adb logcat | findstr "Module Loading Test"

# Check deployed files
adb shell ls -la /sdcard/scripts/
adb shell ls -la /sdcard/scripts/modules/

# Pull log files
adb pull /sdcard/scripts/ ./device-logs/
```

---

**Status**: Ready for deployment
**Next Step**: Run deploy-and-test.bat and verify "Module Loaded" appears
