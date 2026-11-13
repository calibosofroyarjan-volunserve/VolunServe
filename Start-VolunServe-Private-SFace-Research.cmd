@echo off
setlocal EnableExtensions
chcp 65001 >nul
title VolunServe - OPTIONAL Local SFace Research - NO ID VERIFICATION
cd /d "%~dp0"
echo ================================================================
echo    VolunServe SFace RESEARCH ONLY - LOCAL / NO UPLOAD
echo    This cannot verify an ID, match identity, prove liveness,
echo    change a user account or bypass normal document review.
echo ================================================================
echo.
echo Optional research models: OpenCV YuNet and SFace, approximately 37 MB.
echo If not present, this downloads model weights from OpenCV Zoo via
echo Hugging Face. Downloads use exact pinned SHA256 checks; no photos,
echo ID details, OCR text, account credentials or selfies are uploaded.
echo Already downloaded valid weights will be reused.
echo.
choice /C YN /N /M "Consent to downloading/checking ONLY these models? [Y/N]: "
if errorlevel 2 goto CANCEL
where py >nul 2>nul
if errorlevel 1 goto NO_PYTHON
py -3.11 "identity-ai\download_yunet_model.py"
if errorlevel 1 goto MODEL_FAILED
py -3.11 "identity-ai\download_sface_model.py"
if errorlevel 1 goto MODEL_FAILED
set "VOLUNSERVE_SFACE_SHADOW=1"
echo.
echo Research models ready. On scanner main window, check the separate
echo "Optional: SFace FACE RESEARCH ONLY" box BEFORE starting the scan.
echo A similarity observation is NOT a verified ID or identity decision.
call "%~dp0Start-VolunServe-Private-ID-Review.cmd"
goto END
:CANCEL
echo No models downloaded or scanner started.
goto END
:NO_PYTHON
echo Python 3.11 launcher missing. No changes were made.
goto ERROR_END
:MODEL_FAILED
echo Model acquisition failed checksum, connection, or file checks.
echo No ID/face media was sent. Local SFace research was NOT started.
goto ERROR_END
:ERROR_END
echo Use the normal offline scanner or manually review low-quality images.
:END
echo.
pause
endlocal
