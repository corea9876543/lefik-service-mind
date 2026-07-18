@echo off
chcp 65001 >nul
cd /d %~dp0
:loop
python listener.py
echo listener exited, restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
