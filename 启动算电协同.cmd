@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo 未找到 npm。请先安装 Node.js，再重新运行此文件。
  pause
  exit /b 1
)

set "AIDC_PS=powershell"
where pwsh >nul 2>nul
if not errorlevel 1 set "AIDC_PS=pwsh"
if not exist ".venv-sim\Scripts\python.exe" (
  %AIDC_PS% -NoProfile -ExecutionPolicy Bypass -File "scripts\setup-simulation.ps1"
  if errorlevel 1 exit /b 1
)
%AIDC_PS% -NoProfile -ExecutionPolicy Bypass -File "scripts\start-platform.ps1" -Build
if errorlevel 1 pause
endlocal
