"""On-screen ONLY laptop webcam sharpness / lighting diagnostics.

No media storage, device identifiers, image enhancement, identity decisions,
face scores, cloud calls or PAD threshold changes. These are rough, uncalibrated
camera troubleshooting hints; a printed portrait can appear very sharp.
"""
import cv2
import numpy as np

PREFERRED_WIDTH = 1280
PREFERRED_HEIGHT = 720


def request_supported_resolution(camera):
    """Best-effort: ask Windows camera for 720p, never claim driver accepted.

    Called only AFTER consent and a successful VideoCapture.isOpened(). Some
    webcams ignore the request. The real size is read from captured frames.
    """
    try:
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, PREFERRED_WIDTH)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, PREFERRED_HEIGHT)
    except (AttributeError, TypeError, ValueError, cv2.error):
        pass


def quality_hint(frame, face_rect=None):
    """Return a non-identifying UI string. Does NOT accept/reject PAD trials."""
    if (not isinstance(frame, np.ndarray) or frame.dtype != np.uint8
            or frame.ndim != 3 or frame.shape[2] != 3
            or not (120 <= frame.shape[0] <= 3000 and
                    120 <= frame.shape[1] <= 3000)):
        return "Camera frame unavailable. Check Windows camera permissions."
    height, width = frame.shape[:2]
    label = f"Actual camera frame: {width}x{height}"
    if width < 1280 or height < 720:
        label += " (webcam/driver below 720p)"
    try:
        crop = None
        if face_rect is not None:
            x, y, w, h = (int(v) for v in face_rect)
            if (w >= 40 and h >= 40 and x >= 0 and y >= 0
                    and x+w <= width and y+h <= height):
                crop = frame[y:y+h, x:x+w]
        if crop is None:
            # Center-area hint when detector cannot locate a face; never
            # interpret this as biometric or live-face image quality.
            crop = frame[height//4:3*height//4,
                         width//4:3*width//4]
        if crop.size == 0:
            return label + " | Check camera framing."
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        detail = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if not np.isfinite(brightness) or not np.isfinite(detail):
            return label + " | Image quality unavailable."
        if brightness < 62:
            label += " | Dark image: add a light facing you."
        elif brightness > 215:
            label += " | Very bright: reduce glare/backlight."
        if detail < 35:
            label += " | Soft image: clean lens, improve light, hold still."
        else:
            label += " | Image detail visible (NOT proof of liveness)."
        return label
    except (TypeError, ValueError, OverflowError, cv2.error):
        return label + " | Camera quality hint unavailable."
