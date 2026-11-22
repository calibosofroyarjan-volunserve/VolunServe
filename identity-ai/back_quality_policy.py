"""Conservative National ID reverse-image quality decision.

This checks only whether the captured back photo is readable enough to
review; it does not validate a QR code or government document authenticity.
"""
import math


def back_quality_warning(score, minimum_score):
    try:
        value = float(score)
        threshold = float(minimum_score)
    except (ValueError, TypeError):
        return "id_back_image_quality_inconclusive"
    if not math.isfinite(value) or not math.isfinite(threshold):
        return "id_back_image_quality_inconclusive"
    if value < threshold:
        return "low_id_back_image_quality"
    return None
