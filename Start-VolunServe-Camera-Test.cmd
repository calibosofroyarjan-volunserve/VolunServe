@echo off
setlocal EnableExtensions
pushd "%~dp0"
if not exist "identity-ai\start_pad_laptop_gui.py" (
  echo [ERROR] Open this launcher from the VolunServe project root.
  echo Missing identity-ai\start_pad_laptop_gui.py
  pause
  exit /b 2
)
where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python launcher not found. Install Python 3.11 with the Windows 'py' launcher.
  echo No webcam or biometric data has been accessed.
  pause
  exit /b 2
)
py -3.11 "identity-ai\start_pad_laptop_gui.py"
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo The local staging research pilot did not complete. No ID was verified.
)
echo.
echo This was ONLY local experimental QA: not validated anti-spoofing.
pause
popd
exit /b %EXITCODE%
