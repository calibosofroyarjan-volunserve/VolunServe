import asyncio
import hashlib
import logging
import math
import os
import secrets
import uuid
from datetime import datetime, timezone
from io import BytesIO
import cv2
import mediapipe as mp
import pytesseract
from strict_document_screening import (
    assess_document_sides, assess_profile_name, document_ocr_unavailable,
    add_photo_quality, add_back_photo_quality,
    blurry_national_id_claim_needs_review,
)
from profile_consistency import profile_comparison
from face_preflight_policy import screening_ready_for_face_comparison
from passport_mrz_shadow import assess_passport_mrz
from passive_pad_shadow import readiness as passive_pad_readiness, assess_frame_shadow
from pad_v1se_shadow import readiness as v1se_pad_readiness, assess_ensemble_shadow
from sface_shadow import readiness as sface_readiness, assess_pair_shadow as sface_assess_pair_shadow
import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request
from starlette.datastructures import UploadFile as StarletteUploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps
from image_upload_bounds import matching_image_signature, image_dimensions_allowed
app = FastAPI(
    title="VolunServe Identity AI",
    version="2.1.0",
    description=(
        "VolunServe custom AI-assisted 1-to-1 identity verification service. "
        "This service is called only by the VolunServe backend."
    ),
)
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:8084",
    "http://localhost:19006",
    "http://localhost:3000",
]
ACCEPTED_ID_TYPES = {
    "national_id",
    "drivers_license",
    "passport",
    "umid",
    "prc_id",
}
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_ID_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_SELFIE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_EDGE = 1800
# This matcher intentionally uses a strict default and sends uncertain cases
# to LGU/Admin manual review instead of automatically rejecting a Resident.
DEFAULT_MATCH_THRESHOLD = 0.78
DEFAULT_MIN_IMAGE_QUALITY = 0.34
# Stable-ish MediaPipe facial landmarks used for 1-to-1 facial geometry
# comparison. Expression-heavy interior lip points are intentionally limited.
MATCH_LANDMARKS = [
    10, 152, 127, 234, 454, 356,
    33, 133, 362, 263,
    70, 63, 105, 66, 107,
    336, 296, 334, 293, 300,
    1, 2, 98, 327, 168, 197,
    61, 291, 78, 308, 0, 17,
    172, 136, 150, 149, 176, 148,
    377, 400, 378, 379, 365, 397,
]
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263


def get_allowed_origins():
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "",
    ).strip()
    if not raw:
        return DEFAULT_ALLOWED_ORIGINS
    return [
        value.strip()
        for value in raw.split(",")
        if value.strip()
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "X-VolunServe-User-Id",
        "X-VolunServe-Internal-Key",
        "X-VolunServe-Profile-First-Name",
        "X-VolunServe-Profile-Last-Name",
        "X-VolunServe-Profile-Date-Of-Birth",
        "X-VolunServe-Profile-Barangay",
    ],
)


def clean_text(
    value,
    maximum_length=240,
):
    return " ".join(
        str(value or "")
        .replace("\x00", " ")
        .split()
    )[:maximum_length]


def face_mesh_engine_ready():
    """Match the health response to what /verify actually needs."""
    try:
        return bool(
            getattr(getattr(mp, "solutions", None), "face_mesh", None)
            and hasattr(mp.solutions.face_mesh, "FaceMesh")
        )
    except Exception:
        return False


def get_internal_key():
    return os.getenv(
        "IDENTITY_AI_INTERNAL_KEY",
        "",
    ).strip()


def env_float(
    name,
    default_value,
    minimum,
    maximum,
):
    raw = os.getenv(name, "").strip()
    if not raw:
        return default_value
    try:
        value = float(raw)
    except ValueError:
        return default_value
    return max(
        minimum,
        min(maximum, value),
    )


def get_match_threshold():
    return env_float(
        "IDENTITY_FACE_MATCH_THRESHOLD",
        DEFAULT_MATCH_THRESHOLD,
        0.50,
        0.98,
    )


def get_min_quality_threshold():
    return env_float(
        "IDENTITY_MIN_IMAGE_QUALITY",
        DEFAULT_MIN_IMAGE_QUALITY,
        0.10,
        0.90,
    )


def require_internal_backend(
    x_volunserve_internal_key: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Internal-Key",
    ),
):
    configured_key = get_internal_key()
    if not configured_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "IDENTITY_AI_INTERNAL_KEY is not configured "
                "on the AI service."
            ),
        )
    received_key = str(
        x_volunserve_internal_key
        or ""
    ).strip()
    if not received_key:
        raise HTTPException(
            status_code=401,
            detail=(
                "VolunServe backend authentication "
                "is required."
            ),
        )
    if not secrets.compare_digest(
        configured_key,
        received_key,
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid VolunServe backend "
                "authentication."
            ),
        )



# Called by the existing Node backend prior to uploading ID and face
# images. Verify that its actual internal key matches ours, not merely
# that both services have some secret configured.
@app.get("/api/internal/auth-check")
def internal_backend_auth_check(
    x_volunserve_internal_key: str | None = Header(
        default=None,
        alias="X-VolunServe-Internal-Key",
    ),
):
    require_internal_backend(x_volunserve_internal_key)
    return {"ok": True, "authenticated": True}


def validate_forwarded_user(
    value,
):
    uid = clean_text(
        value,
        200,
    )
    if not uid:
        raise HTTPException(
            status_code=400,
            detail=(
                "The VolunServe user ID "
                "was not forwarded."
            ),
        )
    return uid


