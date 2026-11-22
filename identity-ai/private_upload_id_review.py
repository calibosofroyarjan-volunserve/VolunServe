"""VolunServe private upload-first National ID QA for defense preparation.

Local file PICKER only: no browser, Firebase, API, cloud upload, output image,
stored OCR text, identity status changes or actual Admin review submission.

Experimental SFace may produce an uncalibrated similarity observation. It
cannot identify a person, validate liveness or authenticate a government ID.
"""
from __future__ import annotations

import hashlib
import math
from datetime import date
from pathlib import Path
import re

MAX_BYTES = 10 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAGIC = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF")
SAFE_REVIEW_FLAGS = re.compile(r"^[a-z_]{1,72}$")
ALLOWED_CHECKS = {"not_checked", "possible_match", "possible_conflict",
                  "inconclusive", "conflict"}

def _read_local_photo(path: str) -> bytes:
    """Validate a single consented local photo without logging its pathname."""
    if not path:
        raise ValueError("missing_photo")
    p = Path(path)
    if p.suffix.lower() not in IMAGE_EXTENSIONS or not p.is_file():
        raise ValueError("invalid_photo_type")
    if not 0 < p.stat().st_size <= MAX_BYTES:
        raise ValueError("invalid_photo_size")
    data = p.read_bytes()
    if (len(data) != p.stat().st_size or
            not (data.startswith(MAGIC[0]) or data.startswith(MAGIC[1]) or
                 (data.startswith(MAGIC[2]) and data[8:12] == b"WEBP"))):
        raise ValueError("invalid_photo_content")
    return data

def _safe_check(value: object) -> str:
    return value if isinstance(value, str) and value in ALLOWED_CHECKS else "inconclusive"

def _safe_flags(value: object) -> list[str]:
    if not isinstance(value, list):
        return ["screening_result_invalid"]
    return [flag for flag in value[:20]
            if isinstance(flag, str) and SAFE_REVIEW_FLAGS.fullmatch(flag)]

def _valid_reference_date(value: str) -> bool:
    if not value:
        return True
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True

def _extra_ocr_diagnostic(front_bytes, back_bytes, expected_dob):
    """Local-only second OCR pass; diagnostics never modify approval status."""
    import cv2
    import pytesseract
    import main as ai
    from strict_document_screening import _national_back_family_corrob
    from profile_consistency import assess_profile_birth_date

    def read(data, label):
        photo = ai.decode_image(data, label)
        gray = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
        if max(gray.shape) < 2000:
            factor = min(2.0, 2000.0 / max(gray.shape))
            gray = cv2.resize(gray, None, fx=factor, fy=factor,
                              interpolation=cv2.INTER_CUBIC)
        enhanced = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
        return (pytesseract.image_to_string(enhanced, config="--psm 4") + "\n"
                + pytesseract.image_to_string(enhanced, config="--psm 11"))

    front = read(front_bytes, "Local front OCR diagnostic")
    back = read(back_bytes, "Local back OCR diagnostic")
    return {
        "back": ("extra_label_clues_observed"
                 if _national_back_family_corrob(back) else "still_inconclusive"),
        "dob": assess_profile_birth_date(expected_dob, front + "\n" + back)[
            "profileBirthDateCheck"],
    }

