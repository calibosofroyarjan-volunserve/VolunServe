"""VolunServe PRIVATE local PhilID/selfie review (experimental, no upload).

This is intentionally not a verification endpoint and cannot update user roles.
Real identity verification requires independently reviewed documents, liveness,
privacy controls, and an authorized admin. Images live in process memory only;
operator-selected source files remain wherever the operator already stored them.
"""
from __future__ import annotations

import math
from pathlib import Path

MAX_IMAGE_BYTES = 10 * 1024 * 1024
SUPPORTED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def read_selected_image(path: str) -> bytes:
    """Bound local input and reject symlinks; does not modify the source file."""
    p = Path(path)
    if p.is_symlink() or not p.is_file() or p.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError("Choose a local JPG, PNG, or WebP image (not a link).")
    if not 0 < p.stat().st_size <= MAX_IMAGE_BYTES:
        raise ValueError("Image must be nonempty and at most 10 MB.")
    data = p.read_bytes()
    if not 0 < len(data) <= MAX_IMAGE_BYTES:
        raise ValueError("Invalid image size.")
    # Image magic is validated later by AI decode_image, not by extension alone.
    return data


def safe_summary(screening: dict, comparison: dict | None = None) -> str:
    """UI-only summary. Never includes OCR text, PII, images or assertions of identity."""
    s = screening if isinstance(screening, dict) else {}
    c = comparison if isinstance(comparison, dict) else {}
    warnings = s.get("warningCodes")
    warnings = warnings if isinstance(warnings, list) else ["unknown_document_readiness"]
    warning_names = ", ".join(x for x in warnings if isinstance(x, str) and x) or "none"
    kind = s.get("detectedIdType")
    kind_text = "National ID candidate" if kind == "national_id" else "not established"
    status = s.get("status", "inconclusive")
    quality = s.get("imageQualityStatus", "unknown")
    back_quality = s.get("backImageQualityStatus", "unknown")
    face_text = "Not performed: ID-side OCR / image precheck not complete."
    if c:
        if c.get("status") == "failed":
            face_text = "Image or face detection needs retry; no identity decision."
        elif c.get("decision") == "manual_review":
            face_text = "Experimental comparison performed; independent manual review required."
        else:
            face_text = "Inconclusive; independent manual review required."
    score = c.get("matchScore")
    if c and isinstance(score, (int, float)) and not isinstance(score, bool) and math.isfinite(score):
        face_text += " (Uncalibrated similarity score: {:.3f})".format(score)
    return "\n".join((
        "PRIVATE LOCAL EXPERIMENT — NOT VERIFIED IDENTITY",
        "Document: " + kind_text,
        "OCR/type screening: " + str(status),
        "Front image quality: " + str(quality),
        "Back image quality: " + str(back_quality),
        "Review flags: " + warning_names,
        "ID photo versus selfie: " + face_text,
        "Government issuance: NOT independently verified",
        "Anti-spoof/liveness: NOT validated",
        "Account action: NONE; manual Admin review still required",
        "Images are not uploaded or saved by this app.",
    ))


def perform_local_review(front_bytes: bytes, back_bytes: bytes, selfie_bytes: bytes) -> str:
    """Reuse actual staging OCR and 1:1 implementations, never a backend API."""
    import main as ai  # Heavy local dependencies loaded only after explicit consent.
    from face_preflight_policy import screening_ready_for_face_comparison

    if not ai.document_ocr_ready():
        raise RuntimeError("Tesseract OCR not installed/available on this Windows PC.")
    if not ai.face_mesh_engine_ready():
        raise RuntimeError("Local MediaPipe face-mesh engine is unavailable.")
    for name, payload in (("ID front", front_bytes), ("ID back", back_bytes),
                          ("selfie", selfie_bytes)):
        if not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_IMAGE_BYTES:
            raise ValueError(name + " is empty or larger than 10 MB.")
        ai.decode_image(payload, name)

    # This offline preview does NOT compare account name, birthday,
    # barangay or issuer records. Its score must NEVER approve an account.
    screened = ai.screen_government_id(
        declared_type="national_id", id_document_bytes=front_bytes,
        id_back_document_bytes=back_bytes,
    )
    comparison = None
    if screening_ready_for_face_comparison(screened, "national_id"):
        comparison = ai.run_face_verification(
            uid="local-only-no-account", id_document_bytes=front_bytes,
            selfie_bytes=selfie_bytes,
        )
    return safe_summary(screened, comparison)