def verification_id_for(
    uid,
):
    safe_uid = "".join(
        character
        for character in uid
        if character.isalnum()
    )[:28]
    return (
        f"identity_{safe_uid}_"
        f"{uuid.uuid4().hex[:18]}"
    )


async def read_upload(
    upload,
    *,
    label,
    maximum_bytes,
):
    if not isinstance(
        upload,
        StarletteUploadFile,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"{label} is required.",
        )
    content_type = clean_text(
        upload.content_type,
        80,
    ).lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"{label} must be a JPG, PNG, "
                "or WebP image."
            ),
        )
    # Never read an arbitrarily large ID/selfie into Python memory just to
    # reject it after the fact. One extra byte proves an oversized upload.
    data = await upload.read(maximum_bytes + 1)
    if not data:
        raise HTTPException(
            status_code=400,
            detail=f"{label} is empty.",
        )
    if len(data) > maximum_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"{label} exceeds the "
                f"{maximum_bytes // (1024 * 1024)} MB limit."
            ),
        )
    if not matching_image_signature(data, content_type):
        raise HTTPException(
            status_code=415,
            detail=f"{label} must contain a genuine JPEG, PNG or WebP image.",
        )
    return data


def decode_image(
    data,
    label,
):
    try:
        with Image.open(
            BytesIO(data)
        ) as image:
            # Pillow opens headers lazily: check pixel count BEFORE EXIF
            # transpose, RGB conversion or memory-intensive resize.
            if not image_dimensions_allowed(image.width, image.height):
                raise ValueError("image_pixels_exceeded")
            image = ImageOps.exif_transpose(
                image
            ).convert("RGB")
            if (
                image.width < 120
                or image.height < 120
            ):
                raise ValueError(
                    "image_too_small"
                )
            longest = max(
                image.width,
                image.height,
            )
            if longest > MAX_IMAGE_EDGE:
                ratio = (
                    MAX_IMAGE_EDGE
                    / float(longest)
                )
                image = image.resize(
                    (
                        max(
                            1,
                            int(
                                round(
                                    image.width
                                    * ratio
                                )
                            ),
                        ),
                        max(
                            1,
                            int(
                                round(
                                    image.height
                                    * ratio
                                )
                            ),
                        ),
                    ),
                    Image.Resampling.LANCZOS,
                )
            rgb = np.asarray(
                image,
                dtype=np.uint8,
            )
        return cv2.cvtColor(
            rgb,
            cv2.COLOR_RGB2BGR,
        )
    except ValueError as error:
        if str(error) == "image_pixels_exceeded":
            raise HTTPException(
                status_code=413,
                detail=f"{label} has too many pixels for safe processing.",
            ) from error
        if str(error) == "image_too_small":
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{label} is too small for "
                    "reliable face verification."
                ),
            ) from error
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{label} could not be decoded "
                "as a valid image."
            ),
        ) from error


def image_quality(
    image,
):
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )
    blur_variance = float(
        cv2.Laplacian(
            gray,
            cv2.CV_64F,
        ).var()
    )
    brightness = float(
        np.mean(gray)
    )
    blur_score = min(
        1.0,
        max(
            0.0,
            blur_variance / 170.0,
        ),
    )
    if brightness < 35.0:
        brightness_score = max(
            0.0,
            brightness / 35.0,
        )
    elif brightness > 225.0:
        brightness_score = max(
            0.0,
            (255.0 - brightness)
            / 30.0,
        )
    else:
        brightness_score = 1.0
    score = (
        0.68 * blur_score
        + 0.32 * brightness_score
    )
    return {
        "score": float(
            max(
                0.0,
                min(1.0, score),
            )
        ),
        "blurVariance": blur_variance,
        "brightness": brightness,
    }


def largest_face_crop(
    image,
):
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )
    cascade_path = (
        cv2.data.haarcascades
        + "haarcascade_frontalface_default.xml"
    )
    detector = cv2.CascadeClassifier(
        cascade_path
    )
    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=5,
        minSize=(60, 60),
    )
    if len(faces) == 0:
        return image, 0
    x, y, width, height = max(
        faces,
        key=lambda item: (
            item[2] * item[3]
        ),
    )
    margin_x = int(
        round(width * 0.35)
    )
    margin_y = int(
        round(height * 0.45)
    )
    x0 = max(
        0,
        x - margin_x,
    )
    y0 = max(
        0,
        y - margin_y,
    )
    x1 = min(
        image.shape[1],
        x + width + margin_x,
    )
    y1 = min(
        image.shape[0],
        y + height + margin_y,
    )
    return (
        image[y0:y1, x0:x1].copy(),
        len(faces),
    )


def face_landmarks(
    image,
):
    face_crop, detected_count = (
        largest_face_crop(
            image
        )
    )
    # Preserve the full-image multiple-face finding before cropping.
    if detected_count > 1:
        return None, {
            "faceCount": detected_count,
            "reason": "multiple_faces",
        }
    rgb = cv2.cvtColor(
        face_crop,
        cv2.COLOR_BGR2RGB,
    )
    face_mesh_module = (
        mp.solutions.face_mesh
    )
    with face_mesh_module.FaceMesh(
        static_image_mode=True,
        max_num_faces=2,
        refine_landmarks=True,
        min_detection_confidence=0.50,
    ) as face_mesh:
        result = face_mesh.process(
            rgb
        )
    face_landmark_sets = (
        result.multi_face_landmarks
        if result
        else None
    )
    if not face_landmark_sets:
        return None, {
            "faceCount": detected_count,
            "reason": "face_not_detected",
        }
    if len(face_landmark_sets) > 1:
        return None, {
            "faceCount": len(
                face_landmark_sets
            ),
            "reason": "multiple_faces",
        }
    landmarks = (
        face_landmark_sets[0]
        .landmark
    )
    points = np.array(
        [
            [
                float(point.x),
                float(point.y),
            ]
            for point in landmarks
        ],
        dtype=np.float64,
    )
    if (
        points.shape[0]
        <= max(MATCH_LANDMARKS)
    ):
        return None, {
            "faceCount": 1,
            "reason": (
                "insufficient_landmarks"
            ),
        }
    return points, {
        "faceCount": 1,
        "reason": "",
    }


