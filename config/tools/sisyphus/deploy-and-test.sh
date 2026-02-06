#!/bin/bash
# Deploy Module Loader Refactoring to Android Device
# Run this script from the doai-me-webapp directory

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Deploying Module Loader Refactoring - Ralph Loop         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check ADB
echo "[1/6] Checking ADB connection..."
adb devices
echo ""

# Check device
DEVICE_COUNT=$(adb devices | grep -w "device" | wc -l)
if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "❌ No Android devices connected"
    echo "   Please connect device and enable USB debugging"
    exit 1
fi

echo "✅ Device connected"
echo ""

# Create remote directories
echo "[2/6] Creating remote directories..."
adb shell "mkdir -p /sdcard/scripts/modules"
adb shell "mkdir -p /sdcard/evidence"
echo "✅ Directories created"
echo ""

# Deploy module-loader.js
echo "[3/6] Deploying module-loader.js..."
adb push client-mobile/modules/module-loader.js /sdcard/scripts/modules/
echo "✅ module-loader.js deployed"
echo ""

# Deploy refactored files
echo "[4/6] Deploying refactored files..."
adb push client-mobile/webview_bot.js /sdcard/scripts/
adb push client-mobile/bot-webview.js /sdcard/scripts/
adb push client-mobile/modules/search-flow.js /sdcard/scripts/modules/
echo "✅ Refactored files deployed"
echo ""

# Deploy test script
echo "[5/6] Deploying test_require.js..."
adb push client-mobile/test_require.js /sdcard/scripts/
echo "✅ Test script deployed"
echo ""

# Execute test
echo "[6/6] Executing test_require.js..."
echo "────────────────────────────────────────────────────────────"
echo ""

# Execute via AutoX.js broadcast
adb shell am broadcast -a com.stardust.autojs.execute -d "file:///sdcard/scripts/test_require.js"

echo ""
echo "────────────────────────────────────────────────────────────"
echo "Test execution started. Monitoring output..."
echo ""
echo "Press Ctrl+C to stop monitoring"
echo ""

# Monitor logcat for test output
adb logcat | grep -E "(Module Loading Test|ModuleLoader|Module Loaded)"
