@echo off
setlocal ENABLEEXTENSIONS

echo.
echo 🚀 Starting deployment in folder: %CD%
echo.

REM Step 1: Switch to main branch or rename if needed
git checkout main
IF %ERRORLEVEL% NEQ 0 (
    echo ⚠️ 'main' branch not found. Attempting to rename current branch to 'main'...
    git branch -m main
    git push -u origin main --force
) ELSE (
    echo ✅ Switched to 'main' branch
)

echo.
echo 🧩 Installing dependencies...
call npm install

echo.
echo 🛠️ Running build...
call npm run build

echo.
echo 🔄 Copying build files to root...
xcopy /E /Y /I build\* .\ >nul
IF %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Failed to copy files from build
) ELSE (
    echo ✅ Files copied successfully
)

echo.
echo 💾 Committing and pushing to GitHub...
git add .
git commit -m "Auto-deploy: build copied to root and pushed"
git push origin main

echo.
echo 🧹 Deleting old branches if they exist...
git push origin --delete gh-pages
git push origin --delete master

echo.
echo 🔃 Cleaning local remote references...
git remote prune origin

echo.
echo ✅ Deployment Complete! Visit your GitHub Pages URL to check.
echo.
pause