def normalize_landmarks(
    points,
):
    # Broken, unbounded or non-finite model landmarks must never turn into
    # a misleading similarity score (or a JSON NaN that breaks the request).
    points = np.asarray(points, dtype=np.float64)
    if (
        points.ndim != 2 or points.shape[1] != 2
        or points.shape[0] <= max(MATCH_LANDMARKS)
        or not np.isfinite(points).all()
        or np.any(points < -0.25) or np.any(points > 1.25)
    ):
        raise ValueError("invalid_landmark_coordinates")
    left_eye = points[
        LEFT_EYE_OUTER
    ]
    right_eye = points[
        RIGHT_EYE_OUTER
    ]
    eye_vector = (
        right_eye
        - left_eye
    )
    eye_distance = float(
        np.linalg.norm(
            eye_vector
        )
    )
    if not math.isfinite(eye_distance) or eye_distance < 1e-5:
        raise ValueError(
            "invalid_eye_geometry"
        )
    center = (
        left_eye
        + right_eye
    ) / 2.0
    angle = math.atan2(
        eye_vector[1],
        eye_vector[0],
    )
    cos_value = math.cos(
        -angle
    )
    sin_value = math.sin(
        -angle
    )
    rotation = np.array(
        [
            [
                cos_value,
                -sin_value,
            ],
            [
                sin_value,
                cos_value,
            ],
        ],
        dtype=np.float64,
    )
    aligned = (
        points
        - center
    ) @ rotation.T
    aligned = (
        aligned
        / eye_distance
    )
    selected = aligned[
        MATCH_LANDMARKS
    ]
    if not np.isfinite(selected).all():
        raise ValueError("nonfinite_normalized_landmarks")
    return selected


def procrustes_distance(
    first,
    second,
):
    a = np.asarray(
        first,
        dtype=np.float64,
    )
    b = np.asarray(
        second,
        dtype=np.float64,
    )
    a = a - np.mean(
        a,
        axis=0,
        keepdims=True,
    )
    b = b - np.mean(
        b,
        axis=0,
        keepdims=True,
    )
    norm_a = float(
        np.linalg.norm(a)
    )
    norm_b = float(
        np.linalg.norm(b)
    )
    if (
        norm_a < 1e-8
        or norm_b < 1e-8
    ):
        return 1.0
    a = a / norm_a
    b = b / norm_b
    matrix = (
        b.T
        @ a
    )
    u, _, vt = (
        np.linalg.svd(
            matrix
        )
    )
    rotation = (
        u
        @ vt
    )
    aligned_b = (
        b
        @ rotation
    )
    point_error = (
        a
        - aligned_b
    )
    return float(
        np.sqrt(
            np.mean(
                np.sum(
                    point_error
                    * point_error,
                    axis=1,
                )
            )
        )
    )


def pairwise_shape_distance(
    first,
    second,
):
    def descriptor(
        points,
    ):
        values = []
        for left_index in range(
            len(points)
        ):
            for right_index in range(
                left_index + 1,
                len(points),
            ):
                values.append(
                    float(
                        np.linalg.norm(
                            points[
                                left_index
                            ]
                            - points[
                                right_index
                            ]
                        )
                    )
                )
        vector = np.asarray(
            values,
            dtype=np.float64,
        )
        median = float(
            np.median(vector)
        )
        if median < 1e-8:
            return vector
        return vector / median
    first_vector = descriptor(
        first
    )
    second_vector = descriptor(
        second
    )
    if (
        first_vector.size == 0
        or second_vector.size == 0
    ):
        return 1.0
    return float(
        np.sqrt(
            np.mean(
                (
                    first_vector
                    - second_vector
                )
                ** 2
            )
        )
    )


def similarity_score(
    id_points,
    selfie_points,
):
    geometric_distance = (
        procrustes_distance(
            id_points,
            selfie_points,
        )
    )
    shape_distance = (
        pairwise_shape_distance(
            id_points,
            selfie_points,
        )
    )
    combined_distance = (
        0.64
        * geometric_distance
        + 0.36
        * min(
            1.0,
            shape_distance,
        )
    )
    # Converts a lower geometry distance to an intuitive 0..1 similarity.
    # Threshold remains environment-configurable for local calibration.
    score = math.exp(
        -5.0
        * combined_distance
    )
    return {
        "score": float(
            max(
                0.0,
                min(
                    1.0,
                    score,
                ),
            )
        ),
        "geometryDistance": float(
            geometric_distance
        ),
        "shapeDistance": float(
            shape_distance
        ),
    }


