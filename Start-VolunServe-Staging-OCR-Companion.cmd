@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe - STAGING National ID OCR local-only companion
cd /d "%~dp0"
echo ==============================================================
echo  STAGING VERIFIED RESIDENT - NATIONAL ID FRONT + BACK OCR
echo  Local-only companion on 127.0.0.1:8765
echo  NO Firebase, cloud uploads, or Resident auto-approval.
echo ==============================================================
echo.
if not exist "identity-ai\staging_national_id_loopback.py" (
  echo ERROR: Missing local companion Python file in identity-ai.
  goto END
)
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher missing.
  goto END
)
py -3.11 -c "import cv2, pytesseract, PIL, fastapi, mediapipe" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Existing Python 3.11 OCR environment is incomplete.
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
  echo ERROR: Tesseract OCR executable unavailable.
  goto END
)
echo.
echo Keep this terminal running during the staging WEB demo.
echo Open the staging Verified Resident page on this SAME PC.
echo After you finish, press Ctrl+C to stop the companion.
echo.
py -3.11 "identity-ai\staging_national_id_loopback.py"
if errorlevel 1 echo The local companion stopped. No cloud changes were made.
:END
echo.
pause
endlocal
