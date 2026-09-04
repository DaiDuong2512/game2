@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
call npm install --no-audit --no-fund
if errorlevel 1 goto :error
call npm run check
if errorlevel 1 goto :error
echo.
echo Tạo bản dựng và kiểm thử đã hoàn tất.
pause
exit /b 0
:error
echo.
echo Tạo bản dựng thất bại. Hãy kiểm tra lỗi ở trên.
pause
exit /b 1
