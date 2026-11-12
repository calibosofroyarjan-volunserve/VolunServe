"""OpenCV YuNet face detection, staging-only QA support (NOT liveness).

YuNet 2023mar MIT license, copyright 2020 Shiqi Yu; model downloaded
with a SHA256 check during staging Docker build.
No face media or detections are persisted, logged or sent to any model vendor.
This module cannot approve identity; camera challenges and uncalibrated
single-frame classifiers remain insufficient for PAD verification.
"""
import hashlib
import threading
from pathlib import Path

import cv2
import numpy as np

MODEL_PATH = Path(__file__).resolve().parent / "models" / "face_detection_yunet_2023mar.onnx"
MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
MAX_BYTES = 512 * 1024
_LOCK = threading.RLock()
_DETECTOR = None
_FAILED = False


def _load_detector():
    global _DETECTOR, _FAILED
    if _FAILED:
        return None
    if _DETECTOR is not None:
        return _DETECTOR
    with _LOCK:
        if _DETECTOR is not None:
            return _DETECTOR
        try:
            if not MODEL_PATH.is_file() or not 0 < MODEL_PATH.stat().st_size <= MAX_BYTES:
                _FAILED = True
                return None
            if hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() != MODEL_SHA256:
                _FAILED = True
                return None
            detector = cv2.FaceDetectorYN.create(
                str(MODEL_PATH), "", (320, 320), 0.7, 0.3, 1000)
            # Smoke-test the model using only synthetic black pixels.
            faces = detector.detect(np.zeros((320, 320, 3), dtype=np.uint8))
            if not isinstance(faces, tuple) or len(faces) != 2:
                _FAILED = True
                return None
            _DETECTOR = detector
            return detector
        except (cv2.error, OSError, ValueError, AttributeError, TypeError):
            _FAILED = True
            return None


def readiness():
    return {
        "model": "opencv-yunet-face-detector-2023mar",
        "modelLoaded": _load_detector() is not None,
        "identityDecisionUse": "none",
        "independentPadValidated": False,
    }


def inspect_frame(image):
    """Return coarse QA-only face count categories, never coordinates or images."""
    detector = _load_detector()
    if detector is None:
        return "unavailable"
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3:
        return "inconclusive"
    height, width = image.shape[:2]
    if not 120 <= height <= 3000 or not 120 <= width <= 3000:
        return "inconclusive"
    try:
        with _LOCK:
            detector.setInputSize((width, height))
            _ok, faces = detector.detect(image)
        count = 0 if faces is None else len(faces)
        if count == 1:
            return "one_face_unvalidated"
        if count == 0:
            return "no_face"
        return "multiple_faces"
    except (cv2.error, TypeError, ValueError):
        return "inconclusive"