def evaluate_private_uploads(
    front_bytes: bytes,
    back_bytes: bytes,
    *,
    selfie_bytes: bytes | None = None,
    reference_first: str = "",
    reference_last: str = "",
    reference_dob: str = "",
    sface_opt_in: bool = False,
) -> dict:
    """Pure in-memory orchestration over existing strict OCR/SFace code.

    Reference values are typed manually for demonstration; they are NOT
    fetched from or compared to an authenticated Firebase profile.
    """
    images = [front_bytes, back_bytes]
    if selfie_bytes is not None:
        images.append(selfie_bytes)
    if any(not isinstance(x, bytes) or not 0 < len(x) <= MAX_BYTES for x in images):
        raise ValueError("invalid_image_size")
    if len({hashlib.sha256(x).digest() for x in images}) != len(images):
        raise ValueError("duplicate_image_capture")
    if not _valid_reference_date(reference_dob):
        raise ValueError("date_must_be_yyyy_mm_dd")
    if bool(reference_first.strip()) != bool(reference_last.strip()):
        raise ValueError("provide_both_reference_names")
    if sface_opt_in and selfie_bytes is None:
        raise ValueError("selfie_required_for_face_research")

    # Import after consent and local file selection; no network operations.
    import main as identity_ai
    screening = identity_ai.screen_government_id(
        declared_type="national_id",
        id_document_bytes=front_bytes,
        id_back_document_bytes=back_bytes,
        expected_first_name=reference_first.strip(),
        expected_last_name=reference_last.strip(),
        expected_date_of_birth=reference_dob,
        expected_barangay="",
    )
    if not isinstance(screening, dict):
        raise ValueError("screening_unavailable")

    result = {
        "document": (
            "national_id_text_candidate"
            if (screening.get("detectedIdType") == "national_id" and
                screening.get("status") == "text_consistent_unverified" and
                screening.get("warningCodes") == [])
            else "inconclusive_requires_review"
        ),
        "ocr_status": str(screening.get("status"))
        if screening.get("status") in {
            "text_consistent_unverified", "inconclusive", "mismatch",
            "unsupported", "failed"
        } else "inconclusive",
        "front_quality": (
            screening.get("imageQualityStatus")
            if screening.get("imageQualityStatus") in {"adequate", "low", "unknown"}
            else "unknown"
        ),
        "back_quality": (
            screening.get("backImageQualityStatus")
            if screening.get("backImageQualityStatus") in {"adequate", "low", "unknown", "not_checked"}
            else "unknown"
        ),
        "name": _safe_check(screening.get("profileNameCheck")),
        "dob": _safe_check(screening.get("profileBirthDateCheck")),
        "warnings": _safe_flags(screening.get("warningCodes")),
        "face": "not_requested",
        "face_score": None,
        "admin": "manual_review_required_NOT_SUBMITTED",
        "identity_verified": False,
        "issuer_authenticity_verified": False,
        "liveness_validated": False,
        "extra_back_ocr": "not_needed",
        "extra_dob_ocr": "not_needed",
    }

    if result["ocr_status"] == "inconclusive" or result["dob"] == "inconclusive":
        try:
            diagnostic = _extra_ocr_diagnostic(front_bytes, back_bytes, reference_dob)
            result["extra_back_ocr"] = diagnostic["back"]
            result["extra_dob_ocr"] = _safe_check(diagnostic["dob"])
        except Exception:
            result["extra_back_ocr"] = "unavailable"
            result["extra_dob_ocr"] = "unavailable"

    # Research may be run independently of OCR success; unlike account-level
    # face verification it never decides PASS/FAIL or changes profile status.
    if sface_opt_in and selfie_bytes is not None:
        import os
        old_setting = os.environ.get("VOLUNSERVE_SFACE_SHADOW")
        try:
            os.environ["VOLUNSERVE_SFACE_SHADOW"] = "1"
            import sface_shadow
            first_image = identity_ai.decode_image(front_bytes, "ID front research")
            second_image = identity_ai.decode_image(selfie_bytes, "Selfie research")
            face_result = sface_shadow.assess_pair_shadow(first_image, second_image)
            if not isinstance(face_result, dict):
                face_result = {}
            face_status = face_result.get("status")
            if face_status == "similarity_observed_unvalidated":
                score = face_result.get("cosineSimilarity")
                if (isinstance(score, (int, float)) and not isinstance(score, bool)
                        and math.isfinite(score) and -1 <= score <= 1):
                    result["face"] = "similarity_observed_unvalidated"
                    result["face_score"] = round(float(score), 5)
                else:
                    result["face"] = "inconclusive"
            elif face_status in {"unavailable", "disabled", "inconclusive"}:
                result["face"] = face_status
            else:
                result["face"] = "inconclusive"
        except Exception:
            result["face"] = "inconclusive"
        finally:
            if old_setting is None:
                os.environ.pop("VOLUNSERVE_SFACE_SHADOW", None)
            else:
                os.environ["VOLUNSERVE_SFACE_SHADOW"] = old_setting
    return result

