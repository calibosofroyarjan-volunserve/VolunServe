"""VolunServe PRIVATE National ID / selfie LIVE-CAMERA review lab.

All three images must come from the local webcam, never from upload/gallery.
Frame-guided OCR recognition is *not* issuer authentication or liveness.
No backend, network, file save, identity promotion or admin decision occurs.
Images and OCR text exist only transiently in memory for consented local study.
"""
from __future__ import annotations

import math
import queue
import hashlib


def validate_distinct_local_captures(front_bytes, back_bytes, selfie_bytes):
    """Reject exact reuse of a camera image before OCR or face comparison.

    Only compares ephemeral in-memory digests. Different encodings of the
    same print/screen image are NOT detected and this is NOT liveness/PAD.
    """
    images = (front_bytes, back_bytes, selfie_bytes)
    if not all(isinstance(data, bytes) and
               0 < len(data) <= MAX_IMAGE_BYTES for data in images):
        raise ValueError("One or more camera frames are missing or invalid.")
    hashes = tuple(hashlib.sha256(data).digest() for data in images)
    if len(set(hashes)) != 3:
        raise ValueError(
            "A camera frame was reused for another scan. "
            "Retake the ID front, back and selfie as distinct captures."
        )



def release_scan_buffers(captured=None, result_queue=None):
    """Drop app-owned references to sensitive frames and pending worker results.

    Python cannot guarantee physical zeroization of immutable bytes or copies
    held by OCR/native libraries. This bounds retention, not secure erasure.
    """
    if captured is not None:
        captured.clear()
    if result_queue is not None:
        while True:
            try:
                result_queue.get_nowait()
            except queue.Empty:
                break


