@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SIGA EDUCA - Parar Reconhecimento Facial

if not exist "instance\servidor.pid" (
  echo O servico nao possui um processo registrado para encerrar.
  pause
  exit /b 0
)

set /p SERVER_PID=<"instance\servidor.pid"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-Process -Id %SERVER_PID% -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.Id -Force; $p.WaitForExit() }"
del /q "instance\servidor.pid" >nul 2>&1

echo Reconhecimento facial encerrado.
pause
