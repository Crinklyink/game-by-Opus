@echo off
rem Launches Larper 48 as a desktop app (Electron, GPU-accelerated). Builds the app on first run.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "release\Larper48-win32-x64\Larper48.exe" ( start "" "release\Larper48-win32-x64\Larper48.exe" & goto :eof )
where node >nul 2>nul || ( echo Node.js is required to build the app: https://nodejs.org & pause & goto :eof )
if not exist node_modules ( call npm install )
call npm run package && start "" "release\Larper48-win32-x64\Larper48.exe"
