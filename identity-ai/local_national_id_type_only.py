"""Offline Philippine National ID type-only OCR lab.

For testing ONLY. This checks text/layout clues, not government issuance,
photo authenticity, document security, owner identity, QR, or biometrics.
No Firebase, network, account writes, image saving, or personal-data logging.
"""
from __future__ import annotations

from pathlib import Path

MAX_IMAGE_BYTES = 10 * 1024 * 1024

# Non-sensitive printed labels observed on physical PhilID layouts.
# Do not add or distribute any user's actual ID photo, QR or numbers.
_NATIONAL_HEADINGS = (
    "PAMBANSANG PAGKAKAKILANLAN",
    "PHILIPPINE IDENTIFICATION CARD",
    "NATIONAL ID CARD",
    "NATIONAL ID IN PAPER",
    "DIGITAL NATIONAL ID",
    "EPHILID",
)
_FRONT_LABEL_FAMILIES = (
    ("APELYIDO", "LAST NAME", "SURNAME"),
    ("MGA PANGALAN", "GIVEN NAMES", "GIVEN NAME", "FIRST NAME"),
    ("GITNANG APELYIDO", "MIDDLE NAME"),
    ("PETSA NG KAPANGANAKAN", "DATE OF BIRTH", "BIRTH DATE"),
    ("TIRAHAN", "ADDRESS"),
)

def _strong_student_card_clues(ocr_text: str) -> bool:
    """Recognize school-ID OCR variants without rejecting on SCHOOL alone.

    Requires clear institutional/student AND card/ID clues. A lone school
    name, campus, grade, or the word STUDENT is insufficient evidence.
    """
    from strict_document_screening import _contains, _normalized, _school_id_signal
    if _school_id_signal(ocr_text):
        return True
    text = _normalized(ocr_text)
    student = any(_contains(text, term) for term in (
        "STUDENT", "LEARNER", "PUPIL", "ESTUDYANTE",
    ))
    institution = any(_contains(text, term) for term in (
        "SCHOOL", "UNIVERSITY", "COLLEGE", "ACADEMY", "CAMPUS",
        "INSTITUTE", "ELEMENTARY", "HIGH SCHOOL",
    ))
    card = any(_contains(text, term) for term in (
        "ID", "I D", "IDENTIFICATION", "IDENTITY CARD", "STUDENT NUMBER",
        "STUDENT NO", "LEARNER REFERENCE NUMBER", "CARD",
    ))
    # Strong STUDENT + institutional issuer is common even if OCR misses ID.
    # STUDENT + ID/CARD is likewise a strong explicit school-card clue.
    return student and (institution or card)

def classify_national_id_ocr(front_text: str) -> dict:
    """Type screening only. A positive result is never identity verification.

    'unsupported_other_card' requires positive evidence of another ID type;
    illegible, unlabeled or contradictory material remains needs_review.
    """
    from strict_document_screening import (
        _contains, _normalized, _document_signals,
    )

    text = _normalized(front_text)
    found = _document_signals(front_text)
    other = found - {"national_id"}

    # A school/employee/library card, passport, driver's licence, UMID or PRC
    # cannot satisfy the National ID-only rule just by mentioning "PhilSys".
    if _strong_student_card_clues(front_text) or (other and "national_id" not in found):
        outcome, reason = "unsupported_other_card", "other_id_detected"
    elif other:
        outcome, reason = "needs_review", "conflicting_id_clues"
    else:
        headings = sum(_contains(text, item) for item in _NATIONAL_HEADINGS)
        corroborated = sum(
            any(_contains(text, label) for label in family)
            for family in _FRONT_LABEL_FAMILIES
        )
        if "national_id" in found and headings >= 1 and corroborated >= 2:
            outcome, reason = "national_id_format_candidate", "heading_and_front_labels"
        else:
            outcome, reason = "needs_review", "insufficient_readable_id_clues"

    return {
        "status": outcome,
        "reason": reason,
        "declaredIdType": "national_id",
        "authenticityVerified": False,
        "identityVerified": False,
        "profileVerified": False,
        "manualReviewRequired": True,
    }