def safe_report(value: dict) -> str:
    """Print statuses only, never OCR text, names, DOB or image paths."""
    flags = ", ".join(value.get("warnings") or []) or "none"
    score = value.get("face_score")
    face_score = (f" (uncalibrated cosine: {score:.5f})"
                  if type(score) is float else "")
    return "\n".join([
        "VOLUNSERVE — PRIVATE NATIONAL ID UPLOAD LAB",
        "TEST ONLY · no upload · no user account changes",
        "",
        "Front + back document OCR: " + value["ocr_status"],
        "National ID document clues: " + value["document"],
        "Front image quality: " + value["front_quality"],
        "Back image quality: " + value["back_quality"],
        "Manual-reference first/last name: " + value["name"],
        "Manual-reference birthdate: " + value["dob"],
        "Review flags: " + flags,
        "Additional back OCR clues: " + value.get("extra_back_ocr", "not_needed"),
        "Additional birthdate OCR clue: " + value.get("extra_dob_ocr", "not_needed"),
        "Optional ID portrait vs selfie SFace: " + value["face"] + face_score,
        "",
        "Admin step: PENDING HUMAN REVIEW (DEMO ONLY — NOT SUBMITTED)",
        "Government ID authenticity: NOT VERIFIED",
        "Liveness/PAD: NOT VALIDATED",
        "Resident identity status: UNCHANGED",
        "Research similarity is not same-person identification.",
    ])

