@echo off
cd /d "%~dp0"
title Claude Worker deploy

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install LTS from https://nodejs.org then run again.
  pause
  exit /b 1
)

if not exist claude-worker mkdir claude-worker
cd claude-worker

echo Downloading worker files...
powershell -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/main/backend/worker.mjs' -OutFile 'worker.mjs'"
if errorlevel 1 ( echo download failed & pause & exit /b 1 )
powershell -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/main/backend/wrangler.toml' -OutFile 'wrangler.toml'"
if errorlevel 1 ( echo download failed & pause & exit /b 1 )

echo.
echo ============================================================
echo  STEP 1: Cloudflare login. A browser will open - click Allow.
echo  (If you have no Cloudflare account, sign up free - it is quick.)
echo ============================================================
call npx --yes wrangler login

echo.
echo ============================================================
echo  STEP 2: Paste your Anthropic key when it says "Enter a secret value".
echo  (Right-click to paste, then Enter. The key stays on your PC.)
echo ============================================================
call npx --yes wrangler secret put ANTHROPIC_API_KEY

echo.
echo ============================================================
echo  STEP 3: Deploy.
echo ============================================================
call npx --yes wrangler deploy

echo.
echo ============================================================
echo  DONE. Look above for a line like:
echo     https://claude-glasses-ask.SOMETHING.workers.dev
echo  Copy that whole address and send it to Claude.
echo ============================================================
pause