def manual_review_result(
    *,
    uid,
    message,
    match_score=None,
    id_quality=None,
    selfie_quality=None,
    warning=None,
):
    warnings = []
    if warning:
        warnings.append(
            warning
        )
    return {
        "ok": True,
        "verificationId":
            verification_id_for(
                uid
            ),
        "status": "pending",
        "decision": "manual_review",
        "matchScore":
            match_score,
        "livenessScore": None,
        "selfieQualityScore":
            (
                selfie_quality
                or {}
            ).get(
                "score"
            ),
        "idImageQualityScore":
            (
                id_quality
                or {}
            ).get(
                "score"
            ),
        "message": message,
        "warnings": warnings,
        "engine": (
            "mediapipe-landmark-1to1-v1"
        ),
        "livenessImplemented":
            False,
    }


def failed_attempt_result(
    *,
    uid,
    message,
    id_quality=None,
    selfie_quality=None,
    warning=None,
    match_score=None,
):
    """Attempt failed; the Resident account is not banned or deactivated."""
    return {
        "ok": True,
        "verificationId": verification_id_for(uid),
        "status": "failed",
        "decision": "failed",
        "matchScore": match_score,
        "livenessScore": None,
        "selfieQualityScore": (selfie_quality or {}).get("score"),
        "idImageQualityScore": (id_quality or {}).get("score"),
        "message": message,
        "warnings": [warning] if warning else [],
        "engine": "mediapipe-landmark-1to1-v1",
        "livenessImplemented": False,
    }


def extract_government_id_text(id_document_bytes, label):
    """Transient OCR only; never log, persist, or return raw ID content."""
    image = decode_image(id_document_bytes, label)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    longest = max(gray.shape[:2])
    if longest < 1500:
        factor = min(1.6, 2100.0 / float(longest))
        gray = cv2.resize(
            gray, None, fx=factor, fy=factor,
            interpolation=cv2.INTER_CUBIC,
        )
    contrast = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    processed = cv2.adaptiveThreshold(
        contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 11,
    )
    return (
        pytesseract.image_to_string(gray, config="--psm 11")
        + "\n"
        + pytesseract.image_to_string(processed, config="--psm 6")
    )


def screen_government_id(
    *, declared_type, id_document_bytes, id_back_document_bytes=None,
    expected_first_name="", expected_last_name="",
    expected_date_of_birth="", expected_barangay="",
):
    """OCR plausibility and profile consistency; never government issuance."""
    try:
        front_text = extract_government_id_text(
            id_document_bytes, "Government ID front image"
        )
        back_text = (
            extract_government_id_text(
                id_back_document_bytes, "Government ID back image"
            )
            if id_back_document_bytes is not None else None
        )
        result = assess_document_sides(declared_type, front_text, back_text)
        # Transient whole-image blur estimate; not proof of real ID issuance.
        quality = image_quality(decode_image(id_document_bytes, "Government ID front image"))
        result = add_photo_quality(result, quality["blurVariance"])
        # The back must have independent image-quality evidence. A readable
        # front does NOT make a blurred or illegible reverse side adequate.
        # Passport bio page is single-sided and exempt from back scanning.
        back_blur = None
        if id_back_document_bytes is not None and declared_type != "passport":
            back_image = decode_image(id_back_document_bytes, "Government ID back image")
            back_blur = image_quality(back_image)["blurVariance"]
        result = add_back_photo_quality(result, back_blur)
        ocr_combined = front_text + "\n" + (back_text or "")
        result.update(assess_profile_name(
            expected_first_name, expected_last_name, ocr_combined
        ))
        result.update(profile_comparison(
            expected_date_of_birth, expected_barangay, ocr_combined
        ))
        if declared_type == "passport":
            # ICAO TD3 MRZ checks add a privacy-safe textual consistency clue
            # from existing Tesseract OCR; valid checksum != genuine passport.
            mrz = assess_passport_mrz(front_text, expected_date_of_birth)
            result.update(mrz)
            if mrz["passportMrzCheck"] in (
                "checksum_inconsistent_or_ocr_error", "multiple_candidates"
            ):
                if result["status"] == "text_consistent_unverified":
                    result["status"] = "inconclusive"
                result["warningCodes"] = list(dict.fromkeys(
                    result.get("warningCodes", []) + ["passport_mrz_review_required"]
                ))
            if mrz["passportMrzBirthDateCheck"] == "possible_conflict":
                result["profileBirthDateCheck"] = "possible_conflict"
                result["profileBirthDateCompared"] = True
                result["warningCodes"] = list(dict.fromkeys(
                    result.get("warningCodes", [])
                    + ["passport_mrz_profile_birth_date_conflict"]
                ))
            elif (mrz["passportMrzBirthDateCheck"] == "possible_match"
                  and result.get("profileBirthDateCheck") == "inconclusive"):
                # A valid checksum with matching DOB is only a plausible
                # OCR clue, never proof of age, holder or issuer authenticity.
                result["profileBirthDateCheck"] = "possible_match"
                result["profileBirthDateCompared"] = True
        # Explicitly report missing issuer/PAD checks. Neither OCR, matching
        # demographics nor a client movement challenge proves identity.
        result["issuerAuthenticityStatus"] = "not_verified"
        result["presentationAttackStatus"] = "not_validated"
        return result
    except Exception:
        logging.warning("Government ID OCR screening unavailable")
        result = document_ocr_unavailable(declared_type)
        result["backSideProvided"] = id_back_document_bytes is not None
        result["backSideScreened"] = False
        result["backImageQualityStatus"] = (
            "not_required" if declared_type == "passport" else "not_checked"
        )
        result["profileNameCheck"] = "inconclusive"
        result["profileNameCompared"] = False
        result.update(profile_comparison(expected_date_of_birth, expected_barangay, ""))
        result["issuerAuthenticityStatus"] = "not_verified"
        result["presentationAttackStatus"] = "not_validated"
        return result


