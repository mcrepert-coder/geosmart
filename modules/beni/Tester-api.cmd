@echo off
setlocal
cd /d "%~dp0api"
if not exist node_modules call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto fin
call npm.cmd test
:fin
pause
