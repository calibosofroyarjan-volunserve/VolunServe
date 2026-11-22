"""LOCAL-ONLY SFace research endpoint for a consented ID-front photo and selfie.

No cloud processing, persistence, templates, QR authenticity, liveness, login,
cross-person search, pass/fail match decision, or Resident status changes.
The selected image pair stays in this Python process and is released after
producing ONLY a sanitized diagnostic and uncalibrated SFace cosine score.
"""
from __future__ import annotations

import hashlib
import io
import os

from staging_national_id_loopback import safe_photo_payload


def _decode_local_photo(payload: bytes):
    """EXIF-aware decode with pixel bounds before allocation."""
    import cv2
    import numpy as np
    from PIL import Image, ImageOps
    from image_upload_bounds import image_dimensions_allowed

    with Image.open(io.BytesIO(payload)) as src:
        if not image_dimensions_allowed(src.width, src.height):
            raise ValueError("invalid_photo_dimensions")
        oriented = ImageOps.exif_transpose(src).convert("RGB")
        if oriented.width < 120 or oriented.height < 120:
            raise ValueError("photo_too_small")
        max_edge = max(oriented.size)
        if max_edge > 2800:
            scale = 2800.0 / max_edge
            oriented = oriented.resize(
                (max(120, int(oriented.width * scale)),
                 max(120, int(oriented.height * scale))),
                Image.Resampling.LANCZOS,
            )
        rgb = np.asarray(oriented, dtype=np.uint8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _id_portrait_candidates(id_bgr):
    """Only heuristic local crops of the printed left-side ID portrait.

    This cannot prove that an image is a real card or that the crop actually
    belongs to its holder. All crops remain in process memory.
    """
    import cv2

    height, width = id_bgr.shape[:2]
    yield id_bgr
    # A physical National ID front usually shows the portrait on its left.
    # When YuNet fails on the whole card, increase the portrait's apparent
    # size. Otherwise return inconclusive; never invent a model score.
    if width > 450 and height > 320:
        x0, x1 = round(width * 0.04), round(width * 0.48)
        y0, y1 = round(height * 0.28), round(height * 0.87)
        portrait = id_bgr[y0:y1, x0:x1]
        if portrait.shape[0] >= 120 and portrait.shape[1] >= 120:
            edge = max(portrait.shape[:2])
            if edge < 950:
                factor = min(2.5, 950.0 / edge)
                portrait = cv2.resize(
                    portrait, None, fx=factor, fy=factor,
                    interpolation=cv2.INTER_CUBIC,
                )
            yield portrait


def _fixed_outcome(status: str, stage: str, score=None) -> dict[str, object]:
    return {
        "status": status,
        "stage": stage,
        "score": score,
        "identityVerified": False,
        "samePersonVerified": False,
        "livenessValidated": False,
        "idIssuerVerified": False,
        "manualReviewRequired": True,
        "stored": False,
    }


def process_pair(data: object, evaluator=None) -> dict[str, object]:
    """The only accepted POST fields are idFront and capturedSelfie.

    Injected evaluator allows synthetic QA without loading biometric models.
    Images, OCR, embeddings, faces and paths never appear in the result.
    """
    if not isinstance(data, dict) or set(data) != {"idFront", "capturedSelfie"}:
        raise ValueError("only_id_front_and_selfie_allowed")
    id_bytes = safe_photo_payload(data["idFront"])
    selfie_bytes = safe_photo_payload(data["capturedSelfie"])
    if hashlib.sha256(id_bytes).digest() == hashlib.sha256(selfie_bytes).digest():
        return _fixed_outcome("inconclusive", "duplicate_capture")

    if evaluator is not None:
        # Tested fake scorer accepts only the two byte strings, never a path.
        raw = evaluator(id_bytes, selfie_bytes)
        return _sanitize_observation(raw)

    # Never download models or send biometric data to remote services.
    os.environ["VOLUNSERVE_SFACE_SHADOW"] = "1"
    import sface_shadow
    import yunet_shadow
    from face_pair_integrity import exact_image_reuse

    if (not sface_shadow.readiness().get("modelLoaded") or
            not yunet_shadow.readiness().get("modelLoaded")):
        return _fixed_outcome("unavailable", "models_not_installed")

    id_image = _decode_local_photo(id_bytes)
    selfie_image = _decode_local_photo(selfie_bytes)
    if exact_image_reuse(id_image, selfie_image):
        return _fixed_outcome("inconclusive", "duplicate_capture")

    diagnostic = None
    for candidate in _id_portrait_candidates(id_image):
        observation = sface_shadow.assess_pair_shadow(candidate, selfie_image)
        normalized = _sanitize_observation(observation)
        if normalized["status"] == "similarity_observed_unvalidated":
            return normalized
        diagnostic = normalized
        # A retry crop is useful only if the whole-card portrait cannot be
        # located, NOT when matching or alignment already produced errors.
        if normalized["stage"] != "id_face_not_detected":
            break
    return diagnostic or _fixed_outcome("inconclusive", "id_face_not_detected")


def _sanitize_observation(raw: object) -> dict[str, object]:
    """Bound score and stage; discard all unexpected/private model fields."""
    from check_sface_two_photos_local import sanitize_observation
    import math

    result = sanitize_observation(raw)
    status = result["status"]
    stage = result["stage"]
    score = result["score"]
    if status == "similarity_observed_unvalidated":
        if not isinstance(score, (float, int)) or not math.isfinite(float(score)):
            status, stage, score = "inconclusive", "similarity_invalid", None
    else:
        score = None
    return _fixed_outcome(status, stage, score)
