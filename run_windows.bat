@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
%PY% -c "from PIL import Image; from cryptography.fernet import Fernet; import google.auth" >nul 2>nul
if errorlevel 1 (
  echo Installing MEDIPICK required Python packages...
  %PY% -m pip install -r requirements.txt
  if errorlevel 1 (echo [ERROR] Package installation failed. Ensure Python 3.10+ and internet access. & pause & exit /b 1)
)
%PY% server.py
pause
