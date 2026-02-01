@echo off
REM Deploy Module Loader Refactoring to Android Device
REM Run this script from the doai-me-webapp directory

echo ╔════════════════════════════════════════════════════════════╗
echo ║  Deploying Module Loader Refactoring - Ralph Loop         ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check ADB
echo [1/6] Checking ADB connection...
adb devices
echo.

REM Create remote directories
echo [2/6] Creating remote directories...
adb shell "mkdir -p /sdcard/scripts/modules"
adb shell "mkdir -p /sdcard/evidence"
echo ✅ Directories created
echo.

REM Deploy module-loader.js (FIXED VERSION)
echo [3/6] Deploying module-loader.js (with path fixes)...
adb push client-mobile\modules\module-loader.js /sdcard/scripts/modules/
echo ✅ module-loader.js deployed
echo.

REM Deploy refactored files
echo [4/6] Deploying refactored files...
adb push client-mobile\webview_bot.js /sdcard/scripts/
adb push client-mobile\bot-webview.js /sdcard/scripts/
adb push client-mobile\modules\search-flow.js /sdcard/scripts/modules/
echo ✅ Refactored files deployed
echo.

REM Deploy test script
echo [5/6] Deploying test_require.js...
adb push client-mobile\test_require.js /sdcard/scripts/
echo ✅ Test script deployed
echo.

REM Execute test
echo [6/6] Executing test_require.js...
echo ────────────────────────────────────────────────────────────
echo.

REM Execute via AutoX.js broadcast
adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/scripts/test_require.js"

echo.
echo ────────────────────────────────────────────────────────────
echo Test execution started. Monitoring output...
echo.
echo Press Ctrl+C to stop monitoring
echo.

REM Monitor logcat for test output
adb logcat | findstr /C:"Module Loading Test" /C:"ModuleLoader" /C:"Module Loaded"
