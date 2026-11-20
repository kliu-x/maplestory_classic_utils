@echo off
rem Installs the packages the tracker needs. Run this once.
cd /d "%~dp0"
for %%P in ("py -3" python) do (
  %%~P -m pip --version >nul 2>nul && (
    %%~P -m pip install -r requirements.txt
    echo.
    echo Done. Now double-click run.bat to start the tracker.
    pause
    goto :eof
  )
)
echo Could not find Python.
echo Install it from https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^),
echo then double-click this file again.
pause
