"""Privacy-safe Philippine government ID *document-type* recognition.

Tesseract text is processed transiently and is never returned here. This is
NOT an authenticity, QR-signature, name, or liveness verification service.
All results require independent LGU review. No sensitive OCR fields in output.
"""
from __future__ import annotations

import re
import unicodedata

SUPPORTED = frozenset({
    "national_id", "drivers_license", "passport", "other_government_id",
})
# Preserve backend's allowlisted method identifier for existing clients.
METHOD = "ph_government_id_ocr_keyword_screen_v1"


def _normalized(value: str) -> str:
    """Normalize OCR punctuation/accents, retaining only text for local comparison."""
    plain = unicodedata.normalize("NFKD", str(value or "")).upper()
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]+", " ", plain).strip()


def _contains(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def _national_id_signal(text: str) -> bool:
    """Recognize PhilID/National ID family, not any document mentioning PhilSys.

    Supports legacy PhilID wording and PSA's National ID Card, National ID
    in Paper and Digital National ID naming. Strong headings signal only
    a *possible format*. Weaker PhilSys/National ID text needs multiple
    personal-detail field labels to reduce brochure/advertisement false hits.
    """
    headings = (
        "PHILIPPINE IDENTIFICATION CARD",
        "PAMBANSANG PAGKAKAKILANLAN",
        "NATIONAL ID CARD",
        "NATIONAL ID IN PAPER",
        "DIGITAL NATIONAL ID",
        "EPHILID",
        "PHILID",
    )
    if any(_contains(text, heading) for heading in headings):
        return True

    context = (
        "PHILSYS",
        "PHILIPPINE IDENTIFICATION SYSTEM",
        "NATIONAL ID",
        "PHILIPPINE IDENTIFICATION",
    )
    if not any(_contains(text, term) for term in context):
        return False

    # Count different label *families*, not repeated words in a paragraph.
    demographic_labels = (
        ("APELYIDO", "SURNAME", "LAST NAME"),
        ("MGA PANGALAN", "GIVEN NAMES", "FIRST NAME"),
        ("PETSA NG KAPANGANAKAN", "DATE OF BIRTH", "BIRTH DATE"),
        ("LUGAR NG KAPANGANAKAN", "PLACE OF BIRTH"),
        ("NATIONAL ID CARD NUMBER", "PHILSYS CARD NUMBER", "PCN"),
    )
    corroborated = sum(
        any(_contains(text, term) for term in family)
        for family in demographic_labels
    )
    return corroborated >= 2


def _document_signals(text: str) -> set[str]:
    t = _normalized(text)
    found: set[str] = set()
    if _national_id_signal(t):
        found.add("national_id")
    if any(_contains(t, term) for term in (
        "DRIVERS LICENSE", "DRIVER S LICENSE", "DRIVER LICENSE",
    )) or (_contains(t, "LAND TRANSPORTATION OFFICE") and _contains(t, "LICENSE")):
        found.add("drivers_license")
    if any(_contains(t, term) for term in ("PASAPORTE", "PASSPORT")):
        found.add("passport")
    if any(_contains(t, term) for term in (
        "UNIFIED MULTI PURPOSE ID",
        "SOCIAL SECURITY SYSTEM",
        "PROFESSIONAL REGULATION COMMISSION",
        "GOVERNMENT SERVICE INSURANCE SYSTEM",
        "UMID",
    )):
        found.add("other_government_id")
    return found


def assess_document_text(declared_type: str, ocr_text: str) -> dict:
    """Return strictly sanitized type screening, never an identity verdict."""
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
    """Fail safely: never invent recognition or silently accept an ID."""
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
