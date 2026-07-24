@echo off
setlocal EnableExtensions
title SIGA EDUCA - Remover inicializacao automatica

set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SIGA EDUCA - Reconhecimento Facial.lnk"
if exist "%ATALHO%" del /q "%ATALHO%"

echo Inicializacao automatica removida.
pause
