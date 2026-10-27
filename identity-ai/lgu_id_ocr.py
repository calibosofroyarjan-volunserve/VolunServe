"""VolunServe LGU government-ID OCR *consistency screen*.

Uses the Tesseract/Pillow already installed in identity-ai Docker. This is not
identity verification, biometric liveness, forgery detection, or issuer validation.
Never return OCR text, national ID numbers, birth dates or document photos.
"""
import re
from io import BytesIO

SUPPORTED = ("ph_national_id", "ph_drivers_license", "ph_passport")
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
KEYWORDS = {
    "ph_national_id": (
        "PAMBANSANG PAGKAKAKILANLAN",
        "PHILIPPINE IDENTIFICATION",
        "PHILSYS",
        "PHILIPPINE NATIONAL ID",
    ),
    "ph_drivers_license": (
        "DRIVER S LICENSE",
        "DRIVERS LICENSE",
        "LAND TRANSPORTATION OFFICE",
        "LTO DRIVER",
    ),
    "ph_passport": (
        "PASSPORT",
        "PASAPORTE",
        "PILIPINAS PASSPORT",
    ),
}
UNSUPPORTED = (
    "STUDENT ID",
    "SCHOOL ID",
    "UNIVERSITY ID",
    "COLLEGE ID",
    "EMPLOYEE ID",
    "COMPANY ID",
    "CORPORATE ID",
    "OFFICE ID",
)


def normalize_text(text):
    """Drop punctuation and private ID numbers before any document heuristics."""
    cleaned = re.sub(r"[^A-Z ]", " ", str(text or "").upper())
    return " ".join(cleaned.split())[:5000]


def classify_text(text, declared_type):
    """A non-authoritative human-review signal; rejects obvious wrong categories."""
    if declared_type not in SUPPORTED:
        return {"documentTypeSignal": "unsupported_declared_type",
                "decision": "manual_review_required"}
    observed = normalize_text(text)
    if any(marker in observed for marker in UNSUPPORTED):
        return {"documentTypeSignal": "unsupported_document_suspected",
                "decision": "manual_review_required"}
    present = [kind for kind, terms in KEYWORDS.items()
               if any(term in observed for term in terms)]
    if len(present) == 1 and present[0] == declared_type:
        signal = "declared_type_text_consistent"
    elif len(present) == 1 and present[0] != declared_type:
        signal = "declared_type_text_mismatch"
    else:
        signal = "document_type_inconclusive"
    return {"documentTypeSignal": signal,
            "decision": "manual_review_required"}


def recognize(image_bytes, *, label):
    if not isinstance(image_bytes, bytes) or not (1024 <= len(image_bytes) <= MAX_IMAGE_BYTES):
        raise ValueError("invalid_image_size")
    # Lazy import so CI can test text heuristics without installing heavy AI libs.
    from PIL import Image, ImageOps, ImageEnhance
    import pytesseract
    try:
        with Image.open(BytesIO(image_bytes)) as src:
            if src.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("unsupported_image_type")
            if src.width < 160 or src.height < 120 or src.width * src.height > MAX_IMAGE_PIXELS:
                raise ValueError("invalid_image_dimensions")
            image = ImageOps.exif_transpose(src).convert("L")
            image.thumbnail((1800, 1800))
            image = ImageEnhance.Contrast(image).enhance(1.7)
            # No raw OCR text should escape to logs, persistent media or clients.
            return pytesseract.image_to_string(image, config="--psm 6", timeout=12)
    except (OSError, OverflowError) as exc:
        raise ValueError("cannot_decode_document") from exc


def screen_document(front_bytes, back_bytes, declared_type):
    if declared_type not in SUPPORTED:
        return {"documentTypeSignal": "unsupported_declared_type",
                "ocrEngineAvailable": True, "decision": "manual_review_required"}
    if declared_type == "ph_passport" and back_bytes:
        return {"documentTypeSignal": "unexpected_passport_back",
                "ocrEngineAvailable": True, "decision": "manual_review_required"}
    if declared_type != "ph_passport" and not back_bytes:
        return {"documentTypeSignal": "missing_document_back",
                "ocrEngineAvailable": True, "decision": "manual_review_required"}
    try:
        front_text = recognize(front_bytes, label="front")
        # Analyze the reverse side's readability, but only the front determines
        # document type; back-side OCR can carry unrelated protected numbers.
        back_text = recognize(back_bytes, label="back") if back_bytes else ""
        # A front with copied government keywords cannot excuse a clearly
        # unrelated school/company ID on its reverse side.
        if any(marker in normalize_text(back_text) for marker in UNSUPPORTED):
            return {"documentTypeSignal": "unsupported_document_suspected",
                    "ocrEngineAvailable": True, "decision": "manual_review_required"}
    except (ValueError, RuntimeError, OSError, TimeoutError):
        return {"documentTypeSignal": "ocr_unavailable_or_unreadable",
                "ocrEngineAvailable": False, "decision": "manual_review_required"}
    except Exception:
        # Tesseract executable missing, not trained, or timed out.
        return {"documentTypeSignal": "ocr_unavailable_or_unreadable",
                "ocrEngineAvailable": False, "decision": "manual_review_required"}
    result = classify_text(front_text, declared_type)
    result["ocrEngineAvailable"] = True
    return result
