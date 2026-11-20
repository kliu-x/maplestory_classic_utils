@echo off
rem Starts the tracker (no console window). If nothing appears, try run_debug.bat to see any error.
cd /d "%~dp0"
for %%P in ("pyw -3" pythonw) do (
  %%~P -c "import cv2, mss, numpy, PIL" >nul 2>nul && (
    start "" %%~P maple_tracker.py
    goto :eof
  )
)
echo The tracker needs Python and a few packages:
echo   1. Install Python from https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^)
echo   2. Double-click install.bat once
echo   3. Double-click run.bat again
pause
