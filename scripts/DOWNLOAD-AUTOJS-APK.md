# AutoX.js APK Download Guide

## 🎯 Objective

Download AutoX.js APK to install on 3 Samsung Galaxy S9+ devices for automated testing.

---

## 📱 Device Information

| Device Serial | Model | Android | Storage Free |
|---------------|-------|---------|--------------|
| 314b4e5139593098 | SM-G965U1 (S9+) | 10 | 40GB (25% used) |
| 3535573852573098 | SM-G965U1 (S9+) | 10 | 44GB (16% used) |
| 423349535a583098 | SM-G965U1 (S9+) | 10 | 28GB (46% used) |

**Status**: ✅ All devices compatible with AutoX.js (Android 10)

---

## 🔗 Download Sources

### Option 1: AutoJs6 (Recommended - Most Active)

**GitHub**: https://github.com/SuperMonster003/AutoJs6

**Latest Release**: https://github.com/SuperMonster003/AutoJs6/releases/latest

**Download Steps**:
1. Visit the releases page
2. Find latest release (e.g., v6.x.x)
3. Download: `AutoJs6-vX.X.X-universal-release.apk`
4. Save to: `C:\Users\ChoiJoonho\doai-me-webapp\apk\autojs.apk`

**Why this version**:
- Most actively maintained
- Android 10 compatible
- Modern features
- Good stability

---

### Option 2: AutoX (Alternative)

**GitHub**: https://github.com/kkevsekk1/AutoX

**Latest Release**: https://github.com/kkevsekk1/AutoX/releases/latest

**Download Steps**:
1. Visit the releases page
2. Download: `AutoX-universal-release.apk`
3. Rename to: `autojs.apk`
4. Save to: `C:\Users\ChoiJoonho\doai-me-webapp\apk\autojs.apk`

---

### Option 3: Official AutoJS Pro (Paid)

**Website**: https://pro.autojs.org/

**Note**: Requires purchase, but includes commercial support

---

## 📂 Installation Directory Structure

After download, your structure should look like:

```
doai-me-webapp/
├── apk/
│   └── autojs.apk          ← Place APK here
├── scripts/
│   ├── install-autojs.bat  ← Run this to install
│   └── DOWNLOAD-AUTOJS-APK.md (this file)
└── run-preflight.js
```

---

## ⚡ Quick Installation

### Method 1: Using Install Script (Recommended)

1. **Download APK** (see sources above)

2. **Save APK** to `doai-me-webapp\apk\autojs.apk`

3. **Run installer**:
   ```bash
   cd doai-me-webapp\scripts
   install-autojs.bat
   ```

4. **Grant permissions** on each device (script will prompt)

---

### Method 2: Drag & Drop to Script

1. **Download APK** from any source above

2. **Drag the APK file** onto `install-autojs.bat`

3. Script will use the dragged APK automatically

---

### Method 3: Manual Installation (Per Device)

```bash
# Set ADB path
set ADB=%USERPROFILE%\adb.exe

# Install on device 1
%ADB% -s 314b4e5139593098 install -r autojs.apk

# Install on device 2
%ADB% -s 3535573852573098 install -r autojs.apk

# Install on device 3
%ADB% -s 423349535a583098 install -r autojs.apk
```

---

## ✅ Verification

After installation, verify with:

```bash
# Check all devices
cd %USERPROFILE%
for /L %i in (1,1,3) do adb devices | findstr "device$"

# Verify AutoX.js package
adb shell pm list packages | findstr autojs
```

**Expected output**:
```
package:org.autojs.autojs
```

Or for AutoJs6:
```
package:org.autojs.autojs6
```

---

## 🔧 Post-Installation Setup

### On Each Device (Manual Steps Required):

1. **Open AutoX.js app**
   ```bash
   adb -s <device_serial> shell am start -n org.autojs.autojs/.ui.main.MainActivity
   ```

2. **Grant Permissions**:
   - ✅ Accessibility Service (Settings → Accessibility → AutoX.js → Enable)
   - ✅ Display over other apps (Settings → Apps → AutoX.js → Display over other apps)
   - ✅ Storage permissions (Prompt when app opens)
   - ✅ Background running (Disable battery optimization)

3. **Enable ADB Debugging Mode** (in AutoX.js app):
   - Open AutoX.js settings
   - Find "Enable ADB Debugging" or "PC Connection"
   - Toggle ON

---

## 🚀 Run Pre-Flight Test

After installation and setup:

```bash
cd doai-me-webapp
node run-preflight.js
```

**Expected Result**: All 4 checkpoints pass
- ✅ Checkpoint 1: File Sync
- ✅ Checkpoint 2: Intent Broadcast
- ✅ Checkpoint 3: WebView Injection
- ✅ Checkpoint 4: Evidence Path

---

## 🐛 Troubleshooting

### Installation Fails with "INSTALL_FAILED_UPDATE_INCOMPATIBLE"

**Solution**: Uninstall old version first
```bash
adb -s <device_serial> uninstall org.autojs.autojs
adb -s <device_serial> install -r autojs.apk
```

### "App not installed" error

**Causes**:
- APK corrupted during download
- Insufficient storage (unlikely with 28-44GB free)
- Wrong architecture (universal APK should work)

**Solution**: Re-download APK from official source

### Package name mismatch

**AutoJs6 uses**: `org.autojs.autojs6`
**AutoX uses**: `org.autojs.autojs`

Update broadcast intent in code if using AutoJs6:
```javascript
// Change from:
-a org.autojs.autojs.action.startup

// To:
-a org.autojs.autojs6.action.startup
```

---

## 📊 Installation Status Tracker

Update this after installation:

| Device | APK Installed | Permissions Granted | ADB Mode Enabled | Pre-Flight Pass |
|--------|---------------|---------------------|------------------|-----------------|
| 314b4e5139593098 | ⬜ Pending | ⬜ Pending | ⬜ Pending | ⬜ Pending |
| 3535573852573098 | ⬜ Pending | ⬜ Pending | ⬜ Pending | ⬜ Pending |
| 423349535a583098 | ⬜ Pending | ⬜ Pending | ⬜ Pending | ⬜ Pending |

---

## 🎯 Success Criteria

✅ All 3 devices show AutoX.js package installed
✅ All 3 devices granted required permissions
✅ Pre-Flight test passes all 4 checkpoints
✅ Evidence files successfully captured and pulled

**Only then**: Production deployment approved ✅

---

## 📞 Support

If you encounter issues:
1. Check logcat: `.preflight/logs/logcat_*.txt`
2. Verify Android version compatibility (Android 7+ required)
3. Ensure USB debugging is enabled
4. Check ADB connection: `adb devices`

For AutoX.js specific issues:
- AutoJs6 Issues: https://github.com/SuperMonster003/AutoJs6/issues
- AutoX Issues: https://github.com/kkevsekk1/AutoX/issues
