@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe NATIONAL ID FRONT BACK - PRIVATE OCR
cd /d "%~dp0"
echo ==============================================================
echo  VOLUNSERVE - National ID FRONT + BACK local OCR test
echo  TWO photo inputs required; no DOB/selfie/Firebase/deployment
echo ==============================================================
if not exist "identity-ai\local_national_id_both_sides.py" (
  echo ERROR: Open from VolunServe project root.
  goto END
)
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher missing.
  goto END
)
py -3.11 -c "import cv2, pytesseract, PIL, fastapi, mediapipe" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python 3.11 dependencies missing.
  goto END
)
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto CHECK
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles%\Tesseract-OCR;%PATH%"
if exist "%ProgramFiles(x86)%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles(x86)%\Tesseract-OCR;%PATH%"
if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe" set "PATH=%LOCALAPPDATA%\Programs\Tesseract-OCR;%PATH%"
:CHECK
py -3.11 -c "import pytesseract; pytesseract.get_tesseract_version()" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Local Tesseract executable unavailable.
  goto END
)
py -3.11 "identity-ai\local_national_id_both_sides.py"
if errorlevel 1 echo OCR scanner stopped; no user account was changed.
:END
echo.
pause
endlocal