def run_face_verification(
    *,
    uid,
    id_document_bytes,
    selfie_bytes,
):
    id_image = decode_image(
        id_document_bytes,
        "Government ID image",
    )
    selfie_image = decode_image(
        selfie_bytes,
        "Selfie image",
    )
    id_quality = image_quality(
        id_image
    )
    selfie_quality = image_quality(
        selfie_image
    )
    id_landmarks, id_meta = (
        face_landmarks(
            id_image
        )
    )
    selfie_landmarks, selfie_meta = (
        face_landmarks(
            selfie_image
        )
    )
    if id_landmarks is None:
        reason = id_meta.get("reason") or "face_not_detected"
        message = (
            "More than one face was found in the government ID photo. "
            "Please retry with only the ID holder's face visible."
            if reason == "multiple_faces"
            else "No usable face was detected in the government ID photo. "
                 "Please upload a clearer photo ID and retry."
        )
        return failed_attempt_result(
            uid=uid,
            message=message,
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning=f"id_{reason}",
        )
    if selfie_landmarks is None:
        reason = selfie_meta.get("reason") or "face_not_detected"
        message = (
            "More than one face was found in the selfie. "
            "Please retry with only your face visible."
            if reason == "multiple_faces"
            else "No usable face was detected in the selfie. "
                 "Please retake your face scan and retry."
        )
        return failed_attempt_result(
            uid=uid,
            message=message,
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning=f"selfie_{reason}",
        )
    min_quality = (
        get_min_quality_threshold()
    )
    if (
        id_quality["score"] < min_quality
        or selfie_quality["score"] < min_quality
    ):
        return failed_attempt_result(
            uid=uid,
            message=(
                "The ID or selfie is too blurry or poorly lit for reliable "
                "verification. Please capture clearer images and retry."
            ),
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning="low_image_quality",
        )
    try:
        normalized_id = (
            normalize_landmarks(
                id_landmarks
            )
        )
        normalized_selfie = (
            normalize_landmarks(
                selfie_landmarks
            )
        )
    except ValueError:
        return manual_review_result(
            uid=uid,
            message=(
                "The detected face geometry could not be normalized "
                "reliably. LGU/Admin review is required."
            ),
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning=(
                "face_geometry_unreliable"
            ),
        )
    similarity = similarity_score(
        normalized_id,
        normalized_selfie,
    )
    raw_score = similarity.get("score") if isinstance(similarity, dict) else None
    if (isinstance(raw_score, bool)
        or not isinstance(raw_score, (int, float, np.number))
        or not math.isfinite(float(raw_score))
        or not 0.0 <= float(raw_score) <= 1.0):
        return manual_review_result(
            uid=uid,
            message="The facial geometry score is inconclusive. Independent Admin review is required.",
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning="face_geometry_unreliable",
        )
    match_score = round(float(raw_score), 4)
    # SHADOW ONLY: optional research models must never be a single point
    # of failure for the primary ID/selfie geometry assessment. A corrupted
    # optional ONNX file, unavailable detector or malformed research output
    # means "unavailable" — not identity approval, a 500, or a PAD claim.
    # No raw exception details, embeddings, image metadata or user IDs leave.
    try:
        pad_observation = assess_frame_shadow(selfie_image)
    except Exception:
        pad_observation = None
    allowed_pad_status = {
        "disabled", "unavailable", "inconclusive",
        "model_prefers_live_unvalidated", "model_prefers_attack_unvalidated",
    }
    pad_status = (
        pad_observation.get("status")
        if isinstance(pad_observation, dict) else None
    )
    pad_shadow = {
        "status": pad_status if isinstance(pad_status, str) and pad_status in allowed_pad_status else "unavailable",
        "independentPadValidated": False,
        "identityDecisionUse": "none",
    }
    # Two models from the same training family cannot establish liveness.
    try:
        ensemble_observation = assess_ensemble_shadow(
            selfie_image, primary=pad_shadow
        )
    except Exception:
        ensemble_observation = None
    ensemble_status = (
        ensemble_observation.get("status")
        if isinstance(ensemble_observation, dict) else None
    )
    allowed_ensemble_status = {
        "disabled", "unavailable", "inconclusive",
        "agreement_live_unvalidated", "agreement_attack_unvalidated",
    }
    pad_ensemble_shadow = {
        "status": (ensemble_status if isinstance(ensemble_status, str) and ensemble_status in allowed_ensemble_status
                   else "unavailable"),
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "automaticApprovalAllowed": False,
        "modelsIndependent": False,
    }
    # SFace is optional, shadow-only; neither raw cosine similarity nor
    # independent identity validation may be inferred from this signal.
    try:
        sface_observation = sface_assess_pair_shadow(id_image, selfie_image)
    except Exception:
        sface_observation = None
    sface_status = (
        sface_observation.get("status")
        if isinstance(sface_observation, dict) else None
    )
    sface_diagnostic = {
        "status": (sface_status if isinstance(sface_status, str) and sface_status in {
            "disabled", "unavailable", "inconclusive",
            "similarity_observed_unvalidated",
        } else "unavailable"),
        "independentFaceMatchValidated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
    }
    threshold = (
        get_match_threshold()
    )
    verification_id = (
        verification_id_for(
            uid
        )
    )
    if match_score >= threshold:
        return {
            "ok": True,
            "verificationId":
                verification_id,
            "status": "pending",
            "decision": "manual_review",
            "matchScore":
                match_score,
            # A single still selfie cannot prove liveness.
            # Do not fabricate a liveness score.
            "livenessScore": None,
            "selfieQualityScore":
                round(
                    selfie_quality[
                        "score"
                    ],
                    4,
                ),
            "idImageQualityScore":
                round(
                    id_quality[
                        "score"
                    ],
                    4,
                ),
            "matchThreshold":
                threshold,
            "message": (
                "The government ID face and submitted selfie "
                "passed the VolunServe 1-to-1 landmark comparison. "
                "Manual Admin review is required; liveness and ID authenticity are unverified."
            ),
            "warnings": [
                (
                    "Independent Admin review is needed; passive liveness "
                    "cannot be proven from a single still image."
                )
            ],
            "engine": (
                "mediapipe-landmark-1to1-v1"
            ),
            "livenessImplemented":
                False,
            "passivePadShadow": pad_shadow,
            "ensemblePadShadow": pad_ensemble_shadow,
            "sFaceShadow": sface_diagnostic,
        }
    fallback = manual_review_result(
        uid=uid,
        message=(
            "The automatic 1-to-1 face comparison was not "
            "confident enough to verify the Resident. "
            "The submission has been sent to LGU/Admin manual review."
        ),
        match_score=match_score,
        id_quality=id_quality,
        selfie_quality=selfie_quality,
        warning="face_match_uncertain_uncalibrated",
    )
    fallback["passivePadShadow"] = pad_shadow
    fallback["ensemblePadShadow"] = pad_ensemble_shadow
    fallback["sFaceShadow"] = sface_diagnostic
    return fallback


