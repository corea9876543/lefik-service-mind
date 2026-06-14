@echo off
cd /d "%~dp0"
title Claude live monitor - keep this window open

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org then run again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing libraries, first time only, please wait 1-2 minutes...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet and try again.
    pause
    exit /b 1
  )
)

if not exist cloudflared.exe (
  echo Downloading cloudflared...
  powershell -Command "Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
  if errorlevel 1 (
    echo cloudflared download failed. Check your internet and try again.
    pause
    exit /b 1
  )
)

if "%ANTHROPIC_API_KEY%"=="" set /p ANTHROPIC_API_KEY=Enter Anthropic key, or just press Enter for monitoring only:
if "%ANTHROPIC_API_KEY%"=="" set ANTHROPIC_API_KEY=monitoring-only
if "%STATUS_WRITE_KEY%"=="" set STATUS_WRITE_KEY=key%RANDOM%%RANDOM%

echo Starting backend...
start /b node ask-server.mjs
timeout /t 2 >nul

echo.
echo ============================================================
echo  A public address like https://xxxx.trycloudflare.com
echo  will appear below in a few seconds.
echo   1) Copy that whole https://... address, send it to Claude.
echo   2) Also send this line:  STATUS_WRITE_KEY = %STATUS_WRITE_KEY%
echo   3) Keep THIS window open.
echo ============================================================
echo.
cloudflared.exe tunnel --url http://localhost:8787
pause
