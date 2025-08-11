@echo off
setlocal ENABLEEXTENSIONS

REM ##################################################################
REM # Safe & Universal React Deployment Script for GitHub Pages      #
REM ##################################################################

title Deploying Project: %CD%
echo.
echo ======================================================
echo = Starting Deployment for React Project              =
echo ======================================================
echo.

REM Step 1: Go to the main branch and pull the latest changes
echo [1/4] Fetching latest updates from Git...
git checkout main
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: Could not checkout 'main' branch. Please check branch name.
    goto:eof
)

git pull origin main
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'git pull' failed. Please check for conflicts or network issues.
    goto:eof
)
echo ✅ Git repository is up to date.
echo.

REM Step 2: Clean install of dependencies
echo [2/4] Installing dependencies using 'npm ci'...
REM 'npm ci' is faster and safer for deployment environments than 'npm install'
call npm ci
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm ci' failed. Check package-lock.json and npm logs.
    goto:eof
)
echo ✅ Dependencies installed successfully.
echo.


REM Step 3: Deploy to GitHub Pages
echo [3/4] Building project and deploying to GitHub Pages...
call npm run deploy
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm run deploy' failed. Check the build logs for errors.
    goto:eof
)
echo ✅ Project deployed successfully to 'gh-pages' branch.
echo.

REM Step 4: Final cleanup
echo [4/4] Cleaning up local remote references...
git remote prune origin
echo ✅ Cleanup complete.
echo.

echo ======================================================
echo = 🚀 DEPLOYMENT COMPLETE!                             =
echo ======================================================
echo.

pause