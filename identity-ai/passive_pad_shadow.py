"""Experimental ONNX passive PAD in SHADOW-ONLY mode for VolunServe staging.

Model: MiniFASNetV2 2.7x80x80, Apache-2.0 (MinivisionAI / garciafido).
A *single* frame cannot establish liveness. Labels here are model
observations only: NO authentication, identity grant, auto-rejection,
biometric logging, image persistence, or trusted signed PAD attestation.

For actual approval use a separate independently validated PAD service,
multi-frame challenge + human/issuer checks. Capture/upload currently blocked.
"""
import hashlib
import math
import os
import threading
from pathlib import Path

import cv2
import numpy as np
from yunet_shadow import readiness as yunet_readiness

MODEL_PATH = Path(__file__).resolve().parent / "models" / "minifasnet_v2.onnx"
MODEL_SHA256 = "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b"
MODEL_BYTES = 1_744_116
_LOCK = threading.RLock()
_NET = None
_FAILED = False

# A deliberately simple preview classification, NOT a calibrated PAD threshold.
SHADOW_THRESHOLD = 0.75


def shadow_enabled():
    return os.getenv("VOLUNSERVE_PASSIVE_PAD_SHADOW", "0") == "1"


def _load_net():
    global _NET, _FAILED
    if not shadow_enabled() or _FAILED:
        return None
    if _NET is not None:
        return _NET
    with _LOCK:
        if _NET is not None:
            return _NET
        try:
            if not MODEL_PATH.is_file() or MODEL_PATH.stat().st_size != MODEL_BYTES:
                _FAILED = True
                return None
            if hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() != MODEL_SHA256:
                _FAILED = True
                return None
            model = cv2.dnn.readNetFromONNX(str(MODEL_PATH))
            # Verify expected (3 class) output on a synthetic array, not a face.
            model.setInput(np.zeros((1, 3, 80, 80), dtype=np.float32))
            out = np.asarray(model.forward())
            if out.size != 3 or not np.isfinite(out).all():
                _FAILED = True
                return None
            _NET = model
            return model
        except (cv2.error, OSError, ValueError):
            _FAILED = True
            return None


def readiness():
    """A model can load without being validated on real people or attacks."""
    return {"shadowEnabled": shadow_enabled(),
            "modelLoaded": _load_net() is not None,
            "independentPadValidated": False,
            "identityDecisionUse": "none",
            "model": "minifasnet-v2-onnx-shadow",
            "faceDetectorShadow": yunet_readiness(),
            "note": "Single-frame experimental classifier; not certified liveness."}


def _face_crop(image):
    """Return a 2.7x context crop for exactly one clearly detected face."""
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3:
        return None
    height, width = image.shape[:2]
    if height < 120 or width < 120 or height > 3000 or width > 3000:
        return None
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    face_detector = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if face_detector.empty():
        return None
    faces = face_detector.detectMultiScale(
        gray, scaleFactor=1.08, minNeighbors=5, minSize=(60, 60))
    if len(faces) != 1:
        return None
    x, y, w, h = map(int, faces[0])
    side = max(w, h) * 2.7
    left = int(round(x + w / 2 - side / 2))
    top = int(round(y + h / 2 - side / 2))
    right = int(round(x + w / 2 + side / 2))
    bottom = int(round(y + h / 2 + side / 2))
    # Never invent padded context outside the photographed frame.
    if left < 0 or top < 0 or right > width or bottom > height:
        return None
    roi = image[top:bottom, left:right]
    if roi.size == 0:
        return None
    return cv2.resize(roi, (80, 80), interpolation=cv2.INTER_LINEAR)


def assess_frame_shadow(image):
    """Only label experimental predictions; NEVER use for Verified Resident."""
    if not shadow_enabled():
        return {"status": "disabled", "independentPadValidated": False}
    net = _load_net()
    if net is None:
        return {"status": "unavailable", "independentPadValidated": False}
    try:
        crop = _face_crop(image)
        if crop is None:
            return {"status": "inconclusive", "independentPadValidated": False}
        # Source model card: BGR input, [0,1] normalization, NCHW 1x3x80x80.
        blob = cv2.dnn.blobFromImage(
            crop, scalefactor=1.0/255.0, size=(80, 80),
            mean=(0, 0, 0), swapRB=False, crop=False)
        with _LOCK:
            net.setInput(blob)
            logits = np.asarray(net.forward(), dtype=np.float64).reshape(-1)
        if logits.size != 3 or not np.isfinite(logits).all():
            return {"status": "inconclusive", "independentPadValidated": False}
        shifted = logits - float(np.max(logits))
        exp = np.exp(shifted)
        probs = exp / exp.sum()
        # IMPORTANT: the original MiniVisionAI Silent-Face-Anti-Spoofing
        # test.py defines class 1 as REAL, while 0 and 2 are ATTACK classes.
        # The third-party ONNX card incorrectly describes class 0 as live.
        # These weights were converted from the upstream MiniFASNetV2 model.
        # Until independently confirmed on representative camera samples,
        # treat all labels as unvalidated SHADOW observations only.
        label = int(np.argmax(probs))
        confidence = float(probs[label])
        if not math.isfinite(confidence) or confidence < SHADOW_THRESHOLD:
            status = "inconclusive"
        elif label == 1:
            status = "model_prefers_live_unvalidated"
        else:
            status = "model_prefers_attack_unvalidated"
        # Never expose raw images or scores to user profile/Firestore.
        return {"status": status, "independentPadValidated": False}
    except (cv2.error, ValueError, TypeError, OverflowError):
        return {"status": "inconclusive", "independentPadValidated": False}
