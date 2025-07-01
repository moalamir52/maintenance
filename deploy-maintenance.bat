@echo off
setlocal

echo 🚀 Starting React Build and Deployment...
cd /d %~dp0

:: Build Step
echo 🔨 Building the project...
npm run build
if errorlevel 1 (
    echo ❌ Build failed! Check your code and try again.
    goto end
)

:: Deploy Step
echo 🚀 Deploying to GitHub Pages...
npm run deploy
if errorlevel 1 (
    echo ❌ Deployment failed! Check gh-pages config or GitHub access.
    goto end
)

:: Success Message
echo ✅ Deployment completed successfully.
echo 🔗 Open: https://moalamir52.github.io/maintenance/

:end
echo.
echo Press any key to exit...
pause >nul
