@echo off
setlocal EnableExtensions
title Twitch Golf - local dev
cd /d "%~dp0"

rem --- find Git Bash -------------------------------------------------------
set "BASH="
for %%B in (
  "%ProgramFiles%\Git\bin\bash.exe"
  "%ProgramFiles(x86)%\Git\bin\bash.exe"
  "%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
) do if not defined BASH if exist "%%~B" set "BASH=%%~B"
if not defined BASH for /f "delims=" %%B in ('where bash 2^>nul') do if not defined BASH set "BASH=%%B"

if not defined BASH (
  echo.
  echo   Could not find Git Bash. Install "Git for Windows", or open a
  echo   Git Bash prompt in this folder and run:  bash scripts/dev.sh
  echo.
  pause
  exit /b 1
)

rem --- config (edit here or set before launching) ------------------------
if not defined GOLF_AUTOSTART set "GOLF_AUTOSTART=seaside"
if not defined GOLF_ROUND_SECONDS set "GOLF_ROUND_SECONDS=15"

rem --- open the overlay + dashboard once the server is up ---------------
start "" /min cmd /c "timeout /t 9 >nul & start "" "http://127.0.0.1:5180/video_component.html?role=viewer" & start "" "http://127.0.0.1:5180/dashboard.html?role=broadcaster&user=streamer""

echo.
echo   Starting EBS + overlay + chat ingest...
echo   Type swings in this window, e.g.   alice: !70, 50
echo   Close this window (or press Ctrl+C) to stop everything.
echo.

"%BASH%" -c "AUTOSTART='%GOLF_AUTOSTART%' ROUND_SECONDS='%GOLF_ROUND_SECONDS%' bash scripts/dev.sh"

echo.
pause