def document_ocr_ready():
    """Check the installed OCR executable, not just the Python wrapper."""
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


@app.get("/health")
def health():
    ocr_ready = document_ocr_ready()
    profile_ready = callable(profile_comparison)
    return {
        "ok": True,
        "service": (
            "volunserve-identity-ai"
        ),
        "engine": (
            "mediapipe-landmark-1to1-v1"
        ),
        "internalAuthConfigured": bool(
            get_internal_key()
        ),
        "verificationEngineReady": face_mesh_engine_ready(),
        "documentOcrReady": ocr_ready,
        "profileComparisonReady": profile_ready,
        "documentPrecheckReady": ocr_ready and profile_ready,
        "idFrontBackScreeningImplemented": True,
        "mediaPipeVersion": str(getattr(mp, "__version__", "unknown")),
        "faceMatchThreshold":
            get_match_threshold(),
        "livenessImplemented": False,
        "passivePadShadow": passive_pad_readiness(),
        "secondaryPadShadow": v1se_pad_readiness(),
        "sFaceShadow": sface_readiness(),
        "idDocumentScreeningImplemented": True,
        "idDocumentAuthenticityVerified": False,
        "time": datetime.now(
            timezone.utc
        ).isoformat(),
    }


@app.get(
    "/api/identity/capabilities"
)


def capabilities():
    return {
        "ok": True,
        "provider": (
            "volunserve-custom-ai"
        ),
        "externalKycProvider": False,
        "features": {
            "governmentIdOcr": {
                "planned": True,
                "active": True,
                "method": "ocr_keyword_screen_not_document_authentication",
            },
            "idFaceDetection": {
                "planned": False,
                "active": True,
            },
            "liveSelfieInput": {
                "planned": False,
                "active": True,
            },
            "livenessDetection": {
                "planned": True,
                "active": False,
            },
            "faceMatching": {
                "planned": False,
                "active": True,
                "method": (
                    "mediapipe_landmark_geometry"
                ),
            },
            "profileDataMatching": {
                "planned": True,
                "active": False,
            },
            "manualReviewFallback": {
                "planned": False,
                "active": True,
            },
        },
    }


