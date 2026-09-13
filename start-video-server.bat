@echo off
title MyStore Video Storage Server
echo ============================================
echo  MyStore Video Storage Server
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if video-server.js exists
if not exist "video-server.js" (
    echo ERROR: video-server.js not found in current directory.
    echo Make sure you are running this from the Mystore folder.
    pause
    exit /b 1
)

REM Create storage directory if it doesn't exist
if not exist "D:\NetStream\videos" (
    echo Creating storage directory: D:\NetStream\videos
    mkdir "D:\NetStream\videos"
)

echo Starting video storage server...
echo.
echo Press Ctrl+C to stop the server.
echo.
node video-server.js
pause
