@echo off
setlocal
rem VolunServe PRIVATE local facial/PAD validation menu.
rem This launcher does not download models, upload photos, or deploy services.
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3.11 "identity-ai\start_critical_face_pad_local.py"
    set "VOLUNSERVE_RESULT=%ERRORLEVEL%"
    goto end
)
where python >nul 2>&1
if not errorlevel 1 (
    python "identity-ai\start_critical_face_pad_local.py"
    set "VOLUNSERVE_RESULT=%ERRORLEVEL%"
    goto end
)
echo Python is not installed or not found. Nothing was downloaded or uploaded.
set "VOLUNSERVE_RESULT=2"
:end
if not "%VOLUNSERVE_RESULT%"=="0" (
    echo.
    echo Local test did not complete. Check Python 3.11, installed dependencies, private consent and pinned model files.
)
echo.
pause
exit /b %VOLUNSERVE_RESULT%
