@echo off
setlocal ENABLEEXTENSIONS

REM ##################################################################
REM # Self-Fixing Ultimate All-in-One: Save & Deploy Script          #
REM # Automatically handles 'safe.directory' issues.                 #
REM # By Gemini for Mohamed Elamir                                   #
REM ##################################################################

REM # --- CONFIGURATION ---
SET GIT_USER_NAME="moalamir52"
SET GIT_USER_EMAIL="mo.alamir52@gmail.com"
REM # --- END CONFIGURATION ---


title Saving and Deploying Project: %CD%
echo.
echo ======================================================
echo = ULTIMATE All-in-One Save ^& Deploy Script         =
echo ======================================================
echo.

REM ########## PART 1: AUTO-FIX & CONFIGURE ##########

echo [1/4] Preparing environment...
echo.

REM Step 1.1: Automatically fix 'dubious ownership' issue
echo  - Adding current directory to Git's safe list...
git config --global --add safe.directory "%CD%"
echo  - Done.

REM Step 1.2: Configure Git Identity
echo  - Configuring Git identity...
git config --global user.name %GIT_USER_NAME%
git config --global user.email %GIT_USER_EMAIL%
echo  - Git identity set to: %GIT_USER_NAME%
echo.

REM ########## PART 2: SAVE SOURCE CODE ##########

echo [2/4] Saving your work to 'main' branch...
echo.
set /p COMMIT_MESSAGE=">> Enter your commit message (e.g., 'update maintenance page'): "
IF "%COMMIT_MESSAGE%"=="" SET COMMIT_MESSAGE=chore: auto-save changes

echo.
echo  - Committing with message: "%COMMIT_MESSAGE%"
git add .
git commit -m "%COMMIT_MESSAGE%"
IF %ERRORLEVEL% NEQ 0 (
    echo  - WARNING: 'git commit' failed. This is okay if there were no new changes to save.
) ELSE (
    echo  - Changes committed successfully.
)

echo.
echo  - Pushing source code to 'main' on GitHub...
git push origin main
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'git push' failed. Could not save your work to GitHub.
    goto:eof
)
echo ✅ Your source code is now safely backed up on GitHub.
echo.


REM ########## PART 3: DEPLOY TO GITHUB PAGES ##########

echo [3/4] Starting deployment to GitHub Pages...
echo.

REM Step 3.1: Clean install of dependencies
echo  - Installing dependencies using 'npm ci'...
call npm ci
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm ci' failed. Check package-lock.json and npm logs.
    goto:eof
)
echo  - Dependencies installed successfully.
echo.

REM Step 3.2: Build and Deploy using gh-pages
echo  - Building project and deploying...
call npm run deploy
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm run deploy' failed. Check the build logs for errors.
    goto:eof
)
echo ✅ Project deployed successfully to 'gh-pages' branch.
echo.

REM ########## PART 4: FINAL CLEANUP ##########

echo [4/4] Finalizing and cleaning up...
echo.
git remote prune origin
echo ✅ Cleanup complete.
echo.


echo ======================================================
echo = 🚀 SAVE ^& DEPLOYMENT COMPLETE!                      =
echo ======================================================
echo.

pause