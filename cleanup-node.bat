@echo off
chcp 65001 >nul
echo ========================================
echo   Node.js 프로세스 및 캐시 정리 스크립트
echo ========================================
echo.

echo [1/4] 실행 중인 Node.js 프로세스 확인...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %errorlevel%==0 (
    echo Node.js 프로세스 발견. 종료 시도 중...
    taskkill /F /IM node.exe 2>nul
    timeout /t 2 /nobreak >nul
    taskkill /F /IM node.exe 2>nul
    echo 완료!
) else (
    echo 실행 중인 Node.js 프로세스 없음.
)
echo.

echo [2/4] npm 관련 프로세스 종료...
taskkill /F /IM npm.cmd 2>nul
taskkill /F /IM npx.cmd 2>nul
echo 완료!
echo.

echo [3/4] 포트 3000, 3001, 8080 사용 프로세스 종료...
for %%p in (3000 3001 8080) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        echo 포트 %%p 사용 중인 PID: %%a - 종료 중...
        taskkill /F /PID %%a 2>nul
    )
)
echo 완료!
echo.

echo [4/4] node_modules 폴더 삭제 (선택사항)...
echo.
set /p DELETE_MODULES="node_modules 폴더도 삭제하시겠습니까? (Y/N): "
if /I "%DELETE_MODULES%"=="Y" (
    echo 루트 node_modules 삭제 중...
    if exist "node_modules" rmdir /s /q "node_modules"
    echo dashboard/node_modules 삭제 중...
    if exist "dashboard\node_modules" rmdir /s /q "dashboard\node_modules"
    echo 완료!
) else (
    echo node_modules 삭제 건너뜀.
)
echo.

echo ========================================
echo   정리 완료!
echo ========================================
echo.
echo 남은 Node.js 프로세스 확인:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe"
if %errorlevel%==1 (
    echo   → 프로젝트 관련 Node.js 프로세스 없음
)
echo.
pause
