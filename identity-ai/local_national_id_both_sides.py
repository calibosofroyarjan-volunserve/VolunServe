"""VolunServe National ID FRONT + BACK local-only type screening.

Uses the existing strict PhilID OCR evidence rules. Never authenticates a card,
proves ownership, compares QR signatures, verifies biometrics, accesses Firebase,
stores images, or changes a Resident's account. Do not use as automatic approval.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from local_national_id_type_only import (
    _safe_read_image, _strong_student_card_clues, classify_national_id_ocr,
)

MAX_BYTES = 10 * 1024 * 1024

def classify_pair_ocr(front_text: str, back_text: str) -> dict[str, object]:
    """Both sides must have sufficient independent format evidence.

    Clear other cards => unsupported. Weak, unreadable or conflicting cards
    => needs_review. In particular, a genuine-looking front alone never passes.
    """
    from strict_document_screening import (
        _document_signals, _national_back_family_corrob,
        assess_document_sides,
    )

    front = classify_national_id_ocr(front_text)
    back_label_found = _national_back_family_corrob(back_text)
    back_status = (
        "reverse_labels_observed" if back_label_found
        else "insufficient_reverse_labels"
    )

    # Positive SCHOOL / STUDENT evidence on EITHER side overrides
    # a National ID title elsewhere. Do not infer a school card from
    # a brand name, campus address or the word "school" alone.
    if _strong_student_card_clues(front_text) or _strong_student_card_clues(back_text):
        verdict, reason = "unsupported_other_card", "school_card_evidence"
        back_status = "other_card_evidence"
    else:
        front_types = _document_signals(front_text)
        back_types = _document_signals(back_text)
        different = (front_types | back_types) - {"national_id"}
        if different:
            if "national_id" in front_types or "national_id" in back_types:
                verdict, reason = "needs_review", "conflicting_document_types"
            else:
                verdict, reason = "unsupported_other_card", "other_id_evidence"
            back_status = "other_card_evidence" if back_types - {"national_id"} else back_status
        elif front["status"] != "national_id_format_candidate":
            verdict, reason = "needs_review", "front_national_id_not_established"
        elif not back_label_found:
            verdict, reason = "needs_review", "back_national_id_not_established"
        else:
            strict = assess_document_sides("national_id", front_text, back_text)
            if strict.get("status") == "text_consistent_unverified" and strict.get("warningCodes") == []:
                verdict, reason = "national_id_format_candidate", "both_sides_format_evidence"
            else:
                verdict, reason = "needs_review", "side_consistency_inconclusive"

    return {
        "status": verdict,
        "reason": reason,
        "front": (
            "national_id_heading_and_labels"
            if front["status"] == "national_id_format_candidate"
            else "not_confirmed"
        ),
        "back": back_status,
        "authenticityVerified": False,
        "samePhysicalCardVerified": False,
        "identityVerified": False,
        "profileVerified": False,
        "manualReviewRequired": True,
    }

def _enhanced_local_text(image_bytes: bytes, label: str) -> str:
    """Multi-region contrast OCR, local only. Never return OCR to UI."""
    import cv2
    import pytesseract
    import main as ai

    bgr = ai.decode_image(image_bytes, label)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    longest = max(gray.shape)
    if longest < 1800:
        factor = min(1.8, 1800.0 / longest)
        gray = cv2.resize(gray, None, fx=factor, fy=factor,
                          interpolation=cv2.INTER_CUBIC)
    enhanced = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8)).apply(gray)
    sharpened = cv2.addWeighted(
        enhanced, 1.6, cv2.GaussianBlur(enhanced, (0, 0), 1.1), -0.6, 0
    )
    chunks = [sharpened]
    half = max(1, sharpened.shape[0] // 2)
    chunks += [sharpened[:half], sharpened[half:]]
    return "\n".join(
        pytesseract.image_to_string(block, config=f"--psm {psm}")
        for block, psm in zip(chunks, (4, 6, 6))
    )

def screen_two_images(front_bytes: bytes, back_bytes: bytes) -> dict[str, object]:
    if any(not isinstance(v, bytes) or not 0 < len(v) <= MAX_BYTES
           for v in (front_bytes, back_bytes)):
        raise ValueError("invalid_photo_size")
    if hashlib.sha256(front_bytes).digest() == hashlib.sha256(back_bytes).digest():
        raise ValueError("front_and_back_same_photo")
    import main as ai
    first = ai.extract_government_id_text(front_bytes, "Local front photo")
    second = ai.extract_government_id_text(back_bytes, "Local back photo")
    initial = classify_pair_ocr(first, second)
    if initial["status"] != "needs_review":
        return initial

    # Additional OCR is diagnostic only; it cannot override already
    # recognized other-ID evidence or turn conflicting data into approval.
    try:
        extra_front = _enhanced_local_text(front_bytes, "Front text retry")
        extra_back = _enhanced_local_text(back_bytes, "Back text retry")
        combined = classify_pair_ocr(
            first + "\n" + extra_front,
            second + "\n" + extra_back,
        )
        return combined
    except Exception:
        return initial

def safe_report(outcome: dict) -> str:
    statuses = {
        "national_id_format_candidate": "NATIONAL ID FORMAT DETECTED — BOTH SIDES (UNVERIFIED)",
        "unsupported_other_card": "UNSUPPORTED — ONLY NATIONAL ID IS ACCEPTED",
        "needs_review": "NOT ACCEPTED — INCONCLUSIVE / MANUAL REVIEW",
    }
    fronts = {
        "national_id_heading_and_labels": "National ID title and front labels observed",
        "not_confirmed": "Not confirmed",
    }
    backs = {
        "reverse_labels_observed": "Multiple independent National ID back label families observed",
        "insufficient_reverse_labels": "Back label evidence insufficient",
        "other_card_evidence": "Different document-type clues found",
    }
    reasons = {
        "both_sides_format_evidence": "Front and back OCR clues consistent with National ID format",
        "school_card_evidence": "School/student ID text clues",
        "other_id_evidence": "Non-National-ID document text clues",
        "conflicting_document_types": "Contradictory ID type evidence",
        "front_national_id_not_established": "Front format unrecognized",
        "back_national_id_not_established": "Back format unrecognized",
        "side_consistency_inconclusive": "Front and back evidence contradictory or incomplete",
    }
    return "\n".join([
        "VOLUNSERVE | PRIVATE NATIONAL ID FRONT + BACK TYPE TEST",
        "No photo uploads or account changes",
        "",
        "Result: " + statuses.get(outcome.get("status"), statuses["needs_review"]),
        "FRONT: " + fronts.get(outcome.get("front"), "Not confirmed"),
        "BACK: " + backs.get(outcome.get("back"), "Not confirmed"),
        "Reason: " + reasons.get(outcome.get("reason"), "Needs human review"),
        "",
        "Date of birth: NOT REQUIRED",
        "Face/selfie detection: NOT RUN",
        "Government ID authenticity: NOT VERIFIED",
        "Same physical card/QR verification: NOT PERFORMED",
        "Resident status: UNCHANGED",
        "Admin approval: NOT SUBMITTED — MANUAL REVIEW REQUIRED",
    ])

def main() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("VolunServe | National ID FRONT + BACK — Local OCR Only")
    root.geometry("830x570")
    root.minsize(720, 500)
    root.configure(bg="#f5f8fb")
    photos: dict[str, str] = {}
    consent = tk.BooleanVar(value=False)
    labels = {side: tk.StringVar(value="No photo selected")
              for side in ("front", "back")}

    heading = tk.Frame(root, bg="#133b60", padx=22, pady=18)
    heading.pack(fill="x")
    tk.Label(heading, text="National ID — FRONT + BACK Recognition",
             bg="#133b60", fg="white",
             font=("Segoe UI", 17, "bold")).pack(anchor="w")
    tk.Label(heading, text="National ID only • both sides required • private local OCR • NO UPLOAD",
             bg="#133b60", fg="#e2ecf6",
             font=("Segoe UI", 10)).pack(anchor="w", pady=(4, 0))
    panel = tk.Frame(root, bg="#f5f8fb", padx=22, pady=18)
    panel.pack(fill="both", expand=True)
    tk.Label(panel, bg="#f5f8fb", fg="#975a16",
             text="This is document-format screening only. It cannot prove authenticity or identity.",
             font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 15))

    def choose(side: str) -> None:
        name = filedialog.askopenfilename(
            parent=root, title=f"Choose ID {side.upper()} photo locally",
            filetypes=[("Photo files", "*.jpg *.jpeg *.png *.webp")])
        if name:
            photos[side] = name
            labels[side].set("Selected locally (not uploaded)")
            result.delete("1.0", "end")
            result.insert("end", "Both sides must be selected before checking.")

    for side in ("front", "back"):
        item = tk.Frame(panel, bg="#f5f8fb")
        item.pack(fill="x", pady=6)
        tk.Label(item, text=f"{side.upper()} ID photo",
                 bg="#f5f8fb", width=19, anchor="w",
                 font=("Segoe UI", 11, "bold")).pack(side="left")
        ttk.Button(item, text="Choose photo",
                   command=lambda s=side: choose(s)).pack(side="left")
        tk.Label(item, textvariable=labels[side], bg="#f5f8fb",
                 fg="#13796e", font=("Segoe UI", 9)).pack(side="left", padx=12)

    ttk.Checkbutton(
        panel, variable=consent,
        text="I own these photos or have permission for local-only testing"
    ).pack(anchor="w", pady=(17, 13))
    result = tk.Text(panel, height=15, bg="white", fg="#183349",
                     wrap="word", font=("Consolas", 10))
    result.pack(fill="both", expand=True, pady=(0, 14))
    result.insert("end", "Choose FRONT and BACK photos. No birthday or selfie needed.")

    def run() -> None:
        if not consent.get():
            messagebox.showwarning("Consent", "Please confirm local-only processing.", parent=root)
            return
        if not all(k in photos for k in ("front", "back")):
            messagebox.showwarning("Missing photo", "Both FRONT and BACK are required.", parent=root)
            return
        run_button.configure(state="disabled")
        result.delete("1.0", "end")
        result.insert("end", "Checking both sides using local OCR...")
        root.update_idletasks()
        try:
            front = _safe_read_image(photos["front"])
            back = _safe_read_image(photos["back"])
            text = safe_report(screen_two_images(front, back))
        except ValueError:
            text = "NOT ACCEPTED — invalid or identical image inputs; select two distinct photos."
        except Exception:
            text = "INCONCLUSIVE — local OCR could not complete. Check Tesseract and photo quality."
        finally:
            run_button.configure(state="normal")
        result.delete("1.0", "end")
        result.insert("end", text)

    buttons = tk.Frame(panel, bg="#f5f8fb")
    buttons.pack(fill="x")
    run_button = ttk.Button(buttons, text="CHECK BOTH ID SIDES", command=run)
    run_button.pack(side="left")
    def clear() -> None:
        photos.clear()
        consent.set(False)
        for label in labels.values():
            label.set("No photo selected")
        result.delete("1.0", "end")
        result.insert("end", "Cleared. Photos and OCR text are never stored by this app.")
    ttk.Button(buttons, text="CLEAR", command=clear).pack(side="left", padx=12)
    tk.Label(panel, text="No live server, Firebase account approval, face matching or QR verification.",
             bg="#f5f8fb", fg="#64748b").pack(anchor="w", pady=(14, 0))
    root.mainloop()

if __name__ == "__main__":
    main()
