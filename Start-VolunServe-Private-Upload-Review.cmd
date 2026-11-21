@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe - PRIVATE National ID Upload First QA (NO DEPLOY)
cd /d "%~dp0"
echo ============================================================
echo  NATIONAL ID FRONT/BACK FILE PICKER + OPTIONAL FACE RESEARCH
echo  ONLY on this PC. No website, Firebase, or photo upload.
echo  Admin review is DEMO ONLY, not a real submission.
echo ============================================================
echo.
if not exist "identity-ai\private_upload_id_review.py" (
  echo ERROR: Open this launcher from the VolunServe project root.
  goto END
)
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher missing.
  goto END
)
py -3.11 -c "import cv2, mediapipe, pytesseract, PIL, fastapi" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Required Python OCR packages missing.
  echo Use the previously configured Python 3.11 staging environment.
  goto END
)
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto RUN
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles%\Tesseract-OCR;%PATH%"
if exist "%ProgramFiles(x86)%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles(x86)%\Tesseract-OCR;%PATH%"
if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe" set "PATH=%LOCALAPPDATA%\Programs\Tesseract-OCR;%PATH%"
:RUN
py -3.11 -c "import pytesseract; pytesseract.get_tesseract_version()" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Local Tesseract OCR app is missing or not on PATH.
  goto END
)
py -3.11 "identity-ai\private_upload_id_review.py"
if errorlevel 1 echo Local upload lab stopped with an error. No account changes.
:END
echo.
pause
endlocal
