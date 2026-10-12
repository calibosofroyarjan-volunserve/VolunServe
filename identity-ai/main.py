import asyncio
import math
import os
import secrets
import uuid
from datetime import datetime, timezone
from io import BytesIO

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request
from starlette.datastructures import UploadFile as StarletteUploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps


app = FastAPI(
    title="VolunServe Identity AI",
    version="2.0.0",
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
    "other_government_id",
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

    data = await upload.read()

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

    return data


def decode_image(
    data,
    label,
):
    try:
        with Image.open(
            BytesIO(data)
        ) as image:
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

    if eye_distance < 1e-5:
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
        reason = id_meta.get(
            "reason"
        )

        if reason == "multiple_faces":
            message = (
                "More than one face was detected in the "
                "government ID image. LGU/Admin review is required."
            )
        else:
            message = (
                "A clear face could not be detected in the "
                "government ID image. LGU/Admin review is required."
            )

        return manual_review_result(
            uid=uid,
            message=message,
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning=reason,
        )

    if selfie_landmarks is None:
        reason = selfie_meta.get(
            "reason"
        )

        if reason == "multiple_faces":
            message = (
                "More than one face was detected in the selfie. "
                "LGU/Admin review is required."
            )
        else:
            message = (
                "A clear face could not be detected in the selfie. "
                "LGU/Admin review is required."
            )

        return manual_review_result(
            uid=uid,
            message=message,
            id_quality=id_quality,
            selfie_quality=selfie_quality,
            warning=reason,
        )

    min_quality = (
        get_min_quality_threshold()
    )

    if (
        id_quality["score"]
        < min_quality
        or selfie_quality["score"]
        < min_quality
    ):
        return manual_review_result(
            uid=uid,
            message=(
                "The submitted images are not clear enough for "
                "automatic face verification. LGU/Admin review is required."
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

    match_score = round(
        similarity["score"],
        4,
    )

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
            "status": "verified",
            "decision": "verified",
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
                "passed the VolunServe 1-to-1 face comparison."
            ),
            "warnings": [
                (
                    "Passive liveness is not inferred from a "
                    "single still image."
                )
            ],
            "engine": (
                "mediapipe-landmark-1to1-v1"
            ),
            "livenessImplemented":
                False,
        }

    return manual_review_result(
        uid=uid,
        message=(
            "The automatic 1-to-1 face comparison was not "
            "confident enough to verify the Resident. "
            "The submission has been sent to LGU/Admin manual review."
        ),
        match_score=match_score,
        id_quality=id_quality,
        selfie_quality=selfie_quality,
        warning="face_match_uncertain",
    )


@app.get(
    "/health"
)
def health():
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
        "verificationEngineReady": True,
        "faceMatchThreshold":
            get_match_threshold(),
        "livenessImplemented": False,
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
                "active": False,
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

    result = await asyncio.to_thread(
        run_face_verification,
        uid=uid,
        id_document_bytes=(
            id_document_bytes
        ),
        selfie_bytes=selfie_bytes,
    )

    return {
        **result,
        "idType": id_type,
    }
