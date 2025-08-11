@echo off
setlocal ENABLEEXTENSIONS

REM ##################################################################
REM # Ultimate All-in-One: Save & Deploy Script                      #
REM # Standalone version by Gemini for Mohamed Elamir                #
REM ##################################################################

REM # --- CONFIGURATION ---
REM # Please fill in your Git details below.
SET GIT_USER_NAME="moalamir52"
SET GIT_USER_EMAIL="mo.alamir52@gmail.com"
REM # --- END CONFIGURATION ---


title Saving and Deploying Project: %CD%
echo.
echo ======================================================
echo = ULTIMATE All-in-One Save ^& Deploy Script         =
echo ======================================================
echo.

REM ########## PART 1: CONFIGURE GIT & SAVE CHANGES ##########

echo [1/3] Configuring Git identity and saving your work...
echo.

REM Step 1.1: Configure Git Identity
git config --global user.name %GIT_USER_NAME%
git config --global user.email %GIT_USER_EMAIL%
echo  - Git identity set to: %GIT_USER_NAME%

REM Step 1.2: Get Commit Message
echo.
set /p COMMIT_MESSAGE=">> Enter your commit message (e.g., 'update summary component'): "
IF "%COMMIT_MESSAGE%"=="" SET COMMIT_MESSAGE=chore: auto-save changes

REM Step 1.3: Add, Commit, and Push changes to 'main'
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
git push origin main --force
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'git push' failed. Could not save your work to GitHub.
    echo    Please check your internet connection and repository permissions.
    goto:eof
)
echo ✅ Your source code is now safely backed up on GitHub.
echo.


REM ########## PART 2: DEPLOY TO GITHUB PAGES ##########

echo [2/3] Starting deployment process...
echo.

REM Step 2.1: Pull latest changes to ensure we are up-to-date
echo  - Ensuring local repository is up to date...
git checkout main
git pull origin main
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'git pull' failed. Please resolve any conflicts before deploying.
    goto:eof
)
echo  - Git repository is up to date.
echo.

REM Step 2.2: Clean install of dependencies
echo  - Installing dependencies using 'npm ci'...
call npm ci
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm ci' failed. Check package-lock.json and npm logs.
    goto:eof
)
echo  - Dependencies installed successfully.
echo.

REM Step 2.3: Build and Deploy using gh-pages
echo  - Building project and deploying to GitHub Pages...
call npm run deploy
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: 'npm run deploy' failed. Check the build logs for errors.
    goto:eof
)
echo ✅ Project deployed successfully to 'gh-pages' branch.
echo.

REM ########## PART 3: FINAL CLEANUP ##########

echo [3/3] Finalizing and cleaning up...
echo.
git remote prune origin
echo ✅ Cleanup complete.
echo.


echo ======================================================
echo = 🚀 SAVE ^& DEPLOYMENT COMPLETE!                      =
echo ======================================================
echo.

pause