# Document-only precheck: no selfie, no face comparison, no attempt charge.
# Return only sanitized OCR status; user consent and upload rate limiting
# are enforced by the authenticated Node gateway before reaching this route.
@app.post("/document/precheck")
async def document_precheck(
    request: Request,
    x_volunserve_user_id: str | None = Header(
        default=None, alias="X-VolunServe-User-Id",
    ),
    x_volunserve_internal_key: str | None = Header(
        default=None, alias="X-VolunServe-Internal-Key",
    ),
    x_volunserve_profile_first_name: str | None = Header(
        default=None, alias="X-VolunServe-Profile-First-Name",
    ),
    x_volunserve_profile_last_name: str | None = Header(
        default=None, alias="X-VolunServe-Profile-Last-Name",
    ),
    x_volunserve_profile_date_of_birth: str | None = Header(
        default=None, alias="X-VolunServe-Profile-Date-Of-Birth",
    ),
    x_volunserve_profile_barangay: str | None = Header(
        default=None, alias="X-VolunServe-Profile-Barangay",
    ),
):
    require_internal_backend(x_volunserve_internal_key)
    validate_forwarded_user(x_volunserve_user_id)
    content_type = clean_text(request.headers.get("content-type", ""), 200).lower()
    if not content_type.startswith("multipart/form-data"):
        raise HTTPException(status_code=415, detail="Identity documents require multipart form data.")
    form = await request.form()
    declared_type = clean_text(form.get("idType"), 60).lower()
    if declared_type not in ACCEPTED_ID_TYPES:
        raise HTTPException(status_code=400, detail="Choose one of the five supported government IDs.")
    front_upload = form.get("idDocument")
    back_upload = form.get("idBackDocument")
    if declared_type != "passport" and not isinstance(back_upload, StarletteUploadFile):
        raise HTTPException(status_code=400, detail="Capture both sides of the selected ID.")
    if form.get("selfie") is not None:
        raise HTTPException(status_code=400, detail="A selfie is not required for document screening.")
    try:
        front_bytes = await read_upload(
            front_upload, label="Government ID front image",
            maximum_bytes=MAX_ID_DOCUMENT_BYTES,
        )
        back_bytes = (
            await read_upload(back_upload, label="Government ID back image",
                              maximum_bytes=MAX_ID_DOCUMENT_BYTES)
            if isinstance(back_upload, StarletteUploadFile) else None
        )
    finally:
        if isinstance(front_upload, StarletteUploadFile):
            await front_upload.close()
        if isinstance(back_upload, StarletteUploadFile):
            await back_upload.close()
    if back_bytes is not None:
        if hashlib.sha256(front_bytes).digest() == hashlib.sha256(back_bytes).digest():
            raise HTTPException(status_code=400, detail="Front and back cannot be identical images.")
        decode_image(back_bytes, "Government ID back image")
    # Never send account fields, DOB, names, image data or OCR text back.
    screening = await asyncio.to_thread(
        screen_government_id, declared_type=declared_type,
        id_document_bytes=front_bytes, id_back_document_bytes=back_bytes,
        expected_first_name=x_volunserve_profile_first_name or "",
        expected_last_name=x_volunserve_profile_last_name or "",
        expected_date_of_birth=x_volunserve_profile_date_of_birth or "",
        expected_barangay=x_volunserve_profile_barangay or "",
    )
    birthday_conflict = screening.get("profileBirthDateCheck") == "possible_conflict"
    # Document precheck and the actual /verify route MUST share exactly the
    # same fail-closed policy: no face comparison after contradictory ID OCR,
    # missing/blurred back evidence or an unresolved DOB/MRZ conflict.
    # "pass" here means eligible to attempt matching, NOT an authentic ID.
    recognized = screening_ready_for_face_comparison(screening, declared_type)
    review = (
        not birthday_conflict
        and not recognized
        and blurry_national_id_claim_needs_review(declared_type, screening)
    )
    outcome = "pass" if recognized else "review" if review else "retry"
    if birthday_conflict and outcome == "retry":
        message = "The ID birth date may differ from your saved profile. Retake a clear ID or ask Admin to review your profile; this is not proof of fraud."
    elif outcome == "pass":
        message = "ID format appears consistent. Birthday and barangay checks are OCR clues only; unresolved fields still require Admin review."
    elif outcome == "review":
        message = "The selected National ID is too blurry. It may continue only to Admin rescan review, never automatic approval."
    elif "school_id_not_supported" in (screening.get("warningCodes") or []):
        message = "Unsupported School or employee ID. Choose a valid government-issued ID."
    elif "document_front_back_swapped" in (screening.get("warningCodes") or []):
        message = "Front and back appear reversed. Retake each ID side in its correct slot."
    elif "document_back_looks_like_front" in (screening.get("warningCodes") or []):
        message = "Back scan may show the front of the ID. Retake the reverse side."
    elif "document_front_side_conflict" in (screening.get("warningCodes") or []):
        message = "Front scan appears to contain back-side details. Retake the portrait/front."
    else:
        message = "Document type or side could not be confirmed. Retake clear ID photos."
    return {"ok": True, "outcome": outcome, "documentScreening": screening,
            "message": message, "authenticityVerified": False,
            "livenessVerified": False}


@app.post(
    "/verify"
)


