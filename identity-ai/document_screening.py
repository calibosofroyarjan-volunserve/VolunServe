"""Privacy-preserving Philippine government ID *plausibility* screening.

OCR keywords are NOT proof that a document is real, issued by an agency,
unexpired, or untampered. This module never stores or returns raw OCR,
ID numbers, addresses, names or the ID photo.
"""
from __future__ import annotations

import re
import unicodedata

SUPPORTED = frozenset({
    "national_id", "drivers_license", "passport", "other_government_id",
})
METHOD = "ph_government_id_ocr_keyword_screen_v1"


def _normalized(value: str) -> str:
    """Normalize noisy OCR without returning original personal information."""
    plain = unicodedata.normalize("NFKD", str(value or "")).upper()
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]+", " ", plain).strip()


def _document_signals(text: str) -> set[str]:
    t = " " + _normalized(text) + " "
    found = set()
    if any(x in t for x in (
        " PHILIPPINE IDENTIFICATION CARD ",
        " PAMBANSANG PAGKAKAKILANLAN ",
        " PHILSYS ",
        " PHILIPPINE IDENTIFICATION SYSTEM ",
    )):
        found.add("national_id")
    if " DRIVERS LICENSE " in t or " DRIVER LICENSE " in t or (
        " LAND TRANSPORTATION OFFICE " in t and " LICENSE " in t
    ):
        found.add("drivers_license")
    if " PASAPORTE " in t or " PASSPORT " in t:
        found.add("passport")
    if any(x in t for x in (
        " UNIFIED MULTI PURPOSE ID ",
        " SOCIAL SECURITY SYSTEM ",
        " PROFESSIONAL REGULATION COMMISSION ",
        " GOVERNMENT SERVICE INSURANCE SYSTEM ",
        " UMID ",
    )):
        found.add("other_government_id")
    return found


def assess_document_text(declared_type: str, ocr_text: str) -> dict:
    """Only a document-type consistency hint, NEVER an authenticity verdict."""
    if declared_type not in SUPPORTED:
        raise ValueError("Unsupported government ID type.")
    found = _document_signals(ocr_text)
    detected = next(iter(found)) if len(found) == 1 else None
    if len(found) > 1:
        status, warning = "inconclusive", "multiple_document_type_signals"
    elif detected is None:
        status, warning = "inconclusive", "document_type_not_recognized"
    elif detected != declared_type:
        status, warning = "mismatch", "selected_id_type_conflicts_with_ocr"
    else:
        status, warning = "text_consistent_unverified", ""
    return {
        "method": METHOD,
        "declaredIdType": declared_type,
        "detectedIdType": detected,
        "status": status,
        "authenticityVerified": False,
        "livenessVerified": False,
        "manualReviewRequired": True,
        "warningCodes": [warning] if warning else [],
    }


def document_ocr_unavailable(declared_type: str) -> dict:
    """Fail safely, never invent authenticity or silently accept a document."""
    return {
        "method": METHOD,
        "declaredIdType": declared_type if declared_type in SUPPORTED else None,
        "detectedIdType": None,
        "status": "inconclusive",
        "authenticityVerified": False,
        "livenessVerified": False,
        "manualReviewRequired": True,
        "warningCodes": ["ocr_unavailable"],
    }