MAX_IMAGE_BYTES = 10 * 1024 * 1024


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
    # Block missing and reused images BEFORE importing image engines or OCR.
    # Mirrors the protected backend's exact-media-reuse restriction.
    validate_distinct_local_captures(front_bytes, back_bytes, selfie_bytes)

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
    import sys
    import threading
    import time
    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.title("VolunServe — LIVE CAMERA National ID + Selfie Lab (NO UPLOAD)")
    root.geometry("730x615")
    root.configure(bg="#f4f8fc")

    captured: dict[str, bytes] = {}
    consent = tk.BooleanVar(value=False)
    camera_index = tk.IntVar(value=0)
    active_window = {"close": None}

    tk.Label(root, text="National ID + Selfie | LIVE CAMERA SCAN",
             bg="#f4f8fc", fg="#17375e", font=("Segoe UI", 17, "bold")).pack(
                 anchor="w", padx=20, pady=(17, 8))
    tk.Label(root, text=(
        "NO upload or gallery selection. Scan your own National ID FRONT, turn "
        "it to the BACK, then face the camera for a selfie. "
        "OCR detects possible card sides before local capture. "
        "This is experimental: NO official ID authentication, validated liveness "
        "or automatic Verified Resident status."
    ), bg="#f4f8fc", fg="#333333", wraplength=670, justify="left").pack(
        anchor="w", padx=20, pady=(0, 12))

    row = tk.Frame(root, bg="#f4f8fc")
    row.pack(anchor="w", padx=20)
    tk.Label(row, text="Webcam:", bg="#f4f8fc").pack(side="left")
    tk.OptionMenu(row, camera_index, 0, 1, 2).pack(side="left", padx=6)

    progress = {}
    for name, label in (("front", "1. National ID FRONT"),
                        ("back", "2. National ID BACK"),
                        ("selfie", "3. LIVE selfie")):
        line = tk.Frame(root, bg="#f4f8fc")
        line.pack(fill="x", padx=20, pady=4)
        tk.Label(line, text=label, width=24, anchor="w",
                 bg="#f4f8fc", font=("Segoe UI", 10, "bold")).pack(side="left")
        indicator = tk.Label(line, text="Not scanned", bg="#f4f8fc", fg="#875514")
        indicator.pack(side="left")
        progress[name] = indicator

    def reset_captures():
        release_scan_buffers(captured)
        for label in progress.values():
            label.configure(text="Not scanned", fg="#875514")
        result.configure(state="normal")
        result.delete("1.0", "end")
        result.insert("end", "Camera only: FRONT -> BACK -> SELFIE -> local review.\n")
        result.configure(state="disabled")

    def on_consent_change():
        if not consent.get():
            if callable(active_window["close"]):
                active_window["close"]()
            reset_captures()

    tk.Checkbutton(root, variable=consent, command=on_consent_change,
                   text="This is MY ID and face; I consent to LOCAL camera-only processing.",
                   bg="#f4f8fc").pack(anchor="w", padx=20, pady=(12, 4))

    result = tk.Text(root, height=11, wrap="word", font=("Consolas", 10))
    result.pack(fill="both", expand=True, padx=20, pady=(10, 12))
    result.insert("end", "Camera only: FRONT -> BACK -> SELFIE -> local review.\n")
    result.configure(state="disabled")

    def show_result(message):
        result.configure(state="normal")
        result.delete("1.0", "end")
        result.insert("end", message)
        result.configure(state="disabled")

    def review_in_memory():
        if not consent.get() or any(k not in captured for k in ("front", "back", "selfie")):
            release_scan_buffers(captured)
            show_result("Incomplete. All three local camera scans are required.")
            return
        # Move image references out of the persistent UI state immediately.
        scans = tuple(captured.pop(key) for key in ("front", "back", "selfie"))
        show_result("Reviewing in local memory... no upload or account action.")
        root.update_idletasks()
        try:
            message = perform_local_review(*scans)
        except Exception as exc:
            # No filepaths, OCR or images included in the error display.
            message = (
                "LOCAL review inconclusive: " + type(exc).__name__ + "\n"
                "Check camera readability, Tesseract and MediaPipe setup. "
                "No ID or account was approved."
            )
        finally:
            # Release application references on BOTH success and exception.
            del scans
            release_scan_buffers(captured)
        show_result(message)

    def start_live_camera():
        if callable(active_window["close"]):
            messagebox.showinfo("Camera already open",
                                "Close the current camera scan first.", parent=root)
            return
        if not consent.get():
            messagebox.showwarning("Consent", "Please confirm local camera consent.",
                                   parent=root)
            return

        try:
            import cv2
            from PIL import Image, ImageTk
            from live_camera_scan_policy import (
                evaluate_camera_side, evaluate_selfie_face,
            )
            import main as ai
            if not ai.document_ocr_ready():
                raise RuntimeError("Tesseract OCR is not available.")
            camera = (
                cv2.VideoCapture(camera_index.get(), cv2.CAP_DSHOW)
                if sys.platform == "win32"
                else cv2.VideoCapture(camera_index.get())
            )
            if not camera.isOpened():
                camera.release()
                camera = cv2.VideoCapture(camera_index.get())
            if not camera.isOpened():
                camera.release()
                raise RuntimeError("Camera unavailable. Check Windows camera privacy settings.")
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            detector = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            if detector.empty():
                camera.release()
                raise RuntimeError("Local face detector could not load.")
        except Exception as exc:
            messagebox.showerror("Camera setup", str(exc)[:240], parent=root)
            return

        reset_captures()
        pop = tk.Toplevel(root)
        pop.title("VolunServe LIVE camera scanner — no photo upload")
        pop.geometry("770x620")
        pop.configure(bg="#eef5fa")
        step_label = tk.Label(
            pop, text="STEP 1: Hold National ID FRONT in the guide",
            bg="#eef5fa", fg="#17375e", font=("Segoe UI", 13, "bold")
        )
        step_label.pack(pady=(10, 5))
        video = tk.Label(pop, bg="#142332", text="Starting webcam...", fg="white")
        video.pack(padx=10, pady=5)
        feedback = tk.Label(pop, bg="#eef5fa", fg="#6b4e16", wraplength=720,
                            text="No upload. Text recognition takes a few seconds.")
        feedback.pack(pady=8)
        tk.Label(pop, bg="#eef5fa", fg="#4b5563", text=(
            "Automatic capture needs 2 matching OCR checks for each ID side; "
            "one clearly framed selfie. No images saved."
        ), wraplength=720).pack()
        worker_results = queue.Queue()
        cancel_ocr = threading.Event()
        state = {
            "closed": False, "stage": "front", "working": False,
            "matching": 0, "face_frames": 0, "next_ocr": 0.0,
            "photo": None,
        }

        def close(*, completed=False):
            if state["closed"]:
                return
            state["closed"] = True
            cancel_ocr.set()
            active_window["close"] = None
            # Clear queued OCR photos immediately and don't display the last frame.
            release_scan_buffers(
                None if completed else captured, worker_results)
            state["photo"] = None
            try:
                video.configure(image="", text="")
            except tk.TclError:
                pass
            camera.release()
            try:
                pop.destroy()
            except tk.TclError:
                pass
            if not completed:
                reset_captures()

        active_window["close"] = close
        tk.Button(pop, text="CANCEL — discard incomplete scans", command=close).pack(pady=9)
        pop.protocol("WM_DELETE_WINDOW", close)

        def roi_bounds(image):
            h, w = image.shape[:2]
            rw = int(w * 0.76)
            rh = min(int(h * 0.77), int(rw / 1.58))
            x = max(0, (w - rw) // 2)
            y = max(0, (h - rh) // 2)
            return (x, y, min(w, x + rw), min(h, y + rh))

        def run_ocr_worker(stage, snapshot):
            """One immutable camera ROI per OCR call; no file or network I/O."""
            if cancel_ocr.is_set():
                return
            try:
                ok, encoded = cv2.imencode(".png", snapshot)
                if not ok or encoded is None or not 0 < len(encoded) <= MAX_IMAGE_BYTES:
                    raise ValueError("Camera frame could not be processed.")
                payload = encoded.tobytes()
                quality = ai.image_quality(snapshot)
                ocr = ai.extract_government_id_text(payload, "Live camera ID " + stage)
                guidance = evaluate_camera_side(stage, ocr, quality["blurVariance"],
                                                quality["brightness"])
                if not cancel_ocr.is_set():
                    worker_results.put((stage, guidance, payload))
            except Exception:
                if not cancel_ocr.is_set():
                    worker_results.put((stage, {
                        "ready": False, "state": "retry",
                        "guidance": "OCR could not read this frame. Adjust focus and try again.",
                    }, None))

        def advance_stage(stage, bytes_capture):
            captured[stage] = bytes_capture
            progress[stage].configure(text="Captured locally (not verified)", fg="#116329")
            state["matching"] = 0
            state["face_frames"] = 0
            if stage == "front":
                state["stage"] = "back"
                step_label.configure(text="STEP 2: FLIP your National ID to its BACK")
                feedback.configure(text="FRONT captured. Flip the SAME ID. Scan waits for BACK text.")
                state["next_ocr"] = time.monotonic() + 1.4
            elif stage == "back":
                state["stage"] = "selfie"
                step_label.configure(text="STEP 3: Remove ID and look at the camera")
                feedback.configure(text="BACK captured. Show your own face, without the card.")
            else:
                # Keep completed captures only for the immediate local review.
                close(completed=True)
                root.after(100, review_in_memory)

        def poll_results():
            while True:
                try:
                    scanned_stage, evidence, payload = worker_results.get_nowait()
                except queue.Empty:
                    break
                state["working"] = False
                if scanned_stage != state["stage"] or state["closed"]:
                    continue
                feedback.configure(text=evidence["guidance"])
                if evidence["ready"] and payload is not None:
                    state["matching"] += 1
                    feedback.configure(
                        text=evidence["guidance"] + " (" + str(state["matching"]) + "/2)"
                    )
                    if state["matching"] >= 2:
                        advance_stage(scanned_stage, payload)
                else:
                    state["matching"] = 0

        def refresh():
            if state["closed"]:
                return
            if not consent.get():
                close()
                reset_captures()
                return
            poll_results()
            ok, frame = camera.read()
            if ok and frame is not None:
                stage = state["stage"]
                display = frame.copy()
                h, w = frame.shape[:2]
                if stage in ("front", "back"):
                    x0, y0, x1, y1 = roi_bounds(frame)
                    viable = (x1 - x0 >= 420 and y1 - y0 >= 260)
                    cv2.rectangle(display, (x0, y0), (x1, y1),
                                  (40, 200, 50) if state["matching"] else (0, 180, 250), 3)
                    if not viable:
                        feedback.configure(text="Camera resolution too low for ID text. Use a higher-resolution webcam.")
                    elif time.monotonic() >= state["next_ocr"] and not state["working"]:
                        state["working"] = True
                        state["next_ocr"] = time.monotonic() + 0.8
                        snapshot = frame[y0:y1, x0:x1].copy()
                        threading.Thread(target=run_ocr_worker,
                                         args=(stage, snapshot), daemon=True).start()
                else:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    faces = detector.detectMultiScale(
                        gray, scaleFactor=1.1, minNeighbors=5, minSize=(90, 90))
                    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
                    brightness = float(gray.mean())
                    face_result = evaluate_selfie_face(
                        faces, frame.shape, blur, brightness)
                    if len(faces) == 1:
                        x, y, fw, fh = (int(v) for v in faces[0])
                        cv2.rectangle(display, (x, y), (x + fw, y + fh),
                                      (60, 210, 70) if face_result["ready"] else
                                      (0, 170, 255), 3)
                    if face_result["ready"]:
                        state["face_frames"] += 1
                        feedback.configure(text=face_result["guidance"])
                        if state["face_frames"] >= 10:
                            ok_enc, encoded = cv2.imencode(".png", frame)
                            if (ok_enc and encoded is not None and
                                    0 < len(encoded) <= MAX_IMAGE_BYTES):
                                advance_stage("selfie", encoded.tobytes())
                                return
                            state["face_frames"] = 0
                    else:
                        state["face_frames"] = 0
                        feedback.configure(text=face_result["guidance"])
                if not state["closed"]:
                    shown = cv2.cvtColor(display, cv2.COLOR_BGR2RGB)
                    shrink = min(1.0, 715 / max(w, 1), 410 / max(h, 1))
                    if shrink < 1.0:
                        shown = cv2.resize(shown, (max(1, int(w * shrink)),
                                                   max(1, int(h * shrink))))
                    photo = ImageTk.PhotoImage(Image.fromarray(shown))
                    state["photo"] = photo
                    video.configure(image=photo, text="")
            if not state["closed"]:
                pop.after(85, refresh)

        refresh()

    actions = tk.Frame(root, bg="#f4f8fc")
    actions.pack(anchor="w", padx=20, pady=(0, 16))
    tk.Button(actions, text="START LIVE SCAN — FRONT > BACK > SELFIE",
              command=start_live_camera, bg="#0b8062", fg="white",
              padx=12, pady=8).pack(side="left")
    def clear_scans():
        if callable(active_window["close"]):
            active_window["close"]()
        reset_captures()

    tk.Button(actions, text="CLEAR SCANS", command=clear_scans,
              padx=12, pady=8).pack(side="left", padx=10)

    def shutdown():
        if callable(active_window["close"]):
            active_window["close"]()
        reset_captures()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", shutdown)
    root.mainloop()
    release_scan_buffers(captured)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
