@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe - Private SFace Two-Photo QA (NO DEPLOY)
cd /d "%~dp0"
echo ========================================================
echo    PRIVATE LOCAL SFace TWO-PHOTO RESEARCH
echo    No ID uploads, no Firebase, no deployment, no account approval.
echo    Select TWO existing consented photos in the SAME local folder.
echo    Model weights must already be installed.
echo ========================================================
echo.
where py >nul 2>nul
if errorlevel 1 goto NO_PYTHON
py -3.11 "identity-ai\choose_sface_pair_local.py"
if errorlevel 1 echo A LOCAL_SFACE_BLOCKED reason was printed above. No images uploaded.
goto END
:NO_PYTHON
echo LOCAL_SFACE_BLOCKED: Python 3.11 launcher unavailable.
:END
echo.
pause
endlocal
