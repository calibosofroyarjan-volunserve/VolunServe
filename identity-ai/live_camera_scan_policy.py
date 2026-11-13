"""Sanitized camera-side heuristics for a PRIVATE local National ID lab.

The camera is guided by OCR/quality evidence, not a trained card detector.
No identity authenticity, holder, liveness, or verification decision is made.
Only statuses are returned; never persist/return raw OCR or ID information.
"""
from __future__ import annotations

import math

from strict_document_screening import (
    assess_document_text,
    _front_heading_signal,
    _front_demographic_layout_signal,
    _national_back_family_corrob,
)


def evaluate_camera_side(stage, ocr_text, blur_variance, brightness):
    """Conservative visible OCR-side/quality guidance for live camera frames.

    `ready` authorizes **local in-memory capture only**. Never identity approval.
    A rejected frame is not a rejected person; hold steady, flip or reframe.
    """
    if stage not in ("front", "back"):
        raise ValueError("Unknown ID scan side.")
    if not isinstance(ocr_text, str):
        return {"ready": False, "state": "retry", "guidance": "Hold the ID inside the guide."}
    metrics = (blur_variance, brightness)
    if any(isinstance(n, bool) or not isinstance(n, (float, int))
           or not math.isfinite(n) for n in metrics):
        return {"ready": False, "state": "retry", "guidance": "Camera image unreadable."}
    if blur_variance < 40.0 or brightness < 35.0 or brightness > 230.0:
        return {"ready": False, "state": "retry",
                "guidance": "Improve focus and lighting; fill the guide with the ID."}

    doc = assess_document_text("national_id", ocr_text)
    if doc["status"] == "unsupported":
        return {"ready": False, "state": "unsupported",
                "guidance": "School or employee ID is not a supported National ID."}
    if doc["status"] == "mismatch":
        return {"ready": False, "state": "wrong_document",
                "guidance": "This looks like another document, not a National ID."}
    if "multiple_document_type_signals" in doc["warningCodes"]:
        return {"ready": False, "state": "retry",
                "guidance": "Conflicting text found. Show only one ID."}

    front_heading = _front_heading_signal("national_id", ocr_text)
    front_fields = _front_demographic_layout_signal(ocr_text)
    back_fields = _national_back_family_corrob(ocr_text)

    if stage == "front":
        if back_fields and not front_fields:
            return {"ready": False, "state": "wrong_side",
                    "guidance": "This looks like the BACK. Flip to the FRONT."}
        if (doc["detectedIdType"] == "national_id"
                and front_heading and front_fields and not back_fields):
            return {"ready": True, "state": "front_candidate",
                    "guidance": "National ID FRONT text detected. Hold steady..."}
        return {"ready": False, "state": "retry",
                "guidance": "Show FRONT: card heading, surname and given names readable."}

    # The reverse of the physical PhilID can repeat a title, but the layout
    # must contain at least two independently recognized reverse field families.
    if front_heading and front_fields:
        return {"ready": False, "state": "wrong_side",
                "guidance": "This looks like the FRONT. Flip to the BACK."}
    if back_fields:
        return {"ready": True, "state": "back_candidate",
                "guidance": "National ID BACK text detected. Hold steady..."}
    return {"ready": False, "state": "retry",
            "guidance": "Show BACK: keep the reverse-side details readable."}


def evaluate_selfie_face(faces, image_shape, blur_variance, brightness):
    """Basic camera one-face framing; NOT liveness or face identity."""
    try:
        height, width = int(image_shape[0]), int(image_shape[1])
        count = len(faces)
        if count != 1:
            return {"ready": False, "guidance":
                    "Keep exactly ONE visible face in the camera."}
        x, y, w, h = (float(v) for v in faces[0])
        if not all(math.isfinite(v) for v in (x, y, w, h, blur_variance, brightness)):
            return {"ready": False, "guidance": "Face frame unreadable."}
        if not (120 <= height <= 3000 and 120 <= width <= 3000):
            return {"ready": False, "guidance": "Camera resolution unsupported."}
        if (w < 90 or h < 90 or x < 12 or y < 12
                or x + w > width - 12 or y + h > height - 12):
            return {"ready": False, "guidance": "Move face into view; look straight ahead."}
        if blur_variance < 40.0 or brightness < 35.0 or brightness > 230.0:
            return {"ready": False, "guidance": "Improve selfie lighting and sharpness."}
        return {"ready": True, "guidance":
                "One face visible. Hold steady for local capture..."}
    except (TypeError, ValueError, OverflowError, IndexError):
        return {"ready": False, "guidance": "Face framing inconclusive."}
