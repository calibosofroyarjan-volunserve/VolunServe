"""Simple, private, *two-photo* OpenCV SFace diagnostic for local Windows/Linux.

NO webcam, Firebase login, Admin grant, biometric upload, or model downloads.
Requires two existing, consented LOCAL image files, placed under image root.

Example (run from repository root):
  python identity-ai/check_sface_two_photos_local.py \
    --image-root "C:/PrivateFaceQA" --id-image id-photo.jpg \
    --selfie-image selfie.jpg --consent-confirmed

Does NOT decide whether faces belong to the same person. There is no
validated threshold, presentation-attack detection, government ID authenticity
check, or automatic Verified Resident decision. Output never includes paths,
filenames, image bytes, face coordinates or face embeddings.
"""
import argparse
import math
from pathlib import Path

from evaluate_sface_pairs_local import _private_decode, _within_root


SAFE_STAGES = frozenset({
    "input_invalid", "duplicate_capture", "id_face_not_detected",
    "selfie_face_not_detected", "id_alignment_invalid",
    "selfie_alignment_invalid", "id_embedding_invalid",
    "selfie_embedding_invalid", "similarity_invalid",
    "research_score_only",
})
SAFE_STATUSES = frozenset({
    "disabled", "unavailable", "inconclusive",
    "similarity_observed_unvalidated",
})


def sanitize_observation(observation):
    """Ignore malformed/native model values and any untrusted private fields."""
    if not isinstance(observation, dict):
        return {"status": "inconclusive", "stage": "unknown", "score": None}
    status = observation.get("status")
    if not isinstance(status, str) or status not in SAFE_STATUSES:
        status = "inconclusive"
    stage = observation.get("qaStage")
    if not isinstance(stage, str) or stage not in SAFE_STAGES:
        stage = "unknown"
    score = observation.get("cosineSimilarity")
    if (status != "similarity_observed_unvalidated" or
            isinstance(score, bool) or not isinstance(score, (int, float)) or
            not math.isfinite(float(score)) or not -1.0 <= float(score) <= 1.0):
        score = None
        if status == "similarity_observed_unvalidated":
            status = "inconclusive"
    else:
        score = round(float(score), 5)
    return {"status": status, "stage": stage, "score": score}


def inspect_two_photos(args):
    if not args.consent_confirmed:
        raise ValueError("informed_consent_required")
    import cv2
    import numpy as np
    from PIL import Image
    import os
    import sface_shadow
    import yunet_shadow
    from face_pair_integrity import exact_image_reuse
    from image_upload_bounds import image_dimensions_allowed

    root = Path(args.image_root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("private_image_directory_unavailable")
    id_path = _within_root(root, args.id_image)
    selfie_path = _within_root(root, args.selfie_image)
    if id_path is None or selfie_path is None:
        raise ValueError("private_photo_missing_or_invalid")
    # Never download missing models or fall back to random/research scores.
    os.environ["VOLUNSERVE_SFACE_SHADOW"] = "1"
    if (not sface_shadow.readiness().get("modelLoaded") or
            not yunet_shadow.readiness().get("modelLoaded")):
        return {"status": "unavailable", "stage": "models_not_installed", "score": None}
    id_image = _private_decode(id_path, cv2, np, Image, image_dimensions_allowed)
    selfie_image = _private_decode(selfie_path, cv2, np, Image, image_dimensions_allowed)
    if id_image is None or selfie_image is None:
        return {"status": "inconclusive", "stage": "image_unreadable", "score": None}
    if exact_image_reuse(id_image, selfie_image):
        return {"status": "inconclusive", "stage": "duplicate_capture", "score": None}
    # All face/embedding media stay in local process memory. Return only a
    # bounded research score and QA stage; no face match/approval decision.
    return sanitize_observation(sface_shadow.assess_pair_shadow(id_image, selfie_image))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image-root", required=True)
    parser.add_argument("--id-image", required=True,
                        help="ID portrait image filename relative to image root")
    parser.add_argument("--selfie-image", required=True,
                        help="Distinct selfie image filename relative to image root")
    parser.add_argument("--consent-confirmed", action="store_true")
    args = parser.parse_args()
    try:
        result = inspect_two_photos(args)
    except Exception:
        # Absolute filenames and model/OpenCV errors can expose private
        # information; never echo them or dump exception tracebacks.
        print("LOCAL_SFACE_BLOCKED: confirm local consent, picture files, prerequisites and model checks.")
        raise SystemExit(2) from None
    print("VOLUNSERVE_SFACE_LOCAL_RESEARCH_ONLY")
    print("stage=" + result["stage"])
    print("modelStatus=" + result["status"])
    if result["score"] is not None:
        print(f"uncalibratedCosineSimilarity={result['score']:.5f}")
    print("identityVerified=false; livenessValidated=false; idIssuerVerified=false")
    print("No image upload, no automatic same-person decision.")


if __name__ == "__main__":
    main()
