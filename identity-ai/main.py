import os
from datetime import datetime
from datetime import timezone

from fastapi import Depends
from fastapi import FastAPI
from fastapi import Header
from fastapi import HTTPException
from fastapi.middleware.cors import (
    CORSMiddleware,
)

from firebase_admin_config import (
    verify_firebase_token,
)


app = FastAPI(
    title="VolunServe Identity AI",
    version="1.0.0",
    description=(
        "VolunServe custom AI-assisted "
        "identity verification backend."
    ),
)


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:8084",
    "http://localhost:19006",
    "http://localhost:3000",
]


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
    allow_origins=(
        get_allowed_origins()
    ),
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
    ],
)


def get_bearer_token(
    authorization: str
    | None = Header(
        default=None
    ),
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail=(
                "Authorization token "
                "is required."
            ),
        )

    prefix = "Bearer "

    if not authorization.startswith(
        prefix
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid authorization "
                "header."
            ),
        )

    token = authorization[
        len(prefix):
    ].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase ID token "
                "is missing."
            ),
        )

    return token


def require_user(
    token: str = Depends(
        get_bearer_token
    ),
):
    try:
        decoded = (
            verify_firebase_token(
                token
            )
        )

        return decoded

    except Exception as exc:
        print(
            "Firebase authentication "
            "failed:",
            str(exc),
        )

        raise HTTPException(
            status_code=401,
            detail=(
                "Your VolunServe session "
                "could not be verified."
            ),
        ) from exc


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
            "custom"
        ),
        "time": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
    }


@app.get(
    "/api/auth-check"
)
def auth_check(
    user=Depends(
        require_user
    ),
):
    return {
        "ok": True,
        "uid": user.get(
            "uid"
        ),
        "email": user.get(
            "email"
        ),
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
        "features": {
            "governmentIdOcr": True,
            "idFaceDetection": True,
            "livenessDetection": True,
            "faceMatching": True,
            "profileDataMatching": True,
        },
        "externalKycProvider": False,
    }