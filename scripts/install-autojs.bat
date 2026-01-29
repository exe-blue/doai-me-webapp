@echo off
REM ============================================================================
REM AutoX.js Installation Script for Multi-Device Farm
REM ============================================================================
REM Purpose: Install AutoX.js APK on all connected Android devices
REM Devices: 314b4e5139593098, 3535573852573098, 423349535a583098
REM Model: Samsung Galaxy S9+ (SM-G965U1) - Android 10
REM ============================================================================

setlocal enabledelayedexpansion

echo ========================================
echo AutoX.js Multi-Device Installer
echo ========================================
echo.

REM Define devices
set DEVICE1=314b4e5139593098
set DEVICE2=3535573852573098
set DEVICE3=423349535a583098

REM Define APK path (update this with actual path)
set APK_PATH=%~dp0..\apk\autojs.apk

REM Check if APK exists
if not exist "%APK_PATH%" (
    echo [ERROR] AutoX.js APK not found at: %APK_PATH%
    echo.
    echo Please download AutoX.js APK from:
    echo   - Official: https://github.com/SuperMonster003/AutoJs6/releases
    echo   - Alternative: https://github.com/kkevsekk1/AutoX/releases
    echo.
    echo Place the APK file at: %APK_PATH%
    echo Or drag-and-drop the APK file onto this script.
    echo.

    REM Check if APK was dragged onto script
    if "%~1" NEQ "" (
        if exist "%~1" (
            echo [INFO] Using dragged APK: %~1
            set APK_PATH=%~1
        ) else (
            echo [ERROR] Dragged file does not exist: %~1
            pause
            exit /b 1
        )
    ) else (
        pause
        exit /b 1
    )
)

echo [INFO] APK Path: %APK_PATH%
echo.

REM Get ADB path
set ADB_EXE=%USERPROFILE%\adb.exe
if not exist "%ADB_EXE%" (
    echo [ERROR] ADB not found at: %ADB_EXE%
    echo Please ensure ADB is installed.
    pause
    exit /b 1
)

echo [INFO] ADB Path: %ADB_EXE%
echo.

REM Check connected devices
echo [STEP 1] Checking connected devices...
"%ADB_EXE%" devices -l
echo.

REM Install on each device
set SUCCESS_COUNT=0
set FAIL_COUNT=0

echo [STEP 2] Installing AutoX.js on all devices...
echo.

REM Device 1
echo [Device 1/3] Installing on %DEVICE1%...
"%ADB_EXE%" -s %DEVICE1% install -r "%APK_PATH%"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Device 1 installation successful
    set /a SUCCESS_COUNT+=1
) else (
    echo [FAIL] Device 1 installation failed
    set /a FAIL_COUNT+=1
)
echo.

REM Device 2
echo [Device 2/3] Installing on %DEVICE2%...
"%ADB_EXE%" -s %DEVICE2% install -r "%APK_PATH%"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Device 2 installation successful
    set /a SUCCESS_COUNT+=1
) else (
    echo [FAIL] Device 2 installation failed
    set /a FAIL_COUNT+=1
)
echo.

REM Device 3
echo [Device 3/3] Installing on %DEVICE3%...
"%ADB_EXE%" -s %DEVICE3% install -r "%APK_PATH%"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Device 3 installation successful
    set /a SUCCESS_COUNT+=1
) else (
    echo [FAIL] Device 3 installation failed
    set /a FAIL_COUNT+=1
)
echo.

REM Verify installations
echo [STEP 3] Verifying installations...
echo.

for %%D in (%DEVICE1% %DEVICE2% %DEVICE3%) do (
    echo Checking device %%D...
    "%ADB_EXE%" -s %%D shell pm list packages | findstr /C:"autojs" >nul
    if !ERRORLEVEL! EQU 0 (
        echo [OK] AutoX.js detected on %%D
    ) else (
        echo [WARN] AutoX.js NOT detected on %%D
    )
)
echo.

REM Summary
echo ========================================
echo Installation Summary
echo ========================================
echo Successful: %SUCCESS_COUNT% / 3 devices
echo Failed: %FAIL_COUNT% / 3 devices
echo.

if %SUCCESS_COUNT% EQU 3 (
    echo [SUCCESS] All devices ready!
    echo.
    echo [NEXT STEPS]
    echo 1. Grant permissions on each device:
    echo    - Open AutoX.js app
    echo    - Enable "Accessibility Service"
    echo    - Enable "Display over other apps"
    echo    - Enable "Storage" permissions
    echo.
    echo 2. Run Pre-Flight test:
    echo    cd doai-me-webapp
    echo    node run-preflight.js
    echo.
) else (
    echo [WARNING] Some installations failed.
    echo Check error messages above and retry.
    echo.
)

pause
