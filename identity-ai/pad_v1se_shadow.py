"""Experimental MiniFASNetV1SE SECOND OPINION for VolunServe staging.

Apache-2.0 weights by MinivisionAI, ONNX release by yakhyo.
This model is from the SAME training family as V2: agreement is CORRELATED
and is NOT independent evidence of liveness. No automatic approval.
No images, scores or embeddings are uploaded, logged or persisted here.
"""
import hashlib
import os
import threading
from pathlib import Path

import cv2
import numpy as np

import passive_pad_shadow as v2
from yunet_shadow import single_face_box

MODEL_PATH = Path(__file__).resolve().parent / "models" / "minifasnet_v1se.onnx"
MODEL_SHA256 = "ebab7f90c7833fbccd46d3a555410e78d969db5438e169b6524be444862b3676"
MIN_BYTES = 1_000_000
MAX_BYTES = 3_000_000
_LOCK = threading.RLock()
_NET = None
_FAILED = False


def shadow_enabled():
    return os.getenv("VOLUNSERVE_PAD_V1SE_SHADOW", "0") == "1"


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
            if not MODEL_PATH.is_file():
                _FAILED = True
                return None
            contents = MODEL_PATH.read_bytes()
            if (not MIN_BYTES <= len(contents) <= MAX_BYTES or
                    hashlib.sha256(contents).hexdigest() != MODEL_SHA256):
                _FAILED = True
                return None
            net = cv2.dnn.readNetFromONNX(str(MODEL_PATH))
            net.setInput(np.zeros((1, 3, 80, 80), dtype=np.float32))
            output = np.asarray(net.forward())
            if output.size != 3 or not np.isfinite(output).all():
                _FAILED = True
                return None
            _NET = net
            return net
        except (cv2.error, OSError, ValueError, TypeError):
            _FAILED = True
            return None


def readiness():
    return {
        "model": "minifasnet-v1se-4x-onnx-shadow",
        "shadowEnabled": shadow_enabled(),
        "modelLoaded": _load_net() is not None,
        "independentPadValidated": False,
        "modelClassMappingValidated": False,
        "modelInputScaleValidated": False,
        "thresholdCalibrated": False,
        "identityDecisionUse": "none",
        "note": "Second model is same-source family, not independent PAD validation.",
    }


def _face_crop_4x(image):
    if (not isinstance(image, np.ndarray) or image.dtype != np.uint8 or
            image.ndim != 3 or image.shape[2] != 3):
        return None
    height, width = image.shape[:2]
    if not 120 <= height <= 3000 or not 120 <= width <= 3000:
        return None
    face = single_face_box(image)
    if face is None:
        return None
    x, y, w, h = face
    # V1SE upstream crop scale 4.0 (distinct from V2's 2.7x).
    # Do not pad missing background or recycle V2's smaller crop.
    left = int(round(x + w / 2 - w * 4.0 / 2))
    right = int(round(x + w / 2 + w * 4.0 / 2))
    top = int(round(y + h / 2 - h * 4.0 / 2))
    bottom = int(round(y + h / 2 + h * 4.0 / 2))
    if (left < 0 or top < 0 or right > width or bottom > height or
            right <= left or bottom <= top):
        return None
    region = image[top:bottom, left:right]
    if region.size == 0:
        return None
    return cv2.resize(region, (80, 80), interpolation=cv2.INTER_LINEAR)


def assess_secondary_shadow(image):
    base = {"independentPadValidated": False, "identityDecisionUse": "none"}
    if not shadow_enabled():
        return dict(base, status="disabled")
    net = _load_net()
    if net is None:
        return dict(base, status="unavailable")
    try:
        crop = _face_crop_4x(image)
        if crop is None:
            return dict(base, status="inconclusive")
        labels = []
        with _LOCK:
            for factor in (1.0, 1.0 / 255.0):
                blob = cv2.dnn.blobFromImage(
                    crop, scalefactor=factor, size=(80, 80),
                    mean=(0, 0, 0), swapRB=False, crop=False)
                net.setInput(blob)
                labels.append(v2._experimental_label(net.forward()))
        # Never let one score override conflicting preprocessing hypotheses.
        status = (labels[0] if labels[0] == labels[1] and
                  labels[0] != "inconclusive" else "inconclusive")
        return dict(base, status=status)
    except (cv2.error, ValueError, TypeError, OverflowError,
            FloatingPointError, ZeroDivisionError):
        return dict(base, status="inconclusive")


def assess_ensemble_shadow(image, primary=None):
    """Show only coarse experimental agreement, NEVER independent PAD."""
    base = {"independentPadValidated": False, "identityDecisionUse": "none",
            "automaticApprovalAllowed": False,
            "modelsIndependent": False}
    first = primary if primary is not None else v2.assess_frame_shadow(image)
    second = assess_secondary_shadow(image)
    valid = {"model_prefers_live_unvalidated", "model_prefers_attack_unvalidated"}
    a = first.get("status") if isinstance(first, dict) else None
    b = second.get("status") if isinstance(second, dict) else None
    if a == b and a in valid:
        status = ("agreement_live_unvalidated" if a == "model_prefers_live_unvalidated"
                  else "agreement_attack_unvalidated")
    else:
        status = "inconclusive"
    return dict(base, status=status)