async def verify_identity(
    request: Request,
    x_volunserve_user_id: str
    | None = Header(
        default=None,
        alias="X-VolunServe-User-Id",
    ),
    x_volunserve_internal_key: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Internal-Key",
    ),
    x_volunserve_profile_first_name: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Profile-First-Name",
    ),
    x_volunserve_profile_last_name: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Profile-Last-Name",
    ),
    x_volunserve_profile_date_of_birth: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Profile-Date-Of-Birth",
    ),
    x_volunserve_profile_barangay: str
    | None = Header(
        default=None,
        alias="X-VolunServe-Profile-Barangay",
    ),
):
    require_internal_backend(
        x_volunserve_internal_key
    )
    uid = validate_forwarded_user(
        x_volunserve_user_id
    )
    content_type = clean_text(
        request.headers.get(
            "content-type",
            "",
        ),
        200,
    ).lower()
    if not content_type.startswith(
        "multipart/form-data"
    ):
        raise HTTPException(
            status_code=415,
            detail=(
                "Identity verification must be "
                "submitted as multipart form data."
            ),
        )
    form = await request.form()
    id_type = clean_text(
        form.get("idType"),
        60,
    ).lower()
    if id_type not in ACCEPTED_ID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Select a supported government ID type."
            ),
        )
    id_upload = form.get(
        "idDocument"
    )
    selfie_upload = form.get(
        "selfie"
    )
    back_upload = form.get("idBackDocument")
    if id_type != "passport" and not isinstance(
        back_upload, StarletteUploadFile
    ):
        raise HTTPException(
            status_code=400,
            detail="Scan both the front and back of the same government ID.",
        )
    try:
        id_document_bytes = (
            await read_upload(
                id_upload,
                label=(
                    "Government ID image"
                ),
                maximum_bytes=(
                    MAX_ID_DOCUMENT_BYTES
                ),
            )
        )
        id_back_document_bytes = (
            await read_upload(
                back_upload,
                label="Government ID back image",
                maximum_bytes=MAX_ID_DOCUMENT_BYTES,
            )
            if isinstance(back_upload, StarletteUploadFile) else None
        )
        selfie_bytes = (
            await read_upload(
                selfie_upload,
                label="Selfie image",
                maximum_bytes=(
                    MAX_SELFIE_BYTES
                ),
            )
        )
    finally:
        if isinstance(
            id_upload,
            StarletteUploadFile,
        ):
            await id_upload.close()
        if isinstance(
            selfie_upload,
            StarletteUploadFile,
        ):
            await selfie_upload.close()
        if isinstance(back_upload, StarletteUploadFile):
            await back_upload.close()
    if (
        id_back_document_bytes is not None
        and hashlib.sha256(id_document_bytes).digest()
        == hashlib.sha256(id_back_document_bytes).digest()
    ):
        raise HTTPException(
            status_code=400,
            detail="The ID front and back must be different photographs.",
        )
    # A copied ID photo (front or back) is not an independent selfie.
    # This only detects exact byte reuse; it does NOT establish liveness,
    # reject re-encoded spoofs, or certify presentation-attack detection.
    selfie_fingerprint = hashlib.sha256(selfie_bytes).digest()
    if selfie_fingerprint == hashlib.sha256(id_document_bytes).digest() or (
        id_back_document_bytes is not None and
        selfie_fingerprint == hashlib.sha256(id_back_document_bytes).digest()
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The selfie and ID photos must be different images. "
                "Capture a new selfie with the camera."
            ),
        )
    if id_back_document_bytes is not None:
        # Reject corrupt or too-small back images before charging an attempt.
        decode_image(id_back_document_bytes, "Government ID back image")
    if not face_mesh_engine_ready():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI FaceMesh runtime is unavailable. The AI service must "
                "deploy the compatible MediaPipe build."
            ),
        )
    try:
        # Both the profile's Be a Verified Resident flow and the LGU review
        # queue use this one protected endpoint; no separate visual-only AI.
        # First check ONLY the government ID type the user selected.
        # Never run face matching if the document is unrecognized, a school
        # ID or a different government ID. Fail closed and allow a retry.
        document_screening = await asyncio.to_thread(
            screen_government_id,
            declared_type=id_type,
            id_document_bytes=id_document_bytes,
            id_back_document_bytes=id_back_document_bytes,
            expected_first_name=x_volunserve_profile_first_name or "",
            expected_last_name=x_volunserve_profile_last_name or "",
            expected_date_of_birth=x_volunserve_profile_date_of_birth or "",
            expected_barangay=x_volunserve_profile_barangay or "",
        )
        screening_status = document_screening.get("status")
        if blurry_national_id_claim_needs_review(id_type, document_screening):
            # Claim not verified. Human can request a better scan.
            # Keep this blocked from Approved identity state.
            result = manual_review_result(
                uid=uid,
                message=(
                    "The photo selected as National ID is too blurry for reliable "
                    "identity verification. Pending Admin review for a clearer "
                    "rescan or independent check; this is NOT an approved ID."
                ),
                warning="blurry_national_id_claim_review",
            )
        elif not screening_ready_for_face_comparison(document_screening, id_type):
            warnings = document_screening.get("warningCodes") or []
            if "document_front_back_swapped" in warnings:
                reason = "Front and back appear reversed. Retake the portrait/front side in the Front slot and the reverse in the Back slot."
            elif "document_back_looks_like_front" in warnings:
                reason = "The Back slot appears to show the front side. Check both images and retake the back side."
            elif "document_front_side_conflict" in warnings:
                reason = "The Front slot appears to show back-side details. Retake a clear portrait/front image."
            elif "school_id_not_supported" in warnings or screening_status == "unsupported":
                reason = "School IDs are not supported. Select and scan a valid government-issued ID."
            elif document_screening.get("backImageQualityStatus") in ("low", "unknown", "not_checked") and id_type != "passport":
                reason = "The government ID back image quality is insufficient. Retake a clear photo of the reverse side."
            elif document_screening.get("profileBirthDateCheck") == "possible_conflict":
                reason = "The scanned birth date may conflict with your saved profile. Correct the evidence and request independent Admin review; this does not prove fraud."
            elif document_screening.get("passportMrzCheck") in ("checksum_inconsistent_or_ocr_error", "multiple_candidates"):
                reason = "The passport MRZ text could not be confirmed. Retake a clear bio-page scan for independent review."
            elif document_screening.get("warningCodes"):
                reason = "The ID scan contains unresolved OCR warnings. Correct the document photos before face comparison."
            elif screening_status == "mismatch":
                reason = "The scanned document does not match the selected government ID type. Select the correct ID and retry."
            else:
                reason = "The selected government ID type or orientation could not be confirmed from the scan. Retake a clear photo and retry."
            result = failed_attempt_result(
                uid=uid, message=reason,
                warning="selected_government_id_not_recognized",
            )
        else:
            result = await asyncio.to_thread(
                run_face_verification,
                uid=uid,
                id_document_bytes=id_document_bytes,
                selfie_bytes=selfie_bytes,
            )

    except HTTPException:
        raise
    except Exception:
        # Python exception text and tracebacks may contain OCR content,
        # filenames or face-model internals. Never print them in Render logs.
        # A constant marker is enough to identify an internal failure.
        logging.error("Identity verification internal failure")
        raise HTTPException(
            status_code=500,
            detail=(
                "The AI face comparison failed internally. "
                "Check volunserve-identity-ai Render Logs for "
                "'Face comparison engine error'. No match decision was produced."
            ),
        ) from None
    return {
        **result,
        "idType": id_type,
        "documentScreening": document_screening,
    }
