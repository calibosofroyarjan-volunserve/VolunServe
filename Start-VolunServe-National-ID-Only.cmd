@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe National ID Type Check - PRIVATE / NO UPLOAD
cd /d "%~dp0"
echo ==============================================================
echo   VOLUNSERVE - PHILIPPINE NATIONAL ID ONLY - OCR TYPE CHECK
echo   OFFLINE TEST - NO DOB, NO SELFIE, NO FIREBASE, NO DEPLOY
echo ==============================================================
if not exist "identity-ai\local_national_id_type_only.py" (
  echo ERROR: Launch from VolunServe project root.
  goto DONE
)
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python 3.11 launcher not found.
  goto DONE
)
py -3.11 -c "import cv2, pytesseract, PIL, fastapi, mediapipe" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Local Python OCR packages missing.
  goto DONE
)
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto CHECK
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles%\Tesseract-OCR;%PATH%"
if exist "%ProgramFiles(x86)%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles(x86)%\Tesseract-OCR;%PATH%"
if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe" set "PATH=%LOCALAPPDATA%\Programs\Tesseract-OCR;%PATH%"
:CHECK
py -3.11 -c "import pytesseract; pytesseract.get_tesseract_version()" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Local Tesseract executable not found.
  goto DONE
)
py -3.11 "identity-ai\local_national_id_type_only.py"
if errorlevel 1 echo Local OCR stopped. No account was modified.
:DONE
echo.
pause
endlocal