def main() -> int:
    import tkinter as tk
    from tkinter import filedialog, messagebox

    root = tk.Tk()
    root.title("VolunServe — Private National ID + Selfie Lab (NO UPLOAD)")
    root.geometry("690x610")
    root.resizable(True, True)
    root.configure(bg="#f4f8fc")

    selected: dict[str, str] = {}
    selfie_camera: dict[str, bytes] = {}
    consent = tk.BooleanVar(value=False)
    statuses = {}

    heading = tk.Label(root, text="National ID + Selfie • PRIVATE LOCAL REVIEW",
                       bg="#f4f8fc", fg="#17375e", font=("Segoe UI", 15, "bold"))
    heading.pack(anchor="w", padx=20, pady=(18, 8))
    tk.Label(root, text=(
        "Experimental comparison only. NO account verification, backend calls, "
        "government issuer lookup, photos saved, or cloud upload. Use ONLY your "
        "own ID and face, with explicit consent."
    ), bg="#f4f8fc", fg="#333333", wraplength=640, justify="left").pack(
        anchor="w", padx=20, pady=(0, 12))

    def choose(label: str):
        filename = filedialog.askopenfilename(
            parent=root, title="Select your own " + label,
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp")],
        )
        if filename:
            try:
                read_selected_image(filename)
                selected[label] = filename
                statuses[label].configure(text="Selected (local only)", fg="#116329")
            except (ValueError, OSError) as exc:
                messagebox.showerror("Invalid image", str(exc), parent=root)

    for title, label in (("1. National ID FRONT photo", "front"),
                         ("2. National ID BACK photo", "back"),
                         ("3. Selfie photo (or use webcam below)", "selfie")):
        row = tk.Frame(root, bg="#f4f8fc")
        row.pack(fill="x", padx=20, pady=5)
        tk.Button(row, text=title, width=36, anchor="w",
                  command=lambda key=label: choose(key)).pack(side="left")
        status = tk.Label(row, text="Not selected", bg="#f4f8fc", fg="#854d0e")
        status.pack(side="left", padx=12)
        statuses[label] = status

    def webcam():
        if not consent.get():
            messagebox.showwarning("Consent required", "Check consent before opening camera.", parent=root)
            return
        try:
            import cv2
            from PIL import Image, ImageTk
            camera = cv2.VideoCapture(0)
            if not camera.isOpened():
                camera.release()
                raise RuntimeError("Webcam unavailable. Check Windows Camera permissions.")
        except Exception as exc:
            messagebox.showerror("Camera unavailable", str(exc), parent=root)
            return
        pop = tk.Toplevel(root)
        pop.title("Private camera • preview, then CAPTURE (not saved)")
        video = tk.Label(pop, text="Starting webcam...")
        video.pack(padx=10, pady=10)
        current = {"frame": None, "photo": None, "closed": False}

        def close():
            if current["closed"]:
                return
            current["closed"] = True
            camera.release()
            pop.destroy()

        def refresh():
            if current["closed"]:
                return
            ok, frame = camera.read()
            if ok and frame is not None:
                current["frame"] = frame
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                h, w = rgb.shape[:2]
                scale = min(1.0, 580 / max(w, 1), 380 / max(h, 1))
                if scale < 1.0:
                    rgb = cv2.resize(rgb, (int(w * scale), int(h * scale)))
                photo = ImageTk.PhotoImage(Image.fromarray(rgb))
                current["photo"] = photo
                video.configure(image=photo, text="")
            pop.after(80, refresh)

        def capture():
            frame = current["frame"]
            if frame is None:
                messagebox.showwarning("No frame", "Camera has not produced a frame.", parent=pop)
                return
            ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not ok or encoded is None or not 0 < len(encoded) <= MAX_IMAGE_BYTES:
                messagebox.showerror("Capture error", "Could not encode selfie in memory.", parent=pop)
                return
            selfie_camera["bytes"] = encoded.tobytes()
            selected.pop("selfie", None)
            statuses["selfie"].configure(text="Camera selfie captured in memory", fg="#116329")
            close()

        tk.Button(pop, text="CAPTURE SELFIE (memory only)", command=capture).pack(pady=8)
        pop.protocol("WM_DELETE_WINDOW", close)
        refresh()

    tk.Button(root, text="Take selfie with webcam", command=webcam).pack(
        anchor="w", padx=20, pady=(10, 2))
    tk.Checkbutton(root, variable=consent, bg="#f4f8fc",
                   text="I confirm this is MY ID and selfie, and I consent to local-only analysis.").pack(
        anchor="w", padx=20, pady=(12, 8))

    result_box = tk.Text(root, height=11, width=85, wrap="word", font=("Consolas", 10))
    result_box.pack(fill="both", expand=True, padx=20, pady=(10, 14))
    result_box.insert("end", "Select front + back, capture/select selfie, then click REVIEW.\n")
    result_box.configure(state="disabled")

    def review():
        if not consent.get():
            messagebox.showwarning("Consent required", "Explicit local-only consent is required.", parent=root)
            return
        if "front" not in selected or "back" not in selected or (
            "selfie" not in selected and "bytes" not in selfie_camera
        ):
            messagebox.showwarning("Missing input", "Select ID FRONT, ID BACK and a selfie.", parent=root)
            return
        try:
            front = read_selected_image(selected["front"])
            back = read_selected_image(selected["back"])
            selfie = (selfie_camera["bytes"] if "bytes" in selfie_camera
                      else read_selected_image(selected["selfie"]))
            message = perform_local_review(front, back, selfie)
        except Exception as exc:
            # Avoid sensitive paths/OCR strings or tracebacks in UI.
            message = "Could not complete LOCAL review: " + type(exc).__name__ + "\n" + (
                "Check Python dependencies, Tesseract installation and image quality. "
                "Nothing was uploaded or approved.")
        result_box.configure(state="normal")
        result_box.delete("1.0", "end")
        result_box.insert("end", message)
        result_box.configure(state="disabled")

    tk.Button(root, text="REVIEW LOCALLY — NEVER AUTO-APPROVE",
              bg="#0b8062", fg="white", command=review).pack(
        anchor="w", padx=20, pady=(0, 16))
    root.mainloop()
    selfie_camera.clear()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
