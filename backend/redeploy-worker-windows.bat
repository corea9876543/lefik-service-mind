@echo off
cd /d "%~dp0"
title Claude Worker re-deploy

if not exist claude-worker (
  echo claude-worker folder not found next to this file.
  echo Run deploy-worker.bat first ^(or put this file on the Desktop next to it^).
  pause
  exit /b 1
)
cd claude-worker

echo Updating worker code...
powershell -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/main/backend/worker.mjs' -OutFile 'worker.mjs'"
if errorlevel 1 ( echo download failed & pause & exit /b 1 )
powershell -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/main/backend/wrangler.toml' -OutFile 'wrangler.toml'"
if errorlevel 1 ( echo download failed & pause & exit /b 1 )

echo Deploying (no login / no key needed - already saved)...
call npx --yes wrangler deploy

echo.
echo ============================================================
echo  Done. Address is the same: claude-glasses-ask.yongyongyo.workers.dev
echo  Now re-run the /ask test in PowerShell.
echo ============================================================
pause
