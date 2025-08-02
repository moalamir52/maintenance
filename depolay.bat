@echo off
setlocal

echo -----------------------------------------------
echo Starting GitHub Pages deployment from master...
echo -----------------------------------------------

:: Set variables
set REPO=https://github.com/moalamir52/maintenance.git
set TEMP=temp-publish

:: Remove old temporary folder if it exists
if exist %TEMP% (
  echo Removing previous %TEMP% folder...
  rmdir /S /Q %TEMP%
)

:: Create a new temporary folder
mkdir %TEMP%

:: Run build
echo Running build command...
call npm run build

:: Copy build output to temp folder
echo Copying build files to %TEMP%...
xcopy build %TEMP%\ /E /H /C /I

:: Go into the temp folder
cd %TEMP%

:: Initialize a new git repo
git init
git remote add origin %REPO%
git checkout -b gh-pages

:: Add and commit files
git add .
git commit -m "Auto-deploy from master"
git push --force origin gh-pages

:: Go back and remove temp folder
cd ..
rmdir /S /Q %TEMP%

:: Done
echo.
echo Deployment to GitHub Pages completed successfully!
echo Visit: https://moalamir52.github.io/maintenance/
echo.

pause
