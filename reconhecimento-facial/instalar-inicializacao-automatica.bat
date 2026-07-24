@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SIGA EDUCA - Inicializacao automatica

set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SIGA EDUCA - Reconhecimento Facial.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('%ATALHO%'); $s.TargetPath='%~dp0iniciar.bat'; $s.Arguments='--sem-navegador'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='Inicia o reconhecimento facial do SIGA EDUCA'; $s.Save()"

if errorlevel 1 (
  echo Nao foi possivel instalar a inicializacao automatica.
  pause
  exit /b 1
)

echo.
echo Inicializacao automatica instalada com sucesso.
echo A partir do proximo acesso ao Windows, o servico sera iniciado sozinho.
echo Depois, basta abrir: http://127.0.0.1:5001/
echo.
pause
