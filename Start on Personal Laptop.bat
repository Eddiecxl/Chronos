@echo off
title Chronos Time Planning App
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js 20 or newer from https://nodejs.org
  echo Then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing application packages for the first time...
  call npm install
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check your internet connection.
    pause
    exit /b 1
  )
)

echo.
echo Starting Chronos at http://localhost:5173
echo Keep this window open while using the application.
echo Press Ctrl+C to stop it.
echo.

start "" /b cmd /c "timeout /t 3 /nobreak ^>nul ^& start "" http://localhost:5173"
call npm run dev

pause
