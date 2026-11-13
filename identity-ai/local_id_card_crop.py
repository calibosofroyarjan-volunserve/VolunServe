"""Conservative ID-card-shaped crop candidate for the OFFLINE camera OCR lab.

This detects geometry only. A rectangle is NOT evidence that a document is
issued by the government, genuine, owned by the person, or the correct side.
No PII, faces, embeddings, photos or candidate bounds are persisted.
"""
from __future__ import annotations


def crop_candidate_card(image):
    """Return a candidate card crop or None (uncertain -> original OCR frame).

    Only accepts large, convex, centered, roughly PhilID-aspect quadrilaterals.
    The scanner still applies existing OCR type/side/quality checks and never
    approves an identity based on this crop.
    """
    import cv2
    import numpy as np

    if (not isinstance(image, np.ndarray) or image.ndim != 3
            or image.shape[2] != 3 or image.dtype != np.uint8):
        return None
    h, w = image.shape[:2]
    if not (320 <= w <= 3000 and 240 <= h <= 3000):
        return None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 115)
    edges = cv2.morphologyEx(
        edges, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(
        edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    best_crop = None
    best_score = -1.0
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        if perimeter < 240:
            continue
        quad = cv2.approxPolyDP(contour, 0.035 * perimeter, True)
        if len(quad) != 4 or not cv2.isContourConvex(quad):
            continue
        x, y, cw, ch = cv2.boundingRect(quad)
        if (cw < 180 or ch < 100 or x < 2 or y < 2
                or x + cw >= w - 2 or y + ch >= h - 2):
            continue
        quad_area = cv2.contourArea(quad)
        fraction = quad_area / float(w * h)
        if not 0.10 <= fraction <= 0.74:
            continue
        if not 1.25 <= cw / float(ch) <= 2.15:
            continue
        if quad_area / float(cw * ch) < 0.68:
            continue
        cx = (x + cw / 2.0) / w
        cy = (y + ch / 2.0) / h
        if abs(cx - 0.5) > 0.30 or abs(cy - 0.5) > 0.32:
            continue
        score = fraction - 0.09 * (abs(cx - 0.5) + abs(cy - 0.5))
        if score > best_score:
            best_score = score
            pad_x, pad_y = max(3, int(cw * 0.025)), max(3, int(ch * 0.025))
            x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
            x1, y1 = min(w, x + cw + pad_x), min(h, y + ch + pad_y)
            best_crop = image[y0:y1, x0:x1].copy()
    return best_crop