def _safe_read_image(path: str) -> bytes:
    """Local-only image selection with size and signature checks."""
    p = Path(path)
    if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"} or not p.is_file():
        raise ValueError("photo_format_invalid")
    if not 0 < p.stat().st_size <= MAX_IMAGE_BYTES:
        raise ValueError("photo_size_invalid")
    content = p.read_bytes()
    if not (
        content.startswith(b"\xff\xd8\xff")
        or content.startswith(b"\x89PNG\r\n\x1a\n")
        or (content.startswith(b"RIFF") and content[8:12] == b"WEBP")
    ):
        raise ValueError("photo_data_invalid")
    return content

def screen_photo_type(image_bytes: bytes) -> dict:
    """Existing Tesseract OCR with a local contrast-enhanced retry.

    Retries ONLY for uncertain text. An unsupported ID type is never
    overridden by a second OCR pass. No OCR text leaves this function.
    """
    if not isinstance(image_bytes, bytes) or not 0 < len(image_bytes) <= MAX_IMAGE_BYTES:
        raise ValueError("photo_size_invalid")

    import main as ai
    initial_text = ai.extract_government_id_text(image_bytes, "Local front photo")
    first = classify_national_id_ocr(initial_text)
    if first["status"] != "needs_review":
        return first

    import cv2
    import pytesseract
    img = ai.decode_image(image_bytes, "Local OCR contrast retry")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if max(gray.shape) < 2000:
        factor = min(1.8, 2000.0 / max(gray.shape))
        gray = cv2.resize(gray, None, fx=factor, fy=factor,
                          interpolation=cv2.INTER_CUBIC)
    contrasted = cv2.createCLAHE(
        clipLimit=2.4, tileGridSize=(8, 8)).apply(gray)
    sharpened = cv2.addWeighted(
        contrasted, 1.6, cv2.GaussianBlur(contrasted, (0, 0), 1.1), -0.6, 0)
    extra_text = (
        pytesseract.image_to_string(sharpened, config="--psm 4")
        + "\n" + pytesseract.image_to_string(sharpened, config="--psm 11")
    )
    combined = initial_text + "\n" + extra_text
    second = classify_national_id_ocr(combined)
    if second["status"] != "needs_review":
        return second

    # Third local OCR attempt: separate title/issuer and ID-body text regions.
    # A large portrait or colorful card background may confuse whole-card OCR.
    # No image is saved, and weak/ambiguous reads still stay INCONCLUSIVE.
    h = sharpened.shape[0]
    split = max(1, int(h * 0.55))
    regions = (sharpened[:split], sharpened[h - split:])
    try:
        retry_text = "\n".join(
            pytesseract.image_to_string(region, config="--psm 6")
            for region in regions
        )
        return classify_national_id_ocr(combined + "\n" + retry_text)
    except Exception:
        return second

def report_safe(value: dict) -> str:
    """Output only allowlisted statuses; never personal information."""
    status = value.get("status")
    reason = value.get("reason")
    allowed_statuses = {
        "national_id_format_candidate": "NATIONAL ID FORMAT DETECTED (UNVERIFIED)",
        "unsupported_other_card": "UNSUPPORTED: ONLY NATIONAL ID IS ALLOWED",
        "needs_review": "INCONCLUSIVE: RESCAN OR HUMAN REVIEW",
    }
    allowed_reasons = {
        "heading_and_front_labels": "National ID heading and multiple field labels recognized",
        "other_id_detected": "Text suggests a different type of card",
        "conflicting_id_clues": "Conflicting document-type labels",
        "insufficient_readable_id_clues": "Insufficient National ID heading/label evidence",
    }
    return "\n".join([
        "VOLUNSERVE — NATIONAL ID ONLY / PRIVATE OCR LAB",
        "",
        "Document type: " + allowed_statuses.get(status, "INCONCLUSIVE"),
        "Reason: " + allowed_reasons.get(reason, "Not established"),
        "",
        "Other recognized card types: NOT ALLOWED",
        "Birthdate/profile comparison: NOT REQUIRED IN THIS MODE",
        "Selfie/face matching: NOT RUN IN THIS MODE",
        "Government-issued authenticity: NOT VERIFIED",
        "Resident account: UNCHANGED",
        "Admin decision: NOT SUBMITTED — human review required",
        "Research-only format detection is NOT identity verification.",
        "No photos or raw OCR text were saved or uploaded.",
    ])

