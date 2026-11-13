"""SFace 1-to-1 matching in SHADOW-ONLY staging mode.

Official OpenCV Zoo SFace weights: Apache-2.0 (OpenCV / contributors).
No identity approval, no PAD/liveness claim, no embeddings or media storage,
no cross-person database lookup and no calibrated face-match threshold.
Only pass consented, in-memory BGR images captured in a controlled staging QA.
"""
import hashlib
import math
import os
import threading
from pathlib import Path

import cv2
import numpy as np
import yunet_shadow

MODEL_PATH = (
    Path(__file__).resolve().parent / "models" /
    "face_recognition_sface_2021dec.onnx"
)
MODEL_SHA256 = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
MIN_BYTES = 30 * 1024 * 1024
MAX_BYTES = 45 * 1024 * 1024
_LOCK = threading.RLock()
_MATCHER = None
_FAILED = False


def shadow_enabled():
    return os.getenv("VOLUNSERVE_SFACE_SHADOW", "0") == "1"


def _load_matcher():
    global _MATCHER, _FAILED
    if not shadow_enabled() or _FAILED:
        return None
    if _MATCHER is not None:
        return _MATCHER
    with _LOCK:
        if _MATCHER is not None:
            return _MATCHER
        try:
            if not MODEL_PATH.is_file():
                _FAILED = True
                return None
            size = MODEL_PATH.stat().st_size
            if not MIN_BYTES <= size <= MAX_BYTES:
                _FAILED = True
                return None
            if hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() != MODEL_SHA256:
                _FAILED = True
                return None
            matcher = cv2.FaceRecognizerSF.create(str(MODEL_PATH), "")
            if matcher is None:
                _FAILED = True
                return None
            _MATCHER = matcher
            return matcher
        except (cv2.error, OSError, ValueError, AttributeError, TypeError):
            _FAILED = True
            return None


def readiness():
    return {
        "model": "opencv-sface-2021dec-shadow",
        "shadowEnabled": shadow_enabled(),
        "modelLoaded": _load_matcher() is not None,
        "independentFaceMatchValidated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "note": "A model loading is not measured matching accuracy.",
    }


def _single_face_row(image):
    """Only accept exactly one valid YuNet-detected face with five landmarks."""
    detector = yunet_shadow._load_detector()
    if detector is None or not isinstance(image, np.ndarray):
        return None
    if image.dtype != np.uint8 or image.ndim != 3 or image.shape[2] != 3:
        return None
    height, width = image.shape[:2]
    if not 120 <= height <= 3000 or not 120 <= width <= 3000:
        return None
    try:
        with yunet_shadow._LOCK:
            detector.setInputSize((width, height))
            ok, faces = detector.detect(image)
        # A detector failure cannot be treated as a successful single-face
        # observation even if a native wrapper returned stale face rows.
        if not ok or faces is None or len(faces) != 1:
            return None
        row = np.asarray(faces[0], dtype=np.float32).reshape(-1)
        if row.size != 15 or not np.isfinite(row).all():
            return None
        x, y, w, h = [float(v) for v in row[:4]]
        if w < 40 or h < 40 or x < 0 or y < 0:
            return None
        if x + w > width or y + h > height:
            return None
        landmarks = row[4:14].reshape(5, 2)
        if np.any(landmarks < 0) or np.any(landmarks[:, 0] >= width):
            return None
        if np.any(landmarks[:, 1] >= height) or not 0.0 <= float(row[14]) <= 1.0:
            return None
        return row
    except (cv2.error, ValueError, TypeError, OverflowError):
        return None


def _valid_aligned_face(image):
    """Check the SFace alignment output before requesting an embedding."""
    return (isinstance(image, np.ndarray) and image.dtype == np.uint8
            and image.ndim == 3 and image.shape[2] == 3
            and 32 <= image.shape[0] <= 1024
            and 32 <= image.shape[1] <= 1024)


def _valid_embedding(feature):
    """Check model output is a finite, nonzero single-row embedding.

    Shape/finite checks are deterministic API-integrity checks, NOT
    calibration, image-quality certification, identity, or liveness.
    """
    if not isinstance(feature, np.ndarray):
        return False
    if feature.ndim == 2 and feature.shape[0] == 1:
        values = feature[0]
    elif feature.ndim == 1:
        values = feature
    else:
        return False
    if (values.size < 2 or values.size > 4096 or
            not np.issubdtype(values.dtype, np.floating) or
            not np.isfinite(values).all()):
        return False
    magnitude = float(np.linalg.norm(values.astype(np.float64)))
    return math.isfinite(magnitude) and magnitude > 1e-8


def assess_pair_shadow(id_bgr, selfie_bgr):
    """Return a privacy-safe SHADOW QA stage, never verification.

    'qaStage' is a bounded internal processing outcome (not confidence,
    portrait authenticity, identity match, or live/spoof classification).
    No images, facial coordinates, OCR text or embeddings leave this module.
    """
    base = {"independentFaceMatchValidated": False,
            "independentPadValidated": False,
            "identityDecisionUse": "none"}
    if not shadow_enabled():
        return dict(base, status="disabled")
    matcher = _load_matcher()
    if matcher is None:
        return dict(base, status="unavailable")
    stage = "input_invalid"
    try:
        if not isinstance(id_bgr, np.ndarray) or not isinstance(selfie_bgr, np.ndarray):
            return dict(base, status="inconclusive", qaStage=stage)
        if id_bgr.shape == selfie_bgr.shape and np.array_equal(id_bgr, selfie_bgr):
            return dict(base, status="inconclusive", qaStage="duplicate_capture")

        stage = "id_face_not_detected"
        first = _single_face_row(id_bgr)
        if first is None:
            return dict(base, status="inconclusive", qaStage=stage)
        stage = "selfie_face_not_detected"
        second = _single_face_row(selfie_bgr)
        if second is None:
            return dict(base, status="inconclusive", qaStage=stage)

        with _LOCK:
            stage = "id_alignment_invalid"
            aligned_id = matcher.alignCrop(id_bgr, first)
            if not _valid_aligned_face(aligned_id):
                return dict(base, status="inconclusive", qaStage=stage)
            stage = "selfie_alignment_invalid"
            aligned_selfie = matcher.alignCrop(selfie_bgr, second)
            if not _valid_aligned_face(aligned_selfie):
                return dict(base, status="inconclusive", qaStage=stage)

            stage = "id_embedding_invalid"
            ref = matcher.feature(aligned_id)
            if not _valid_embedding(ref):
                return dict(base, status="inconclusive", qaStage=stage)
            stage = "selfie_embedding_invalid"
            probe = matcher.feature(aligned_selfie)
            if not _valid_embedding(probe):
                return dict(base, status="inconclusive", qaStage=stage)

            stage = "similarity_invalid"
            cosine = float(matcher.match(ref, probe, cv2.FaceRecognizerSF_FR_COSINE))
        if not math.isfinite(cosine) or not -1.0 <= cosine <= 1.0:
            return dict(base, status="inconclusive", qaStage=stage)
        return dict(base, status="similarity_observed_unvalidated",
                    qaStage="research_score_only",
                    cosineSimilarity=round(cosine, 5))
    except (cv2.error, ValueError, AttributeError, TypeError, OverflowError):
        # Keep native errors and biometric data out of the UI or logs.
        return dict(base, status="inconclusive", qaStage=stage)
