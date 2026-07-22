@echo off
cd /d "%~dp0"
set SECRET_KEY=development-only-change-me
set FLASK_DEBUG=1
set PORT=5001

if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else if exist "%USERPROFILE%\Desktop\reconhecimento_facial-main\.venv\Scripts\python.exe" (
  set "PY=%USERPROFILE%\Desktop\reconhecimento_facial-main\.venv\Scripts\python.exe"
  echo Usando venv do Desktop (temporario). Prefira criar .venv nesta pasta depois.
) else (
  echo Nenhum Python/venv encontrado.
  echo Crie com: python -m venv .venv
  echo Depois: .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Reconhecimento Facial - PC central
echo  Abra no navegador: http://127.0.0.1:%PORT%/
echo  NAO abra os arquivos .html pelo Explorer.
echo ============================================
echo.

start "" "http://127.0.0.1:%PORT%/"
"%PY%" main.py
pause
