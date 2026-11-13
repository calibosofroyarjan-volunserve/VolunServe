"""One-click Windows UI bootstrap for PRIVATE VolunServe webcam PAD research.

Opens only after the adult user explicitly consents. Missing software / pinned
public model weights are downloaded only with an additional affirmative setup
confirmation. This program never uploads or persists biometric media, sends
ID details, runs a VolunServe backend, or changes verified-account status.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEPS = ("numpy==1.26.4", "opencv-contrib-python-headless==4.11.0.86")


def pilot_args(*, camera=0, trials=1, consent=False):
    """Build fixed, local-only CLI arguments. No arbitrary commands or URLs."""
    if not consent:
        raise ValueError("EXPLICIT_CONSENT_REQUIRED")
    if type(camera) is not int or camera not in (0, 1, 2, 3):
        raise ValueError("INVALID_CAMERA_INDEX")
    if type(trials) is not int or trials not in (1, 3):
        raise ValueError("INVALID_TRIAL_COUNT")
    return ["--consent-confirmed", "--preview",
            "--camera", str(camera),
            "--trials-per-class", str(trials),
            "--frames-per-trial", "3"]


def models_present():
    """Check locally pinned public weights; never inspect face media."""
    from download_passive_pad_model import (
        DESTINATION as pad_file, SHA256 as pad_hash,
        EXPECTED_BYTES as pad_size,
    )
    from download_yunet_model import (
        DESTINATION as yunet_file, SHA256 as yunet_hash,
        MAX_BYTES as yunet_limit,
    )
    for path, digest, max_bytes, exact in (
        (pad_file, pad_hash, pad_size, True),
        (yunet_file, yunet_hash, yunet_limit, False),
    ):
        try:
            if not path.is_file():
                return False
            data = path.read_bytes()
            if not data or len(data) > max_bytes:
                return False
            if exact and len(data) != max_bytes:
                return False
            if hashlib.sha256(data).hexdigest() != digest:
                return False
        except (OSError, ValueError):
            return False
    return True


def dependencies_present():
    return (importlib.util.find_spec("numpy") is not None and
            importlib.util.find_spec("cv2") is not None)


def setup_required():
    return not dependencies_present() or not models_present()


def install_prerequisites(*, approved=False, runner=subprocess.check_call):
    """No network/install action without a distinct affirmative setup click."""
    if not approved:
        raise PermissionError("LOCAL_SETUP_NOT_APPROVED")
    if not dependencies_present():
        runner([sys.executable, "-m", "pip", "install",
                "--disable-pip-version-check", *DEPS], cwd=str(ROOT))
    if not models_present():
        # Download public, checksum-pinned models with the audited scripts.
        runner([sys.executable, str(SCRIPT_DIR / "download_passive_pad_model.py")],
               cwd=str(ROOT))
        runner([sys.executable, str(SCRIPT_DIR / "download_yunet_model.py")],
               cwd=str(ROOT))
    if not dependencies_present() or not models_present():
        raise RuntimeError("Pinned model or Python dependency setup incomplete.")


def format_aggregate(report):
    """No people/photos/frames: summary is counts only, never PAD approval."""
    counts = report.get("trialCountsByPresentationType", {})
    disagreements = report.get("pairedTrialStatusDisagreements", {})
    scales = report.get("perScale", {})
    lines = [
        "PRIVATE LOCAL PAD PILOT — EXPLORATORY ONLY",
        "No participant has been identity verified.",
        "",
        "Actual physical presentations recorded in memory:",
    ]
    for kind in ("live", "print", "replay"):
        lines.append(f"  {kind.upper()}: {int(counts.get(kind, 0))} trial(s)")
    lines.extend((
        "",
        "0–255 vs 0–1 model decisions disagreed on:",
        *(f"  {kind.upper()}: {int(disagreements.get(kind, 0))}" for kind
          in ("live", "print", "replay")),
    ))
    for mode, data in sorted(scales.items()):
        lines.append("")
        lines.append(f"Experimental input: {mode}")
        by_kind = data.get("perClass", {})
        for kind in ("live", "print", "replay"):
            row = by_kind.get(kind, {})
            lines.append(
                f"  {kind.upper()}: live={int(row.get('observedLive', 0))}, "
                f"attack={int(row.get('observedAttack', 0))}, "
                f"inconclusive={int(row.get('inconclusive', 0))}"
            )
        genuine = by_kind.get("live", {})
        live_count = int(genuine.get("trials", 0))
        genuine_not_accepted = (
            int(genuine.get("observedAttack", 0)) +
            int(genuine.get("inconclusive", 0)))
        attack_count = sum(
            int(by_kind.get(kind, {}).get("trials", 0))
            for kind in ("print", "replay"))
        attacks_observed_live = sum(
            int(by_kind.get(kind, {}).get("observedLive", 0))
            for kind in ("print", "replay"))
        lines.extend((
            f"  Live presentations not accepted: {genuine_not_accepted}/{live_count}",
            f"  Print/replay presentations seen as live: {attacks_observed_live}/{attack_count}",
        ))
    lines.extend((
        "",
        "Physical labels are confirmed by the operator, NOT camera-verified.",
        "These are tiny pilot observations, NOT calibrated APCER/BPCER.",
        "Liveness independently validated: NO",
        "Permission to approve Verified Resident: NO",
        "",
        "For real biometric release, independent device/attack studies,",
        "privacy review and issuer checks are still required.",
    ))
    return "\n".join(lines)


def ask_user_settings():
    """Tk window is the consent boundary; no camera/network before acceptance."""
    import tkinter as tk

    root = tk.Tk()
    root.title("VolunServe | Private Laptop Camera Validation")
    root.configure(bg="#f4f8fc")
    root.geometry("640x510")
    root.resizable(False, False)
    choice = {"accepted": False, "camera": 0, "trials": 1, "mode": "framing"}
    camera = tk.IntVar(value=0)
    mode = tk.StringVar(value="framing")
    consent = tk.BooleanVar(value=False)

    box = tk.Frame(root, bg="#f4f8fc", padx=24, pady=19)
    box.pack(fill="both", expand=True)
    tk.Label(box, text="VolunServe • Local PAD Pilot", bg="#f4f8fc",
             fg="#0f2f5a", font=("Segoe UI", 18, "bold")).pack(anchor="w")
    tk.Label(box, text=(
        "Works with the laptop webcam. A visible camera window opens with "
        "MOVE BACK / FRAMING READY guidance, a per-trial physical presentation "
        "confirmation checkbox, and Start Capture."
    ), bg="#f4f8fc", wraplength=570, justify="left",
        font=("Segoe UI", 10)).pack(anchor="w", pady=(10, 8))
    tk.Label(box, text=(
        "This is experimental research, NOT validated liveness. No ID is "
        "needed. No facial photo or recording is saved or uploaded."
    ), bg="#e0f2fe", fg="#0c4a6e", padx=12, pady=10,
        wraplength=550, justify="left").pack(anchor="w", fill="x", pady=(4, 14))
    tk.Label(box, text="Camera number (normally 0)",
             bg="#f4f8fc", font=("Segoe UI", 10, "bold")).pack(anchor="w")
    tk.OptionMenu(box, camera, 0, 1, 2, 3).pack(anchor="w")
    tk.Label(box, text="Session length", bg="#f4f8fc",
             font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(7, 0))
    tk.Radiobutton(box, variable=mode, value="framing",
                   text="First: camera + framing only (NO captures, no printer needed)",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="quick",
                   text="Quick pilot: 1 live + 1 print + 1 replay",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="full",
                   text="9-trial pilot: 3 real LIVE + 3 physical PRINT + 3 screen REPLAY",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Checkbutton(box, variable=consent,
                   text="I consent. Any adult shown also consented.",
                   bg="#f4f8fc", font=("Segoe UI", 10, "bold")).pack(
                       anchor="w", pady=(9, 4))
    status = tk.Label(box, text="Please read and check consent before starting.",
                      bg="#f4f8fc", fg="#a04a10")
    status.pack(anchor="w")

    def accept():
        if not consent.get():
            status.configure(text="Explicit consent is required.", fg="#b91c1c")
            return
        choice.update(accepted=True, camera=camera.get(),
                      trials=3 if mode.get() == "full" else 1,
                      mode=mode.get())
        root.destroy()

    buttons = tk.Frame(box, bg="#f4f8fc")
    buttons.pack(anchor="w", pady=(9, 0))
    tk.Button(buttons, text="Start private webcam pilot",
              bg="#0b8062", fg="white", font=("Segoe UI", 10, "bold"),
              padx=13, pady=7, command=accept).pack(side="left")
    tk.Button(buttons, text="Cancel", padx=12, pady=7,
              command=root.destroy).pack(side="left", padx=12)
    root.mainloop()
    return choice


def notify(title, message, *, error=False):
    import tkinter as tk
    from tkinter import messagebox
    app = tk.Tk()
    app.withdraw()
    if error:
        messagebox.showerror(title, message, parent=app)
    else:
        messagebox.showinfo(title, message, parent=app)
    app.destroy()


def main():
    if sys.platform != "win32":
        print("This one-click launcher is Windows-only. Use the documented CLI on other OS.")
        return 2
    try:
        user = ask_user_settings()
    except Exception as exc:
        print("Could not open Windows consent dialog. No camera accessed:", type(exc).__name__)
        return 2
    if not user["accepted"]:
        print("Cancelled without accessing camera, model, or identity data.")
        return 0
    try:
        args = pilot_args(camera=user["camera"], trials=user["trials"], consent=True)
        if setup_required():
            from tkinter import messagebox
            # A separate setup approval, after camera consent, is necessary.
            approved = messagebox.askyesno(
                "One-time local setup (optional)",
                "Python packages or checksum-pinned public AI model files are missing.\n\n"
                "Install/download these public files from their original sources? "
                "This needs internet, but no face/ID material is sent.",
            )
            if not approved:
                print("Local setup declined. No camera or biometric data accessed.")
                return 0
            print("Installing local Python packages / pinned models (no user media).")
            install_prerequisites(approved=True)
        # Import camera modules only AFTER explicit consent and local setup.
        if user.get("mode") == "framing":
            import cv2
            from pad_webcam_preview_tk_local import launch_webcam_preview
            camera = cv2.VideoCapture(user["camera"])
            try:
                if not camera.isOpened():
                    raise RuntimeError("No camera at that number. Try another camera or Windows privacy settings.")
                launch_webcam_preview(camera, trials_per_class=1,
                                      frames_per_trial=3, preview_only=True)
            finally:
                camera.release()
            notify("Framing-only preview closed",
                   "No liveness trial was counted. No photos, videos or IDs saved. "
                   "Once FRAMING READY works, choose the Quick pilot to evaluate "
                   "live, print and replay presentations separately.")
            return 0
        from run_pad_webcam_trials_local import run_cli
        output = []
        code = run_cli(args, output_fn=output.append)
        if code == 130:
            notify("Pilot cancelled",
                   "Cancelled. No saved photos, no report and no account changes.")
            return 0
        if code != 0:
            notify("Camera pilot did not complete",
                   "No valid full pilot report. Check model setup, camera number, "
                   "Windows permission and whether the full face crop fits.",
                   error=True)
            return code
        reports = [json.loads(s) for s in output if s.startswith("{")]
        if not reports:
            raise RuntimeError("Pilot did not return an aggregate-only summary.")
        report = reports[-1]
        if (report.get("identityDecisionUse") != "none" or
                report.get("independentPadValidated") is not False):
            raise RuntimeError("Unexpected model validation claims; report withheld.")
        summary = format_aggregate(report)
        print(summary)
        notify("Local research result — NOT identity verification", summary)
        return 0
    except Exception as exc:
        print("Private laptop pilot could not complete:", type(exc).__name__, str(exc))
        notify("Local setup/pilot error",
               "Setup or webcam test failed. No ID was approved.\n\n"
               + str(exc)[:360], error=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
