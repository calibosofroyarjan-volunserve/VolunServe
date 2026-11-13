@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe - PRIVATE National ID and Selfie Review (NO UPLOAD)
color 0A
cd /d "%~dp0"
echo =============================================================
echo   VolunServe National ID + Selfie - PRIVATE LAB ONLY
echo   No deploy / no server calls / no account verification
echo =============================================================
echo.
if not exist "identity-ai\local_national_id_selfie_review.py" goto WRONG_FOLDER
where py >nul 2>nul
if errorlevel 1 goto NO_PYTHON
py -3.11 -c "import cv2, mediapipe, pytesseract, PIL, fastapi" >nul 2>nul
if errorlevel 1 goto DEPS_MISSING
py -3.11 "identity-ai\local_national_id_selfie_review.py"
if errorlevel 1 goto RUN_FAILED
goto END
:WRONG_FOLDER
echo ERROR: Put this file in the VolunServe project root.
goto ERROR_END
:NO_PYTHON
echo ERROR: Install Python 3.11 for Windows first.
goto ERROR_END
:DEPS_MISSING
echo Required Python packages are missing. Install (with consent):
echo py -3.11 -m pip install -r identity-ai\requirements.txt
echo Tesseract OCR desktop program must also be installed separately.
goto ERROR_END
:RUN_FAILED
echo Local review closed with an error. Check dependencies.
goto ERROR_END
:ERROR_END
echo No documents uploaded, saved, or submitted.
:END
echo.
pause
endlocal