def main() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("VolunServe | NATIONAL ID ONLY — Private OCR Test")
    root.geometry("750x525")
    root.minsize(680, 460)
    root.configure(bg="#f5f8fb")
    photo: dict[str, str] = {}
    consent = tk.BooleanVar(value=False)

    header = tk.Frame(root, bg="#153b63", padx=20, pady=18)
    header.pack(fill="x")
    tk.Label(header, text="Philippine National ID — Type Check",
             font=("Segoe UI", 18, "bold"), bg="#153b63",
             fg="white").pack(anchor="w")
    tk.Label(header, text="Test a National ID or another card type · front photo only · no selfie",
             bg="#153b63", fg="#e5effc", font=("Segoe UI", 10)).pack(
                 anchor="w", pady=(5, 0))

    body = tk.Frame(root, bg="#f5f8fb", padx=20, pady=17)
    body.pack(fill="both", expand=True)
    tk.Label(body,
             text="OCR checks whether the photo resembles a National ID format. It cannot certify authenticity.",
             wraplength=680, justify="left", bg="#f5f8fb", fg="#8a5b21",
             font=("Segoe UI", 10)).pack(anchor="w")

    row = tk.Frame(body, bg="#f5f8fb")
    row.pack(fill="x", pady=(18, 14))
    tk.Label(row, text="ID card FRONT photo", width=25,
             font=("Segoe UI", 11, "bold"), bg="#f5f8fb").pack(side="left")
    status = tk.StringVar(value="No photo selected")

    def choose() -> None:
        selected = filedialog.askopenfilename(
            parent=root, title="Choose a consented ID card FRONT photo locally",
            filetypes=[("Images", "*.jpg *.jpeg *.png *.webp")])
        if selected:
            photo["front"] = selected
            status.set("Selected locally (not uploaded)")
            output.delete("1.0", "end")
            output.insert("end", "Photo selected. Consent and press CHECK NATIONAL ID TYPE.")

    ttk.Button(row, text="Choose photo", command=choose).pack(side="left")
    tk.Label(row, textvariable=status, bg="#f5f8fb",
             fg="#067567", font=("Segoe UI", 9)).pack(side="left", padx=10)
    ttk.Checkbutton(body,
        text="I own this photo or have permission for local-only research processing",
        variable=consent).pack(anchor="w", pady=(0, 15))

    output = tk.Text(body, font=("Consolas", 10), wrap="word", height=14,
                     bg="white", fg="#123047")
    output.pack(fill="both", expand=True, pady=(0, 12))
    output.insert("end", "Choose any consented ID card FRONT photo to test National ID-only screening.")

    def scan() -> None:
        if not consent.get():
            messagebox.showwarning("Consent needed",
                "Confirm permission for local-only OCR testing.", parent=root)
            return
        if "front" not in photo:
            messagebox.showwarning("Missing photo",
                "Choose an ID card FRONT photo first.", parent=root)
            return
        run_button.config(state="disabled")
        output.delete("1.0", "end")
        output.insert("end", "Reading local image... no upload.")
        root.update_idletasks()
        try:
            result = screen_photo_type(_safe_read_image(photo["front"]))
            message = report_safe(result)
        except ValueError as error:
            code = str(error)
            known = {"photo_format_invalid", "photo_size_invalid",
                     "photo_data_invalid"}
            message = "INCONCLUSIVE: " + (code if code in known else "invalid_photo")
        except Exception:
            message = "INCONCLUSIVE: local OCR failed; check Tesseract and image quality."
        finally:
            run_button.config(state="normal")
        output.delete("1.0", "end")
        output.insert("end", message)

    actions = tk.Frame(body, bg="#f5f8fb")
    actions.pack(fill="x")
    run_button = ttk.Button(actions, text="CHECK NATIONAL ID TYPE", command=scan)
    run_button.pack(side="left")
    def clear() -> None:
        photo.clear()
        consent.set(False)
        status.set("No photo selected")
        output.delete("1.0", "end")
        output.insert("end", "Cleared local selection; no files were saved.")
    ttk.Button(actions, text="CLEAR", command=clear).pack(side="left", padx=12)
    tk.Label(body, text="National ID format candidate ≠ genuine document or Verified Resident account.",
             bg="#f5f8fb", fg="#64748b").pack(anchor="w", pady=(12, 0))
    root.mainloop()

if __name__ == "__main__":
    main()
