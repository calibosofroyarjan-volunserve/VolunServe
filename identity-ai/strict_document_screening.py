"""Privacy-safe Philippine government ID *document-type* recognition.

Tesseract text is processed transiently and is never returned here. This is
NOT an authenticity, QR-signature, name, or liveness verification service.
All results require independent LGU review. No sensitive OCR fields in output.
"""
from __future__ import annotations

import math
import re
import unicodedata

SUPPORTED = frozenset({
    "national_id", "drivers_license", "passport", "umid", "prc_id",
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
        "UNIFIED MULTI PURPOSE IDENTIFICATION",
        "UMID",
    )):
        found.add("umid")
    # A lone "PRC" or "professional" is too weak: those can appear
    # on unrelated documents, so require an issuer and card-type signal.
    pic = any(_contains(t, term) for term in (
        "PROFESSIONAL IDENTIFICATION CARD",
        "PROFESSIONAL ID CARD",
        "E PIC",
        "EPIC",
    ))
    issuer = any(_contains(t, term) for term in (
        "PROFESSIONAL REGULATION COMMISSION",
        "PRC",
    ))
    if issuer and pic:
        found.add("prc_id")
    return found


def _school_id_signal(text: str) -> bool:
    """Clear school-only ID labels must never count as government-ID evidence."""
    t = _normalized(text)
    return any(_contains(t, term) for term in (
        "SCHOOL ID",
        "STUDENT ID",
        "STUDENT IDENTIFICATION CARD",
        "STUDENT IDENTIFICATION",
        "STUDENT IDENTITY CARD",
        "STUDENT CARD",
        "SCHOOL IDENTIFICATION CARD",
        "UNIVERSITY ID",
        "COLLEGE ID",
        "CAMPUS ID",
        "LIBRARY CARD",
        "EMPLOYEE ID",
        "EMPLOYEE IDENTIFICATION CARD",
    ))


def assess_document_text(declared_type: str, ocr_text: str) -> dict:
    """Return strictly sanitized type screening, never an identity verdict."""
    if declared_type not in SUPPORTED:
        raise ValueError("Unsupported government ID type.")
    found = _document_signals(ocr_text)
    detected = next(iter(found)) if len(found) == 1 else None
    if _school_id_signal(ocr_text):
        # If a student/school card label appears, never let a government-ID
        # keyword elsewhere in the image override that clear conflict.
        status, warning = "unsupported", "school_id_not_supported"
        detected = None
    elif len(found) > 1:
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
        "imageQualityStatus": "unknown",
    }



# Conservative OCR-based orientation evidence; not a trained visual classifier.
# PSA describes the physical PhilID front as carrying a portrait, name and PCN,
# while its back carries additional demographics and machine-readable features.
# Do not use QR presence alone; OCR cannot read a QR reliably and digital /
# paper National IDs have a different layout.
FRONT_HEADING_MARKERS = {
    "national_id": (
        "PHILIPPINE IDENTIFICATION CARD", "PAMBANSANG PAGKAKAKILANLAN",
        "NATIONAL ID CARD", "NATIONAL ID IN PAPER", "DIGITAL NATIONAL ID",
        "EPHILID", "PHILID",
    ),
    "drivers_license": ("DRIVERS LICENSE", "DRIVER S LICENSE", "DRIVER LICENSE"),
    "umid": ("UNIFIED MULTI PURPOSE ID", "UNIFIED MULTI PURPOSE IDENTIFICATION"),
    "prc_id": ("PROFESSIONAL IDENTIFICATION CARD", "PROFESSIONAL ID CARD"),
}


def _front_heading_signal(declared_type: str, ocr_text: str) -> bool:
    if declared_type == "passport":
        return False  # Bio page only: no back is required.
    normalized = _normalized(ocr_text)
    return any(_contains(normalized, phrase) for phrase in
               FRONT_HEADING_MARKERS.get(declared_type, ()))


def _national_back_family_corrob(ocr_text: str) -> bool:
    """Two independent physical PhilID back label families; OCR clue only."""
    normalized = _normalized(ocr_text)
    back_families = (
        ("BLOOD TYPE", "URI NG DUGO"),
        ("MARITAL STATUS", "KATAYUANG SIBIL"),
        ("PLACE OF BIRTH", "LUGAR NG KAPANGANAKAN"),
        ("DATE OF ISSUE", "PETSA NG PAGKAKALABAS"),
    )
    count = sum(any(_contains(normalized, word) for word in family)
                for family in back_families)
    # These labels can appear on unrelated forms: never claim authenticity.
    return count >= 2


