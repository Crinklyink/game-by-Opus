@echo off
cd /d "%~dp0"
where node >nul 2>nul && (start "" http://localhost:8080 & node serve.mjs 8080 & goto :eof)
where py >nul 2>nul && (start "" http://localhost:8080 & py -m http.server 8080 & goto :eof)
echo No Node.js or Python found. Just double-click dist\larper48.html instead.
pause
