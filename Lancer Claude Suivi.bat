@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere installation...
  call npm ci
)
start "" /min cmd /c "npm start"
