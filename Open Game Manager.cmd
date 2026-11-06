@echo off
setlocal
cd /d "%~dp0"
curl.exe --fail --silent --output NUL http://127.0.0.1:8790/game-manager/
if errorlevel 1 (
  start "Firemon Game Manager" cmd /k "cd /d ""%~dp0"" && node tools/game-manager.mjs"
  for /l %%I in (1,1,20) do (
    timeout /t 1 /nobreak >nul
    curl.exe --fail --silent --output NUL http://127.0.0.1:8790/game-manager/
    if not errorlevel 1 goto open
  )
  echo Game Manager did not start. Make sure Node.js is installed and check its window for errors.
  pause
  exit /b 1
)
:open
start "" http://127.0.0.1:8790/game-manager/
endlocal
