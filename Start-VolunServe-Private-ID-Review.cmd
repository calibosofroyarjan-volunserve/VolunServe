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
rem Tesseract is a separate Windows executable; pip installing pytesseract
rem alone does not make it available on PATH. Look only in expected local
rem folders, without installing anything or modifying system-wide settings.
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto TEST_TESSERACT
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" set "PATH=%ProgramFiles%\Tesseract-OCR;%PATH%"
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto TEST_TESSERACT
if exist "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe" set "PATH=C:\Program Files (x86)\Tesseract-OCR;%PATH%"
where tesseract.exe >nul 2>nul
if not errorlevel 1 goto TEST_TESSERACT
if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe" set "PATH=%LOCALAPPDATA%\Programs\Tesseract-OCR;%PATH%"
:TEST_TESSERACT
py -3.11 -c "import pytesseract; pytesseract.get_tesseract_version()" >nul 2>nul
if errorlevel 1 goto OCR_MISSING
echo Local Tesseract OCR executable available.
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
:OCR_MISSING
echo ERROR: The Tesseract OCR desktop executable was not found.
echo Tried PATH, Program Files and local user Programs folders.
echo Check whether "C:\Program Files\Tesseract-OCR\tesseract.exe" exists.
echo If installed elsewhere, add that folder to PATH in your terminal.
echo Example: set "PATH=C:\Program Files\Tesseract-OCR;%%PATH%%"
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