def _national_back_layout_signal(ocr_text: str) -> bool:
    """A likely reverse scan when a clearly front-facing title is absent.

    Orientation detection needs a stricter heuristic than reverse-side
    corroboration: a genuine back may repeat a PhilID title as well as
    actual reverse-side field labels.
    """
    return (_national_back_family_corrob(ocr_text)
            and not _front_heading_signal("national_id", ocr_text))


def _front_demographic_layout_signal(ocr_text: str) -> bool:
    """Strong personal-label layout supporting a front-side OCR heading.

    A back may repeat an issuer/title. Do not call it a duplicate front
    unless multiple portrait-side personal field labels are also visible.
    """
    normalized = _normalized(ocr_text)
    families = (
        ("SURNAME", "LAST NAME", "APELYIDO"),
        ("GIVEN NAMES", "GIVEN NAME", "FIRST NAME", "MGA PANGALAN"),
        ("DATE OF BIRTH", "BIRTH DATE", "PETSA NG KAPANGANAKAN"),
    )
    return sum(any(_contains(normalized, w) for w in family)
               for family in families) >= 2


def _orientation_warning(
    declared_type: str, front_text: str, back_text: str
) -> tuple[str, str] | None:
    """Fail closed on convincing reversed/repeated sides, not weak OCR guesses.

    Returned status/warning contain no names, numbers, OCR text or photos.
    Both sides are already type-screened by assess_document_sides().
    """
    if declared_type == "passport":
        return None
    front_heading = _front_heading_signal(declared_type, front_text)
    back_heading = _front_heading_signal(declared_type, back_text)
    if declared_type == "national_id":
        front_looks_back = _national_back_layout_signal(front_text)
        if front_looks_back and back_heading:
            return "mismatch", "document_front_back_swapped"
        if front_looks_back:
            return "inconclusive", "document_front_side_conflict"
    if back_heading and front_heading and _front_demographic_layout_signal(back_text):
        # A repeated title alone is weak: the reverse may legitimately repeat
        # issuer text. Require corroborating personal-field layout as well.
        return "inconclusive", "document_back_looks_like_front"
    if back_heading and not front_heading:
        # Likely reversal, but OCR of the actual front could be incomplete.
        return "inconclusive", "document_back_looks_like_front"
    return None


def assess_document_sides(
    declared_type: str,
    front_ocr_text: str,
    back_ocr_text: str | None,
) -> dict:
    """Screen front/back text without exposing text or claiming authenticity.

    A document-type keyword is not proof that a physical card is genuine or
    that two images belong to the same issued document.
    """
    front = assess_document_text(declared_type, front_ocr_text)
    result = dict(front)
    result["backSideProvided"] = back_ocr_text is not None
    result["backSideScreened"] = back_ocr_text is not None
    if back_ocr_text is None:
        if declared_type != "passport" and result["status"] not in ("unsupported", "mismatch"):
            result["status"] = "inconclusive"
            result["warningCodes"].append("document_back_required")
        return result

    back = assess_document_text(declared_type, back_ocr_text)
    if back["status"] == "unsupported":
        result["status"] = "unsupported"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["school_id_not_supported"]
        ))
    elif back["status"] == "mismatch" and result["status"] != "unsupported":
        result["status"] = "mismatch"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_back_type_conflict"]
        ))
    elif result["status"] == "inconclusive" and back["status"] == "text_consistent_unverified":
        # Back is recognizable but portrait-side ID type was not established.
        # Keep manual review; never turn a weak front into a clean result.
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_front_type_inconclusive"]
        ))
    # OCR having merely *run* on an arbitrary back image is not evidence that
    # the image belongs to the selected ID. Some genuine card backs lack issuer
    # text; this must be a rescan/manual-review result, NOT a positive precheck.
    # Physical PhilID backs can use corroborating independent layout labels.
    if (declared_type != "passport"
            and result["status"] == "text_consistent_unverified"
            and back["status"] == "inconclusive"
            and not (declared_type == "national_id"
                     and _national_back_family_corrob(back_ocr_text))):
        result["status"] = "inconclusive"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_back_evidence_inconclusive"]
        ))
    # Even a repeated National ID heading on the back cannot be treated as
    # successful orientation evidence without back-side layout corroboration.
    if (declared_type == "national_id"
            and result["status"] == "text_consistent_unverified"
            and not _national_back_family_corrob(back_ocr_text)):
        result["status"] = "inconclusive"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_back_layout_inconclusive"]
        ))
    if not back_ocr_text.strip():
        if result["status"] == "text_consistent_unverified":
            result["status"] = "inconclusive"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_back_ocr_inconclusive"]
        ))
    # Identical meaningful OCR on both sides strongly suggests a duplicate
    # capture. This is not a visual classifier or proof of two real card sides.
    front_normalized = _normalized(front_ocr_text)
    back_normalized = _normalized(back_ocr_text)
    if (declared_type != "passport" and len(front_normalized) >= 25
            and front_normalized == back_normalized
            and result["status"] not in ("unsupported", "mismatch")):
        result["status"] = "inconclusive"
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + ["document_duplicate_side_text"]
        ))
    # Orientation is checked after unsupported/wrong-ID classification so
    # a school ID can never be downgraded to harmless "inconclusive".
    orientation = _orientation_warning(declared_type, front_ocr_text, back_ocr_text)
    if orientation and result["status"] not in ("unsupported", "mismatch"):
        result["status"] = orientation[0]
        result["warningCodes"] = list(dict.fromkeys(
            result["warningCodes"] + [orientation[1]]
        ))
    result["authenticityVerified"] = False
    result["manualReviewRequired"] = True
    return result


