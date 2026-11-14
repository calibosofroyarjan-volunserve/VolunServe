"""Small, deterministic 1:1 face-input integrity guard.

This catches **exact decoded-image reuse** (including separately encoded
identical pixel arrays). A re-uploaded ID photo is not an independent selfie.
It does NOT establish selfie freshness, presentation attack resistance,
face authenticity or that two different images came from one person.

Keep this independent of provider-dependent face inference and networking.
No hashes, pixels, filenames or biometric templates are persisted/logged.
"""
import numpy as np


def exact_image_reuse(id_bgr, selfie_bgr):
    """True only when both decoded 8-bit BGR images are *pixel-identical*.

    This deliberately makes no fuzzy or perceptual similarity decision.
    Different crops, compression artifacts or printed replays need separately
    validated anti-spoofing; a high SFace or landmark score cannot prove them.
    """
    if not isinstance(id_bgr, np.ndarray) or not isinstance(selfie_bgr, np.ndarray):
        return False
    if (id_bgr.ndim != 3 or selfie_bgr.ndim != 3 or
            id_bgr.shape[2] != 3 or selfie_bgr.shape[2] != 3 or
            id_bgr.dtype != np.uint8 or selfie_bgr.dtype != np.uint8 or
            id_bgr.shape != selfie_bgr.shape):
        return False
    if id_bgr.size == 0:
        return False
    return bool(np.array_equal(id_bgr, selfie_bgr))
