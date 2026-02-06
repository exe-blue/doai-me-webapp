@echo off
chcp 65001 >nul
echo ╔════════════════════════════════════════════════╗
echo ║       DOAI.ME PC Worker Setup v1.0             ║
echo ╚════════════════════════════════════════════════╝
echo.

:: 0. Check if running as admin (optional)
echo [1/5] Checking environment...

:: 1. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found! Please install Node.js LTS first.
    echo    Download: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo ✅ Node.js found: %NODE_VER%

:: 2. Install dependencies
echo.
echo [2/5] Installing Node modules...
call npm install
if %errorlevel% neq 0 (
    echo ❌ npm install failed!
    pause
    exit /b 1
)
echo ✅ Node modules installed

:: 3. Check ADB
echo.
echo [3/5] Checking ADB...
where adb >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('adb version') do (
        echo ✅ ADB found: %%i
        goto :adb_done
    )
)
if exist "platform-tools\adb.exe" (
    echo ✅ ADB found in platform-tools folder
) else (
    echo ⚠️  ADB not found in PATH or platform-tools folder
    echo    Option 1: Add ADB to system PATH
    echo    Option 2: Download platform-tools and place in this folder
    echo    Download: https://developer.android.com/tools/releases/platform-tools
)
:adb_done

:: 4. Setup config files
echo.
echo [4/5] Setting up configuration files...

:: Create .env.example if not exists
if not exist ".env.example" (
    echo # DOAI.ME PC Worker Configuration> .env.example
    echo.>> .env.example
    echo # Required: Unique PC identifier ^(P01, P02, etc.^)>> .env.example
    echo PC_CODE=P01>> .env.example
    echo.>> .env.example
    echo # Supabase connection>> .env.example
    echo NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co>> .env.example
    echo SUPABASE_SERVICE_ROLE_KEY=your-service-role-key>> .env.example
    echo.>> .env.example
    echo # API Server>> .env.example
    echo API_BASE_URL=https://doai.me>> .env.example
    echo WORKER_API_KEY=your-worker-api-key>> .env.example
    echo.>> .env.example
    echo # ADB Path ^(optional, defaults to 'adb' in PATH^)>> .env.example
    echo # ADB_PATH=C:\platform-tools\adb.exe>> .env.example
    echo ✅ Created .env.example
)

:: Create .env if not exists
if not exist ".env" (
    echo ⚠️  .env not found, creating from template...
    copy .env.example .env >nul
    echo ✅ Created .env - Please edit with your settings
    echo.
    echo Opening .env for editing...
    notepad .env
) else (
    echo ✅ .env already exists
)

:: Create device-map.json if not exists
if not exist "device-map.json" (
    echo {> device-map.json
    echo   "_comment": "Map device serial to slot code. Example: \"SERIAL123\": \"B01S01\"",>> device-map.json
    echo   "_note": "This file is optional with new naming system ^(PC01-001^)">> device-map.json
    echo }>> device-map.json
    echo ✅ Created device-map.json
) else (
    echo ✅ device-map.json already exists
)

:: 5. Create desktop shortcut
echo.
echo [5/5] Creating Start Worker shortcut...

set SCRIPT_DIR=%~dp0
set SHORTCUT_NAME=Start Worker.bat

:: Create start script
echo @echo off> "%SCRIPT_DIR%Start Worker.bat"
echo cd /d "%SCRIPT_DIR%">> "%SCRIPT_DIR%Start Worker.bat"
echo echo Starting DOAI.ME Worker...>> "%SCRIPT_DIR%Start Worker.bat"
echo node worker.js>> "%SCRIPT_DIR%Start Worker.bat"
echo pause>> "%SCRIPT_DIR%Start Worker.bat"
echo ✅ Created "Start Worker.bat"

:: Try to create desktop shortcut
set DESKTOP=%USERPROFILE%\Desktop
if exist "%DESKTOP%" (
    copy "%SCRIPT_DIR%Start Worker.bat" "%DESKTOP%\Start Worker.bat" >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Shortcut copied to Desktop
    )
)

echo.
echo ╔════════════════════════════════════════════════╗
echo ║              Setup Complete!                   ║
echo ╚════════════════════════════════════════════════╝
echo.
echo 📋 Next Steps:
echo    1. Edit .env file with your PC_CODE and API keys
echo    2. Connect Android devices via USB
echo    3. Enable USB debugging on each device
echo    4. Run "Start Worker.bat" to begin
echo.
echo 📱 To test ADB connection:
echo    adb devices
echo.
pause
