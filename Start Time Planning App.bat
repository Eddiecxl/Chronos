@echo off
title Chronos Time Planning App
cd /d "%~dp0"

set "NODE_DIR=C:\Users\eddie.chan-c\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "TOOLS_DIR=C:\Users\eddie.chan-c\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
set "PATH=%NODE_DIR%;%TOOLS_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
  echo.
  echo Node.js could not be found.
  echo Install Node.js from https://nodejs.org and then run: npm install
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing application packages...
  call "%TOOLS_DIR%\pnpm.cmd" install
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting Chronos...
echo Your browser will open at http://localhost:5173
echo Keep this window open while using the app.
echo Press Ctrl+C to stop it.
echo.

start "" /b cmd /c "timeout /t 3 /nobreak ^>nul ^& start "" http://localhost:5173"
call "%TOOLS_DIR%\pnpm.cmd" run dev

pause
