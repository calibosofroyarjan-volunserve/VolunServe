"""Fail-closed staging-only startup guard for VolunServe's ORIGINAL Python AI.

Created as a QA-only candidate from the exact deployed Python AI commit
319152e6a1cad5e54653c20e87bd1551a82b219e. Not deployed.

This service should never talk to Firebase or Cloudinary directly. The
staging backend owns authenticated ID media storage and Firestore. Requiring
separate project and internal-key fingerprints does NOT independently prove
that real provider credentials have been separately provisioned.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
from typing import Mapping

_PRODUCTION_FIREBASE_PROJECT = "volunserve-3aa5b"
_STAGING_SERVICE = "volunserve-identity-ai-staging"
_STAGING_BACKEND = "https://volunserve-backend-staging.onrender.com"


def assert_original_ai_staging_isolated(env: Mapping[str, str] | None = None) -> None:
    settings = os.environ if env is None else env
    name = str(settings.get("RENDER_SERVICE_NAME") or "").strip()
    stage = str(settings.get("VOLUNSERVE_DEPLOYMENT_ENV") or "").strip().lower()
    strict = str(settings.get("VOLUNSERVE_STAGING_STRICT") or "").strip().lower()
    activated = "staging" in name.lower() or stage == "staging" or strict == "true"
    if not activated:
        return  # Existing production/local behavior is unchanged.

    def block(reason: str) -> None:
        # Never include credentials, hashes, identities, or uploaded images.
        raise RuntimeError("Original AI staging isolation blocked: " + reason)

    if name != _STAGING_SERVICE or stage != "staging" or strict != "true":
        block("exact staging service name and explicit strict staging flags required")

    claimed_project = str(settings.get("VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID") or "").strip()
    if (not claimed_project or claimed_project == _PRODUCTION_FIREBASE_PROJECT or
            not re.fullmatch(r"[a-z][a-z0-9-]{3,62}", claimed_project)):
        block("dedicated nonproduction Firebase project must be declared")

    backend = str(settings.get("VOLUNSERVE_STAGING_BACKEND_URL") or "").strip().rstrip("/")
    if backend != _STAGING_BACKEND:
        block("expected isolated staging backend URL required")

    # Python AI is a private image-processing service. It must not be given
    # direct Firebase credentials, application-default key files or any
    # Cloudinary account credentials, whether production or otherwise.
    for variable in (
        "FIREBASE_SERVICE_ACCOUNT_JSON", "GOOGLE_APPLICATION_CREDENTIALS",
        "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET", "CLOUDINARY_URL",
    ):
        if str(settings.get(variable) or "").strip():
            block("private Python AI must not receive Firebase or Cloudinary credentials")

    cloud_project = str(settings.get("GOOGLE_CLOUD_PROJECT") or "").strip()
    if cloud_project and cloud_project != claimed_project:
        block("Google Cloud project does not match isolated staging declaration")

    key = str(settings.get("IDENTITY_AI_INTERNAL_KEY") or "").strip()
    if len(key) < 32 or key.lower() in {"changeme", "test", "demo", "development"}:
        block("separately generated strong internal backend key required")

    staging_fingerprint = str(settings.get("VOLUNSERVE_STAGING_INTERNAL_KEY_SHA256") or "").strip().lower()
    production_fingerprint = str(settings.get("VOLUNSERVE_PRODUCTION_INTERNAL_KEY_SHA256") or "").strip().lower()
    if not (re.fullmatch(r"[0-9a-f]{64}", staging_fingerprint) and
            re.fullmatch(r"[0-9a-f]{64}", production_fingerprint)):
        block("independent internal key fingerprints must be supplied")
    actual = hashlib.sha256(key.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(actual, staging_fingerprint):
        block("staging internal key fingerprint does not match its configured key")
    if hmac.compare_digest(staging_fingerprint, production_fingerprint):
        block("staging internal key fingerprint must differ from production")

    origins = str(settings.get("ALLOWED_ORIGINS") or "").lower()
    if "volunserve.com" in origins or "volunserve-3aa5b" in origins:
        block("staging AI browser origins must not include production websites")


__all__ = ["assert_original_ai_staging_isolated"]
