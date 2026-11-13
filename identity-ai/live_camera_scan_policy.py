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



def camera_id_roi_bounds(image_shape):
    """Central wide OCR region with margins around the *whole* ID card.

    Earlier UI scanned only 76% of camera width, cropping the portrait-side
    title and trailing labels on many small laptop-camera frames. Keep a
    narrow edge margin for framing but never return an out-of-bounds crop.
    This changes only which camera pixels are scanned, NOT document policy.
    """
    try:
        height, width = int(image_shape[0]), int(image_shape[1])
        if not (120 <= height <= 3000 and 120 <= width <= 3000):
            return (0, 0, 0, 0)
    except (TypeError, ValueError, IndexError, OverflowError):
        return (0, 0, 0, 0)
    x_margin = max(1, int(width * 0.04))
    y_margin = max(1, int(height * 0.05))
    return (x_margin, y_margin, width - x_margin, height - y_margin)


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
        # Explain the missing OCR clue without displaying names, raw OCR
        # text or government-ID numbers. These cues DO NOT accept the card.
        if front_heading and not front_fields:
            guidance = (
                "Heading found; surname/given-name labels still unreadable. "
                "Move the card slightly back, refocus and reduce glare."
            )
        elif front_fields and not front_heading:
            guidance = (
                "Name labels found; National ID heading is unreadable. "
                "Fit all four card corners inside the guide."
            )
        else:
            guidance = (
                "Cannot read National ID FRONT yet. Fit all four corners "
                "inside the guide, straighten the card, improve focus/light."
            )
        return {"ready": False, "state": "retry", "guidance": guidance}

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



def advance_selfie_stability(previous_box, previous_count, current_box,
                             image_shape, *, ready):
    """Count consecutive well-framed, spatially consistent selfie frames.

    A stable face box only authorizes an ephemeral camera snapshot. It cannot
    establish that the same person remains present, identity match or liveness.
    No frames, face embeddings, or personal attributes are retained here.
    Returns (count, latest_box, spatially_consistent).
    """
    if ready is not True or current_box is None:
        return 0, None, False
    try:
        height, width = (int(image_shape[0]), int(image_shape[1]))
        box = tuple(float(v) for v in current_box)
        if (len(box) != 4 or not 120 <= height <= 3000 or
                not 120 <= width <= 3000 or
                not all(math.isfinite(v) for v in box)):
            return 0, None, False
        x, y, w, h = box
        if (w < 90 or h < 90 or x < 0 or y < 0 or
                x + w > width or y + h > height):
            return 0, None, False
        if not isinstance(previous_count, int) or isinstance(previous_count, bool):
            previous_count = 0
        if previous_count <= 0 or previous_box is None:
            return 1, box, True
        px, py, pw, ph = (float(v) for v in previous_box)
        if not all(math.isfinite(v) for v in (px, py, pw, ph)) or pw <= 0 or ph <= 0:
            return 1, box, False
        # Keep tolerance permissive for ordinary webcam movement, but reset
        # after abrupt spatial jumps or large face-scale changes.
        dx = abs((x + w / 2) - (px + pw / 2)) / width
        dy = abs((y + h / 2) - (py + ph / 2)) / height
        scale_w = max(w / pw, pw / w)
        scale_h = max(h / ph, ph / h)
        steady = (dx <= 0.12 and dy <= 0.12 and
                  scale_w <= 1.4 and scale_h <= 1.4)
        return (min(previous_count + 1, 10) if steady else 1), box, steady
    except (TypeError, ValueError, IndexError, OverflowError, ZeroDivisionError):
        return 0, None, False


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
