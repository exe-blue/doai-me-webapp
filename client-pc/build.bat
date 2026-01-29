@echo off
echo =============================================
echo DoAi.Me Worker Build Script
echo =============================================
echo.

:: 1. pkg 설치 확인
where pkg >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Installing pkg globally...
    npm install -g pkg
)

:: 2. 의존성 설치
echo [STEP 1/3] Installing dependencies...
call npm install

:: 3. dist 폴더 생성
if not exist "dist" mkdir dist

:: 4. exe 빌드
echo.
echo [STEP 2/3] Building executable...
call npm run build

:: 5. 추가 파일 복사
echo.
echo [STEP 3/3] Copying additional files...
copy /Y env.example dist\
copy /Y README-WORKER.md dist\README.txt

echo.
echo =============================================
echo Build completed!
echo Output: dist\DoaiWorker.exe
echo =============================================
echo.
echo Next steps:
echo 1. Create .env file in dist folder
echo 2. Run DoaiWorker.exe
echo.
pause
