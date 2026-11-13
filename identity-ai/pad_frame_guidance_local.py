"""Private, local-only face framing guidance for the webcam QA preview.

This module does NOT change production face extraction or MiniFASNet input,
authenticate a person, save/copy media, or send any camera pixels to a service.
Bounding boxes are used ONLY inside the local live preview process.
"""
from dataclasses import dataclass

import cv2
import numpy as np

from yunet_shadow import single_face_box, inspect_frame


PAD_CONTEXT_SCALE = 2.7
V1SE_CONTEXT_SCALE = 4.0
_ALLOWED_CONTEXT_SCALES = frozenset((PAD_CONTEXT_SCALE, V1SE_CONTEXT_SCALE))

# Coarse statuses can be shown on screen without making any liveness claims.
HELP = {
    "ready": "Framing OK for experimental crop. Not proof of liveness.",
    "move_back": "Move farther from camera; keep space around your head.",
    "move_back_v1se": "V1SE needs a FULL 4.0x face crop; move farther from the camera. A 2.7x-ready frame is not enough for the combined pilot.",
    "no_face": "No face detected. Center one consenting face in good light.",
    "multiple_faces": "Multiple faces detected; show one face at a time.",
    "detector_unavailable": "YuNet unavailable. Check pinned local model.",
    "face_uncertain": "Face detector uncertain. Reposition and improve lighting.",
    "camera_unavailable": "Camera frame invalid. Check webcam and permissions.",
}


@dataclass(frozen=True)
class Guidance:
    code: str
    # Coordinates are in-process UI data only. Never include in results/JSON.
    face_rect: tuple | None = None
    context_rect: tuple | None = None

    @property
    def capture_ready(self):
        return self.code == "ready"


def context_rect_for_face(box, image_shape, *, scale=PAD_CONTEXT_SCALE):
    """Compute complete 2.7x (V2) or 4.0x (V1SE) face context.

    Unlike the upstream crop's edge shifting/padding, the staging shadow
    deliberately requires complete context within the camera frame.
    """
    if scale not in _ALLOWED_CONTEXT_SCALES:
        return None
    try:
        height, width = int(image_shape[0]), int(image_shape[1])
        x, y, w, h = (int(v) for v in box)
    except (TypeError, IndexError, ValueError, OverflowError):
        return None
    if not (120 <= height <= 3000 and 120 <= width <= 3000 and
            w >= 40 and h >= 40 and x >= 0 and y >= 0 and
            x + w <= width and y + h <= height):
        return None
    enlarged_w, enlarged_h = w * scale, h * scale
    left = int(round(x + w / 2 - enlarged_w / 2))
    top = int(round(y + h / 2 - enlarged_h / 2))
    right = int(round(x + w / 2 + enlarged_w / 2))
    bottom = int(round(y + h / 2 + enlarged_h / 2))
    if (left < 0 or top < 0 or right > width or bottom > height or
            left >= right or top >= bottom):
        return None
    return (left, top, right, bottom)


def analyze_framing(frame, *, detect_box=single_face_box, inspect=inspect_frame,
                    context_scale=PAD_CONTEXT_SCALE):
    """Diagnose camera framing; no identity or anti-spoofing decision."""
    if (context_scale not in _ALLOWED_CONTEXT_SCALES or
            not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or
            frame.ndim != 3 or frame.shape[2] != 3 or
            not 120 <= frame.shape[0] <= 3000 or
            not 120 <= frame.shape[1] <= 3000):
        return Guidance("camera_unavailable")
    try:
        box = detect_box(frame)
        if box is not None:
            rect = context_rect_for_face(box, frame.shape, scale=context_scale)
            if (rect is None and context_scale == V1SE_CONTEXT_SCALE and
                    context_rect_for_face(box, frame.shape,
                                          scale=PAD_CONTEXT_SCALE) is not None):
                # Former combined-pilot bug: legacy 2.7x guidance marked READY
                # although V1SE requires full 4x and silently abstained.
                code = "move_back_v1se"
            else:
                code = "ready" if rect is not None else "move_back"
            return Guidance(code,
                            face_rect=tuple(int(v) for v in box),
                            context_rect=rect)
        result = inspect(frame)
        return Guidance({
            "no_face": "no_face",
            "multiple_faces": "multiple_faces",
            "unavailable": "detector_unavailable",
            "one_face_unvalidated": "move_back",
        }.get(result, "face_uncertain"))
    except (cv2.error, ValueError, TypeError, OverflowError, IndexError):
        return Guidance("face_uncertain")


def draw_guidance(frame, status, *, max_width=700, max_height=470):
    """Draw an ephemeral, on-screen preview with framing annotations.

    No coordinates or images are logged, persisted, returned to the API,
    uploaded, or written to disk.
    """
    if not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or frame.ndim != 3:
        raise ValueError("INVALID_PREVIEW_FRAME")
    view = frame.copy()
    height, width = view.shape[:2]
    if status.face_rect is not None:
        x, y, w, h = status.face_rect
        color = (75, 200, 80) if status.capture_ready else (0, 170, 255)
        cv2.rectangle(view, (x, y), (x + w, y + h), color, 2)
    if status.context_rect is not None:
        left, top, right, bottom = status.context_rect
        cv2.rectangle(view, (left, top), (right, bottom), (75, 200, 80), 2)
    label = {
        "ready": "FRAMING READY - SHADOW RESEARCH ONLY",
        "move_back": "MOVE BACK: leave space around face",
        "move_back_v1se": "MOVE BACK: V1SE needs FULL 4x face context",
        "no_face": "NO FACE: center the presentation",
        "multiple_faces": "MULTIPLE FACES: only one",
        "camera_unavailable": "CAMERA FRAME INVALID",
    }.get(status.code, "FRAME NOT READY")
    # Status is a fixed literal and contains no subject or pixel metadata.
    cv2.rectangle(view, (0, 0), (width, min(44, height)), (24, 39, 48), -1)
    cv2.putText(view, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.53,
                (255, 255, 255), 2, cv2.LINE_AA)
    factor = min(max_width / width, max_height / height, 1.0)
    if factor < 1.0:
        view = cv2.resize(view, (max(1, int(width * factor)),
                                 max(1, int(height * factor))),
                          interpolation=cv2.INTER_AREA)
    return view
