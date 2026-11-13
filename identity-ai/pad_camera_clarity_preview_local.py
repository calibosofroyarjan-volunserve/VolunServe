"""Private camera-ONLY troubleshooting UI. Does not import YuNet or MiniFASNet.

The consenting user's webcam frames are displayed transiently in RAM only.
No face identification, recognition, identity proof, PAD assessment, saved
images/videos, network requests, or log of frame content is performed.
"""
import base64

import cv2
import numpy as np

from pad_camera_quality_local import quality_hint, request_supported_resolution

MAX_DISPLAY_W = 690
MAX_DISPLAY_H = 430


def fit_camera_preview(frame):
    """Shrink display only; never upscale or modify the original captured frame."""
    height, width = frame.shape[:2]
    factor = min(1.0, MAX_DISPLAY_W / width, MAX_DISPLAY_H / height)
    if factor >= 1:
        return frame
    return cv2.resize(
        frame,
        (max(1, round(width * factor)), max(1, round(height * factor))),
        interpolation=cv2.INTER_AREA,
    )


def launch_camera_clarity_preview(camera, *, tick_ms=150):
    """Visible local webcam window; caller retains/relinquishes device ownership."""
    import tkinter as tk

    root = tk.Tk()
    root.title("VolunServe | Camera Clarity Check — NO AI MODELS")
    root.configure(bg="#f3f7fb")
    root.resizable(False, False)

    container = tk.Frame(root, bg="#f3f7fb", padx=20, pady=14)
    container.pack()
    tk.Label(
        container, text="VolunServe · Laptop camera check",
        font=("Segoe UI", 16, "bold"), bg="#f3f7fb", fg="#123358",
    ).pack(anchor="w")
    tk.Label(
        container,
        text="CAMERA ONLY • No face analysis • No capture • No photo or video saved",
        bg="#f3f7fb", fg="#45576b", font=("Segoe UI", 9),
    ).pack(anchor="w", pady=(4, 10))

    panel = tk.Frame(container, bg="#162634", width=700, height=445)
    panel.pack()
    panel.pack_propagate(False)
    preview = tk.Label(panel, bg="#162634")
    preview.pack(fill="both", expand=True)
    status = tk.Label(
        container, text="Checking camera quality...", bg="#f3f7fb",
        fg="#1b4a64", justify="left", wraplength=690,
        font=("Segoe UI", 10),
    )
    status.pack(anchor="w", pady=(8, 4))
    tk.Label(
        container,
        text=("Check your face with a lamp/window IN FRONT, clean the lens, "
              "and compare Windows Camera. Image detail is NOT liveness."),
        bg="#f3f7fb", fg="#45576b", wraplength=680, justify="left",
    ).pack(anchor="w")

    state = {"closed": False, "failures": 0, "ticks": 0, "photo": None}

    def close():
        state["closed"] = True
        state["photo"] = None
        try:
            root.quit()
        except tk.TclError:
            pass

    root.protocol("WM_DELETE_WINDOW", close)
    tk.Button(
        container, text="Close and release camera",
        bg="#154b72", fg="white", padx=12, pady=5, command=close,
    ).pack(anchor="w", pady=(12, 0))

    def tick():
        if state["closed"]:
            return
        try:
            ok, frame = camera.read()
            valid = (
                ok and isinstance(frame, np.ndarray) and frame.dtype == np.uint8
                and frame.ndim == 3 and frame.shape[2] == 3
                and 120 <= frame.shape[0] <= 3000
                and 120 <= frame.shape[1] <= 3000
            )
            if not valid:
                state["failures"] += 1
                status.configure(
                    text="No usable camera frame. Check Windows permissions, camera "
                         "app conflicts, and device selection.", fg="#a05216",
                )
                if state["failures"] >= 20:
                    close()
                    return
            else:
                state["failures"] = 0
                state["ticks"] += 1
                if state["ticks"] == 1 or state["ticks"] % 6 == 0:
                    status.configure(text=quality_hint(frame), fg="#1b4a64")
                display = fit_camera_preview(frame)
                success, data = cv2.imencode(".png", display)
                if not success:
                    raise ValueError("PREVIEW_ENCODING_FAILED")
                state["photo"] = tk.PhotoImage(
                    data=base64.b64encode(data.tobytes()).decode("ascii"),
                    format="png",
                )
                preview.configure(image=state["photo"])
                del data, display, frame
        except (AttributeError, cv2.error, ValueError, TypeError, OverflowError) as exc:
            status.configure(text="Camera preview error; close and check Windows Camera.",
                             fg="#a05216")
            close()
            return
        root.after(tick_ms, tick)

    try:
        root.after(100, tick)
        root.mainloop()
    finally:
        state["photo"] = None
        root.destroy()


def open_camera_clarity(index):
    """Acquires camera only after caller's explicit GUI consent; releases in all paths."""
    if type(index) is not int or not 0 <= index <= 3:
        raise ValueError("INVALID_CAMERA_INDEX")
    camera = cv2.VideoCapture(index)
    if camera is None:
        raise RuntimeError("Camera not available.")
    try:
        if not camera.isOpened():
            raise RuntimeError(
                "Camera could not be opened. Check other apps and Windows permissions."
            )
        request_supported_resolution(camera)
        launch_camera_clarity_preview(camera)
    finally:
        camera.release()
