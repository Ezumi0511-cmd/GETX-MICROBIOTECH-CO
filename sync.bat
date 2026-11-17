@echo off
rem Sync this folder with GitHub: pull CMS edits first, then upload local changes.
cd /d "%~dp0"
echo [1/3] Downloading latest changes from GitHub (including Pages CMS edits)...
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo Download failed or there is a conflict. Nothing was uploaded.
  pause
  exit /b 1
)
echo [2/3] Saving local changes...
git add -A
git diff --cached --quiet && (
  echo No local changes to upload.
) || (
  git commit -q -m "Update site %date% %time%"
)
echo [3/3] Uploading to GitHub...
git push
if errorlevel 1 (
  echo.
  echo Upload failed.
  pause
  exit /b 1
)
echo.
echo Done. The live site updates in about 1 minute (press Ctrl+F5 to refresh).
pause
