@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SIGA EDUCA - Reconhecimento Facial

if not defined PORT set "PORT=5001"
set "URL=http://127.0.0.1:%PORT%/"
set "SEM_NAVEGADOR=0"

if /I "%~1"=="--sem-navegador" set "SEM_NAVEGADOR=1"
if /I "%SIGA_NO_BROWSER%"=="1" set "SEM_NAVEGADOR=1"

call :servico_pronto
if not errorlevel 1 goto :abrir

if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else if exist "%USERPROFILE%\Desktop\reconhecimento_facial-main\.venv\Scripts\python.exe" (
  set "PY=%USERPROFILE%\Desktop\reconhecimento_facial-main\.venv\Scripts\python.exe"
) else (
  echo.
  echo Nao foi encontrado um ambiente Python preparado para o reconhecimento facial.
  echo Crie o ambiente com: python -m venv .venv
  echo Depois instale com: .venv\Scripts\pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)

for %%I in ("%PY%") do set "PY_ABS=%%~fI"
if not exist "instance" mkdir "instance"

echo Iniciando o reconhecimento facial. Aguarde...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:SECRET_KEY='development-only-change-me'; $env:FLASK_DEBUG='0'; $env:PORT='%PORT%'; $p=Start-Process -FilePath '%PY_ABS%' -ArgumentList 'main.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%CD%\instance\servidor.out.log' -RedirectStandardError '%CD%\instance\servidor.err.log' -PassThru; Set-Content -LiteralPath '%CD%\instance\servidor.pid' -Value $p.Id"
if errorlevel 1 goto :falha

powershell -NoProfile -ExecutionPolicy Bypass -Command "$limite=(Get-Date).AddSeconds(90); do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $limite); exit 1"
if errorlevel 1 goto :falha

:abrir
if "%SEM_NAVEGADOR%"=="0" (
  echo Abrindo %URL%
  start "" "%URL%"
)
exit /b 0

:servico_pronto
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%

:falha
echo.
echo Nao foi possivel iniciar o reconhecimento facial em %URL%
echo Consulte o arquivo instance\servidor.err.log para ver o motivo.
if exist "instance\servidor.err.log" (
  echo.
  type "instance\servidor.err.log"
)
echo.
pause
exit /b 1
