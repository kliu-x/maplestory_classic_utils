@echo off
rem Same as run.bat but keeps a console window open, so any error message is visible.
cd /d "%~dp0"
for %%P in ("py -3" python) do (
  %%~P -c "import sys" >nul 2>nul && (
    %%~P maple_tracker.py
    echo.
    echo The tracker has closed.
    pause
    goto :eof
  )
)
echo Could not find Python. Install it from https://www.python.org/downloads/
pause
