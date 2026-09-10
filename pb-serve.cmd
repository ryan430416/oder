@echo off
cd /d "%~dp0"
if not exist "pocketbase\pocketbase.exe" (
  echo 找不到 pocketbase.exe，請先在專案資料夾執行：
  echo   npm.cmd run pb:download
  pause
  exit /b 1
)
cd pocketbase
pocketbase.exe serve --http=127.0.0.1:8090
