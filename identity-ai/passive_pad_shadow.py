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
from yunet_shadow import readiness as yunet_readiness, single_face_box

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
            "modelClassMappingValidated": False,
            "modelInputScaleValidated": False,
            "thresholdCalibrated": False,
            "identityDecisionUse": "none",
            "model": "minifasnet-v2-onnx-shadow",
            "faceDetectorShadow": yunet_readiness(),
            "note": "Original PyTorch/ONNX numerical parity passed synthetic checks. Real-device class semantics, input-scale performance and threshold remain unvalidated. Experimental two-scale agreement can NEVER establish liveness."}


def _face_crop(image):
    """Return a 2.7x context crop for exactly one clearly detected face."""
    if (not isinstance(image, np.ndarray) or image.dtype != np.uint8 or
            image.ndim != 3 or image.shape[2] != 3):
        return None
    height, width = image.shape[:2]
    if height < 120 or width < 120 or height > 3000 or width > 3000:
        return None
    # YuNet (hash-pinned in the same Docker image) is the face detector.
    # Missing / ambiguous / out-of-frame detection fails closed as inconclusive.
    # Detection is not a PAD/liveness result, and no image is persisted.
    box = single_face_box(image)
    if box is None:
        return None
    x, y, w, h = box
    # Original MiniVisionAI CropImage._get_new_box independently enlarges
    # width and height by 2.7x, THEN resizes the rectangular patch to 80x80.
    # The previous max(w,h) square was a source-preprocessing mismatch and
    # could capture excess background or reject valid framed faces.
    enlarged_width = w * 2.7
    enlarged_height = h * 2.7
    left = int(round(x + w / 2 - enlarged_width / 2))
    top = int(round(y + h / 2 - enlarged_height / 2))
    right = int(round(x + w / 2 + enlarged_width / 2))
    bottom = int(round(y + h / 2 + enlarged_height / 2))
    # Never invent padded context outside the photographed frame.
    if (left < 0 or top < 0 or right > width or bottom > height or
            right <= left or bottom <= top):
        return None
    roi = image[top:bottom, left:right]
    if roi.size == 0:
        return None
    return cv2.resize(roi, (80, 80), interpolation=cv2.INTER_LINEAR)


def _experimental_label(logits):
    """Interpret one model hypothesis only; no identity approval or PAD claim."""
    values = np.asarray(logits, dtype=np.float64).reshape(-1)
    if values.shape != (3,) or not np.isfinite(values).all():
        return "inconclusive"
    shifted = values - float(np.max(values))
    exp = np.exp(shifted)
    total = float(exp.sum())
    if not math.isfinite(total) or total <= 0:
        return "inconclusive"
    probs = exp / total
    maximum = float(probs.max())
    if not math.isfinite(maximum) or maximum < SHADOW_THRESHOLD:
        return "inconclusive"
    # Original MiniVisionAI convention: 1 means genuine in the unvalidated
    # source example; 0/2 are attack labels. This is not a calibrated gate.
    return ("model_prefers_live_unvalidated" if int(np.argmax(probs)) == 1
            else "model_prefers_attack_unvalidated")


def _two_scale_shadow(crop, net):
    """Compare raw upstream 0..255 and converted-card 0..1 on ONE face crop.

    Differences force abstention. Agreement does not validate either
    preprocessing interpretation or the model's ability to reject prints.
    Never return logits, images or embeddings to a user or persistence layer.
    """
    if (not isinstance(crop, np.ndarray) or crop.dtype != np.uint8 or
            crop.shape != (80, 80, 3)):
        return "inconclusive", False
    labels = []
    # Hash-pinned original PyTorch -> ONNX parity has been verified with
    # synthetic inputs. Upstream ToTensor reads raw BGR; the converted model
    # card says 0..1. Both remain uncalibrated in real-camera conditions.
    with _LOCK:
        for factor in (1.0, 1.0 / 255.0):
            blob = cv2.dnn.blobFromImage(
                crop, scalefactor=factor, size=(80, 80),
                mean=(0, 0, 0), swapRB=False, crop=False)
            net.setInput(blob)
            labels.append(_experimental_label(net.forward()))
    if labels[0] != labels[1] or labels[0] == "inconclusive":
        return "inconclusive", False
    return labels[0], True


def assess_frame_shadow(image):
    """Conservative TWO-scale research observation, never genuine liveness.

    Any preprocessing disagreement, invalid tensor or uncertain logits is
    inconclusive. A dual-agreement "live" observation is still unvalidated
    and must not be used to authorize uploads, verification or Admin approval.
    """
    if not shadow_enabled():
        return {"status": "disabled", "independentPadValidated": False}
    net = _load_net()
    if net is None:
        return {"status": "unavailable", "independentPadValidated": False}
    try:
        crop = _face_crop(image)
        if crop is None:
            return {"status": "inconclusive", "independentPadValidated": False,
                    "scaleHypothesesAgree": False}
        status, agree = _two_scale_shadow(crop, net)
        return {"status": status, "independentPadValidated": False,
                "scaleHypothesesAgree": agree,
                "identityDecisionUse": "none"}
    except (cv2.error, ValueError, TypeError, OverflowError,
            FloatingPointError, ZeroDivisionError):
        return {"status": "inconclusive", "independentPadValidated": False,
                "scaleHypothesesAgree": False,
                "identityDecisionUse": "none"}
