@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 레이밴 실시간 모니터 백엔드 (이 창 끄지 마세요)

REM ── 윈도우용 더블클릭 실행기 ──
REM 필요: 1) Node.js 설치(https://nodejs.org, LTS)  2) 이 프로젝트 폴더
REM 하는 일: 라이브러리 설치 → cloudflared 자동 다운로드 → 백엔드 + 인터넷 주소 생성

where node >nul 2>nul || (
  echo.
  echo [!] 먼저 Node.js 가 필요해요:  https://nodejs.org  에서 LTS 버전 설치 후 다시 더블클릭.
  echo.
  pause & exit /b 1
)

if not exist node_modules (
  echo [*] 최초 1회 라이브러리 설치 중... 1~2분 걸려요.
  call npm install || ( echo 설치 실패. 인터넷 확인 후 다시 시도. & pause & exit /b 1 )
)

if not exist cloudflared.exe (
  echo [*] cloudflared(인터넷 주소 만들어주는 도구) 내려받는 중...
  powershell -Command "Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'" || ( echo 다운로드 실패. & pause & exit /b 1 )
)

if "%ANTHROPIC_API_KEY%"=="" set /p ANTHROPIC_API_KEY=Anthropic 키 입력(모니터링만 할거면 그냥 Enter):
if "%ANTHROPIC_API_KEY%"=="" set ANTHROPIC_API_KEY=monitoring-only
if "%STATUS_WRITE_KEY%"=="" set STATUS_WRITE_KEY=key%RANDOM%%RANDOM%

echo [*] 백엔드 켜는 중... (새 검은 창이 하나 열려요 — 그 창도 끄지 마세요)
start "claude-backend (끄지 마세요)" cmd /k node ask-server.mjs

timeout /t 2 >nul
echo.
echo ============================================================
echo  잠시 후 아래에  https://....trycloudflare.com  주소가 떠요.
echo  - 그 주소를 복사해서 Claude에게 그대로 붙여 주세요.
echo  - STATUS_WRITE_KEY = %STATUS_WRITE_KEY%   (이 값도 같이 알려주세요)
echo  - 이 창과 방금 열린 창, 둘 다 켜둔 채로 두세요.
echo ============================================================
echo.
cloudflared.exe tunnel --url http://localhost:8787
pause