def _safe_blur_status(blur_variance: float) -> str:
    """Do not mistake NaN or a missing quality reading for an adequate scan."""
    try:
        value = float(blur_variance)
    except (TypeError, ValueError, OverflowError):
        return "unknown"
    if not math.isfinite(value) or value < 0:
        return "unknown"
    return "low" if value < 40.0 else "adequate"


def add_photo_quality(screening: dict, blur_variance: float) -> dict:
    """Conservative front-image blur flag; never claims ID authenticity."""
    out = dict(screening)
    status = _safe_blur_status(blur_variance)
    out["imageQualityStatus"] = status
    if status != "adequate":
        reason = ("low_document_image_quality" if status == "low"
                  else "document_image_quality_unavailable")
        out["warningCodes"] = list(dict.fromkeys(
            out.get("warningCodes", []) + [reason]
        ))
        # A blurred/unmeasurable front should not appear as a successful
        # OCR precheck in Resident/Admin UI, even when a heading was read.
        # Preserve stronger unsupported/wrong-ID findings over quality hints.
        if out.get("status") == "text_consistent_unverified":
            out["status"] = "inconclusive"
    return out


def add_back_photo_quality(screening: dict, blur_variance: float | None) -> dict:
    """Independent reverse-side quality check; passport has no required back.

    OCR running does not mean the document side is legible. Unreadable back
    images must stay in manual review/rescan; never override school-ID or
    wrong-document evidence with a harmless blur diagnosis.
    """
    out = dict(screening)
    if out.get("declaredIdType") == "passport" or not out.get("backSideProvided"):
        out["backImageQualityStatus"] = "not_required" if out.get("declaredIdType") == "passport" else "not_checked"
        return out
    status = _safe_blur_status(blur_variance)
    out["backImageQualityStatus"] = status
    if status != "adequate":
        reason = ("low_document_back_image_quality" if status == "low"
                  else "document_back_image_quality_unavailable")
        out["warningCodes"] = list(dict.fromkeys(
            out.get("warningCodes", []) + [reason]
        ))
        if out.get("status") == "text_consistent_unverified":
            out["status"] = "inconclusive"
    return out


def blurry_national_id_claim_needs_review(declared_type: str, screening: dict) -> bool:
    """Prioritize a human rescan review, never government ID confirmation.

    A sharpness reading cannot tell if the blurry photograph is a real ID.
    We route only a user-selected National ID with NO conflicting labels.
    """
    warnings = screening.get("warningCodes") or []
    return (
        declared_type == "national_id"
        and screening.get("declaredIdType") == "national_id"
        and screening.get("imageQualityStatus") == "low"
        and "low_document_image_quality" in warnings
        and "ocr_unavailable" not in warnings
        and "school_id_not_supported" not in warnings
        and "document_front_side_conflict" not in warnings
        and "document_back_looks_like_front" not in warnings
        and "document_front_back_swapped" not in warnings
        and screening.get("status") in ("inconclusive", "text_consistent_unverified")
        and screening.get("detectedIdType") in (None, "national_id")
    )


def assess_profile_name(first_name: str, last_name: str, ocr_text: str) -> dict:
    """Conservative text-presence check against server-supplied account name.

    It cannot authenticate an ID or extract a reliable full legal name from
    arbitrary layouts. Missing tokens are inconclusive, never proof of fraud.
    Raw names and OCR strings are not returned.
    """
    first = [part for part in _normalized(first_name).split() if len(part) >= 3]
    last = [part for part in _normalized(last_name).split() if len(part) >= 3]
    if not first or not last:
        return {"profileNameCheck": "not_checked", "profileNameCompared": False}
    text = _normalized(ocr_text)
    matches = all(_contains(text, part) for part in first + last)
    return {
        "profileNameCheck": "possible_match" if matches else "inconclusive",
        "profileNameCompared": True,
    }
