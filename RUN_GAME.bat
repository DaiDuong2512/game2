@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo [Hộ Vệ Khe Nứt] Chưa có bản dựng sẵn. Đang tạo bản dựng...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
  call npm run build
  if errorlevel 1 goto :error
)
start "Máy chủ Hộ Vệ Khe Nứt" cmd /k "cd /d ""%~dp0"" && node scripts\dev-server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173"
exit /b 0
:error
echo.
echo Không thể chuẩn bị trò chơi. Hãy kiểm tra Node.js 20 hoặc mới hơn đã được cài đặt.
pause
exit /b 1