def main() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("VolunServe | Private National ID Upload Review — Local Only")
    root.geometry("805x730")
    root.minsize(700, 620)
    root.configure(bg="#f4f7fb")
    chosen: dict[str, str] = {}
    labels: dict[str, tk.StringVar] = {}
    consent = tk.BooleanVar(value=False)
    allow_face = tk.BooleanVar(value=False)

    header = tk.Frame(root, bg="#113861", padx=20, pady=18)
    header.pack(fill="x")
    tk.Label(header, text="National ID + Selfie | Private Upload Lab",
             font=("Segoe UI", 17, "bold"), bg="#113861", fg="white").pack(anchor="w")
    tk.Label(header,
             text="Local file picker · OCR front/back · optional experimental SFace · NO UPLOAD",
             font=("Segoe UI", 10), bg="#113861", fg="#d9eafa").pack(anchor="w", pady=(5, 0))
    body = tk.Frame(root, bg="#f4f7fb", padx=20, pady=15)
    body.pack(fill="both", expand=True)
    tk.Label(body,
             text="For authorized research only. This does not authenticate an ID or verify a Resident.",
             font=("Segoe UI", 10), bg="#f4f7fb", fg="#835015").pack(anchor="w", pady=(0, 12))

    def pick(slot: str) -> None:
        file_path = filedialog.askopenfilename(
            parent=root, title=f"Choose {slot.replace('_', ' ')} photo locally",
            filetypes=[("Photo", "*.jpg *.jpeg *.png *.webp")])
        if file_path:
            chosen[slot] = file_path
            labels[slot].set("Selected locally (not uploaded)")
            result_box.delete("1.0", "end")
            result_box.insert("end", "Photos selected. Run review after checking consent.")

    for slot, heading in [
        ("front", "1. National ID FRONT"),
        ("back", "2. National ID BACK"),
        ("selfie", "3. Selfie photo (optional — SFace research only)"),
    ]:
        row = tk.Frame(body, bg="#f4f7fb")
        row.pack(fill="x", pady=4)
        tk.Label(row, text=heading, width=42, anchor="w",
                 font=("Segoe UI", 10, "bold"), bg="#f4f7fb").pack(side="left")
        ttk.Button(row, text="Choose photo", command=lambda k=slot: pick(k)).pack(side="left")
        labels[slot] = tk.StringVar(value="Not selected")
        tk.Label(row, textvariable=labels[slot], bg="#f4f7fb",
                 fg="#287a6b", font=("Segoe UI", 9)).pack(side="left", padx=12)

    tk.Label(body, text="Optional local reference values — NOT fetched from Firebase profile",
             bg="#f4f7fb", fg="#334155", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(14, 7))
    fields = tk.Frame(body, bg="#f4f7fb")
    fields.pack(fill="x")
    entries: dict[str, ttk.Entry] = {}
    for col, field, desc in [
        (0, "first", "First name"), (1, "last", "Last name"),
        (2, "dob", "Birth date (YYYY-MM-DD)"),
    ]:
        column = tk.Frame(fields, bg="#f4f7fb")
        column.grid(row=0, column=col, sticky="ew", padx=(0, 12))
        tk.Label(column, text=desc, bg="#f4f7fb", font=("Segoe UI", 9)).pack(anchor="w")
        entries[field] = ttk.Entry(column, width=24)
        entries[field].pack(fill="x", pady=4)
        fields.columnconfigure(col, weight=1)

    ttk.Checkbutton(body, text="I own these photos or have explicit permission for local-only testing",
                    variable=consent).pack(anchor="w", pady=(15, 4))
    ttk.Checkbutton(body, text="Optional: I consent to experimental SFace photo comparison (not verification)",
                    variable=allow_face).pack(anchor="w")

    result_box = tk.Text(body, height=14, wrap="word",
                         font=("Consolas", 9), bg="white", fg="#193145")
    result_box.pack(fill="both", expand=True, pady=(14, 10))
    result_box.insert("end", "Choose front and back JPG/PNG/WebP photos. No images will be uploaded.")

    def run_review() -> None:
        if not consent.get():
            messagebox.showwarning("Consent required",
                "Confirm permission for local-only processing.", parent=root)
            return
        if "front" not in chosen or "back" not in chosen:
            messagebox.showwarning("Missing photo", "Choose FRONT and BACK first.", parent=root)
            return
        if allow_face.get() and "selfie" not in chosen:
            messagebox.showwarning("Missing selfie", "Select a selfie or disable SFace.", parent=root)
            return
        run_button.config(state="disabled")
        result_box.delete("1.0", "end")
        result_box.insert("end", "Reading selected photos in memory; no network calls...")
        root.update_idletasks()
        try:
            front = _read_local_photo(chosen["front"])
            back = _read_local_photo(chosen["back"])
            selfie = _read_local_photo(chosen["selfie"]) if allow_face.get() else None
            reviewed = evaluate_private_uploads(
                front, back, selfie_bytes=selfie,
                reference_first=entries["first"].get(),
                reference_last=entries["last"].get(),
                reference_dob=entries["dob"].get(),
                sface_opt_in=allow_face.get())
            report = safe_report(reviewed)
        except ValueError as exc:
            # These are fixed error codes from this file; don't echo path/PII.
            code = str(exc)
            report = ("LOCAL REVIEW BLOCKED: " + code if re.fullmatch(r"[a-z_]{1,72}", code)
                      else "LOCAL REVIEW BLOCKED: invalid_input")
        except Exception as exc:
            report = "LOCAL REVIEW INCONCLUSIVE: " + type(exc).__name__
            report += "\nCheck OCR libraries, image readability, and optional model files."
        finally:
            run_button.config(state="normal")
        result_box.delete("1.0", "end")
        result_box.insert("end", report)

    actions = tk.Frame(body, bg="#f4f7fb")
    actions.pack(fill="x")
    run_button = ttk.Button(actions, text="RUN LOCAL OCR + OPTIONAL FACE RESEARCH", command=run_review)
    run_button.pack(side="left")
    def clear() -> None:
        chosen.clear()
        for state in labels.values():
            state.set("Not selected")
        for entry in entries.values():
            entry.delete(0, "end")
        consent.set(False)
        allow_face.set(False)
        result_box.delete("1.0", "end")
        result_box.insert("end", "Cleared. No photos or OCR text were saved by this application.")
    ttk.Button(actions, text="CLEAR LOCAL SELECTIONS", command=clear).pack(side="left", padx=12)

    tk.Label(body, bg="#f4f7fb", fg="#64748b",
             text="Admin review is shown as a DEMO status; no Firebase/Render submission or Verified Resident grant.").pack(
                 anchor="w", pady=(12, 0))
    root.mainloop()

if __name__ == "__main__":
    main()
