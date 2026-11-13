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


def pilot_args(*, camera=0, trials=1, consent=False, live_only=False,
               four_hypothesis=False):
    """Build fixed, local-only CLI arguments. No arbitrary commands or URLs."""
    if not consent:
        raise ValueError("EXPLICIT_CONSENT_REQUIRED")
    if type(camera) is not int or camera not in (0, 1, 2, 3):
        raise ValueError("INVALID_CAMERA_INDEX")
    if type(trials) is not int or trials not in (1, 3):
        raise ValueError("INVALID_TRIAL_COUNT")
    if type(live_only) is not bool:
        raise ValueError("INVALID_LIVE_ONLY_FLAG")
    if type(four_hypothesis) is not bool:
        raise ValueError("INVALID_FOUR_HYPOTHESIS_FLAG")
    args = ["--consent-confirmed", "--preview",
            "--camera", str(camera),
            "--trials-per-class", str(trials),
            "--frames-per-trial", "3"]
    if live_only:
        args.append("--only-live")
    if four_hypothesis:
        args.append("--four-hypothesis")
    return args


def models_present(*, include_v1se=False):
    """Check locally pinned public weights; never inspect face media."""
    from download_passive_pad_model import (
        DESTINATION as pad_file, SHA256 as pad_hash,
        EXPECTED_BYTES as pad_size,
    )
    from download_yunet_model import (
        DESTINATION as yunet_file, SHA256 as yunet_hash,
        MAX_BYTES as yunet_limit,
    )
    expected = [
        (pad_file, pad_hash, pad_size, True),
        (yunet_file, yunet_hash, yunet_limit, False),
    ]
    if include_v1se:
        from download_pad_v1se_model import (
            DESTINATION as second_file, SHA256 as second_hash,
            MIN_BYTES as second_min, MAX_BYTES as second_max,
        )
        expected.append((second_file, second_hash, second_max, False))
    for path, digest, max_bytes, exact in expected:
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


def setup_required(*, include_v1se=False):
    return not dependencies_present() or not models_present(
        include_v1se=include_v1se)


def install_camera_prerequisites(*, approved=False, runner=subprocess.check_call):
    """Camera check uses numpy/OpenCV only; never fetch YuNet/MiniFASNet."""
    if not approved:
        raise PermissionError("CAMERA_ONLY_SETUP_NOT_APPROVED")
    if not dependencies_present():
        runner([sys.executable, "-m", "pip", "install",
                "--disable-pip-version-check", *DEPS], cwd=str(ROOT))
    if not dependencies_present():
        raise RuntimeError("Camera-only Python dependencies unavailable.")


def run_camera_only(camera_index):
    """No biometric models, scores, trials, uploads or saved camera images."""
    from pad_camera_clarity_preview_local import open_camera_clarity
    open_camera_clarity(camera_index)
    return 0


def install_prerequisites(*, approved=False, runner=subprocess.check_call,
                          include_v1se=False):
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
    if include_v1se and not models_present(include_v1se=True):
        # One additional public ONNX weight; checksum enforced in downloader.
        runner([sys.executable, str(SCRIPT_DIR / "download_pad_v1se_model.py")],
               cwd=str(ROOT))
    if not dependencies_present() or not models_present(
            include_v1se=include_v1se):
        raise RuntimeError("Pinned model or Python dependency setup incomplete.")


def format_aggregate(report):
    """No people/photos/frames: summary is counts only, never PAD approval."""
    if report.get("auditType") == "private_local_four_hypothesis_pad_exploratory":
        risk = report.get("researchRiskCounts", {})
        counts = report.get("trialCountsByPresentationType", {})
        return "\n".join([
            "PRIVATE V2 + V1SE FOUR-HYPOTHESIS PILOT — NOT ID VERIFICATION",
            "These correlated pretrained models are NOT independently validated.",
            *(f"{k.upper()}: {counts.get(k, 0)} presentation trial(s)"
              for k in ("live", "print", "replay")),
            "",
            "CONSERVATIVE EXPERIMENTAL SAFETY WARNINGS:",
            f"Physical PRINT/REPLAY with any model/scale called LIVE: "
            f"{risk.get('printOrReplayAnyHypothesisObservedLive', 0)}/"
            f"{risk.get('totalPrintAndReplay', 0)}",
            f"Four-model apparent LIVE agreement on physical attacks: "
            f"{risk.get('printOrReplayFourWayLive', 0)}",
            f"Genuine presentations NOT four-way LIVE: "
            f"{risk.get('genuineNotFourWayLive', 0)}/"
            f"{risk.get('totalGenuine', 0)}",
            "",
            "A printed face accepted as LIVE by ANY model remains a safety flag.",
            "DO NOT enable biometric approval; independent PAD study still required.",
            "No images, videos, identification data or embeddings were saved.",
        ])
    counts = report.get("trialCountsByPresentationType", {})
    disagreements = report.get("pairedTrialStatusDisagreements", {})
    scales = report.get("perScale", {})
    lines = [
        "PRIVATE LOCAL PAD PILOT — EXPLORATORY ONLY",
        "No participant has been identity verified.",
        "",
        "Actual physical presentations recorded in memory:",
        "LIVE-ONLY: Print/replay not evaluated in this run."
        if not report.get("allPresentationTypesSampled", True)
        else "All three presentation categories sampled.",
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
    risk = report.get("conservativeShadowRisk", {})
    print_risk = int(risk.get("printPresentationsAnyScalePredictedLive", 0))
    replay_risk = int(risk.get("replayPresentationsAnyScalePredictedLive", 0))
    consent_limited = bool(risk.get("operatorLabelsNotIndependentlyVerified", True))
    lines.extend((
        "",
        "CONSERVATIVE SAFETY REVIEW (SHADOW ONLY):",
        f"PRINT trials predicted LIVE by either scale: {print_risk}",
        f"REPLAY trials predicted LIVE by either scale: {replay_risk}",
        "Cross-scale disagreements/unknowns => INCONCLUSIVE, not live.",
        "WARNING: Printed-photo false acceptance needs independent investigation."
        if print_risk else "No print false-live observed in these limited trials.",
        "Labels are operator-reported, not ground-truth independently verified."
        if consent_limited else "Labels require independent assessment.",
        "Automatic biometric approval remains BLOCKED.",
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


def format_combined_detailed_counts(report):
    """Only fixed-schema aggregate categories; no individual frame/face data."""
    if (report.get("auditType") != "private_local_four_hypothesis_pad_exploratory"
            or report.get("identityDecisionUse") != "none"
            or report.get("independentPadValidated") is not False
            or report.get("automaticApprovalAllowed") is not False):
        raise ValueError("UNSAFE_OR_NOT_COMBINED_RESEARCH_REPORT")
    by_model = report.get("perHypothesis")
    if not isinstance(by_model, dict):
        raise ValueError("MISSING_COMBINED_MODEL_COUNTS")
    names = (
        ("v2_raw_0_to_255", "V2 raw 0–255"),
        ("v2_normalized_0_to_1", "V2 normalized 0–1"),
        ("v1se_raw_0_to_255", "V1SE raw 0–255"),
        ("v1se_normalized_0_to_1", "V1SE normalized 0–1"),
    )
    categories = ("live", "print", "replay")
    lines = [
        "PRIVATE PAD PILOT: FOUR-MODEL AGGREGATE COUNTS",
        "UNVALIDATED MODEL OBSERVATIONS — NOT BIOMETRIC VERIFICATION",
        "Each physical presentation is one trial, not one trial per frame.",
        "",
    ]
    for mode, label in names:
        rows = by_model.get(mode)
        if not isinstance(rows, dict):
            raise ValueError("MISSING_MODEL_COUNTS")
        lines.append(label + ":")
        for category in categories:
            row = rows.get(category)
            if not isinstance(row, dict):
                raise ValueError("MISSING_PRESENTATION_COUNTS")
            values = []
            for key in ("trials", "observedLive", "observedAttack", "inconclusive"):
                value = row.get(key)
                if type(value) is not int or not 0 <= value <= 10:
                    raise ValueError("INVALID_AGGREGATE_COUNT")
                values.append(value)
            if sum(values[1:]) != values[0]:
                raise ValueError("INCONSISTENT_AGGREGATE_COUNTS")
            lines.append(
                f"  {category.upper()}: trials={values[0]}, "
                f"model-LIVE={values[1]}, attack={values[2]}, "
                f"inconclusive={values[3]}"
            )
        lines.append("")
    lines.extend((
        "A single PRINT/REPLAY classified LIVE remains a safety red flag.",
        "No automatic Resident verification. Independent PAD study is required.",
        "Only count data can be copied; no photos, videos, IDs or embeddings.",
    ))
    return "\n".join(lines)


def show_copyable_combined_counts(summary, report):
    """Post-test window with clearly visible copyable counts, no auto-save.

    Explicit clipboard action is the only local transfer; no media or cloud.
    If the window cannot open, main() already printed all counts in terminal.
    """
    from tkinter import scrolledtext
    import tkinter as tk

    detailed = format_combined_detailed_counts(report)
    root = tk.Tk()
    root.title("VolunServe | Copyable FOUR-MODEL PAD research counts")
    root.geometry("790x675")
    root.minsize(650, 470)
    root.configure(bg="#eef5f1")
    root.lift()
    header = tk.Label(
        root, text="V2 + V1SE — PRIVATE AGGREGATE RESULTS",
        bg="#eef5f1", fg="#0a503e", font=("Segoe UI", 14, "bold"))
    header.pack(padx=16, pady=(14, 5), anchor="w")
    tk.Label(
        root,
        text=("Four model/input combinations below. Counts are experimental. "
              "No face image, government ID or video saved. "
              "Use Copy counts to paste into a private text file."),
        bg="#eef5f1", justify="left", wraplength=755,
    ).pack(padx=16, pady=(0, 8), anchor="w")
    display = scrolledtext.ScrolledText(
        root, wrap="word", font=("Consolas", 10), height=29)
    display.insert("1.0", summary + "\n\n" + detailed)
    display.configure(state="disabled")
    display.pack(fill="both", expand=True, padx=16, pady=(0, 8))
    buttons = tk.Frame(root, bg="#eef5f1")
    buttons.pack(fill="x", padx=16, pady=(0, 14))
    copied = tk.StringVar(value="Nothing has been saved automatically.")
    tk.Label(buttons, textvariable=copied, bg="#eef5f1").pack(side="left")
    def copy_counts():
        root.clipboard_clear()
        root.clipboard_append(summary + "\n\n" + detailed)
        root.update()
        copied.set("Anonymous model counts copied. Paste in Notepad.")
    tk.Button(buttons, text="Copy detailed counts",
              command=copy_counts).pack(side="right", padx=(8, 0))
    tk.Button(buttons, text="Close", command=root.destroy).pack(side="right")
    root.mainloop()


def research_export(report, *, lighting, camera_type, path):
    """Explicitly opt-in to saving anonymous counters, never media or IDs.

    Uses the existing atomic exclusive writer and the strict known-schema
    validator. A caller must provide a chosen path outside the repository.
    """
    from pad_multisession_aggregate_local import validate_report
    from run_pad_webcam_trials_local import write_aggregate_exclusive
    result = dict(report)
    result["researchSessionContext"] = {
        "lighting": lighting, "cameraType": camera_type,
    }
    if result.get("auditType") == "private_local_four_hypothesis_pad_exploratory":
        from evaluate_pad_ensemble_local import safe_output, write_exclusive
        if (result.get("independentPadValidated") is not False or
                result.get("identityDecisionUse") != "none" or
                result.get("automaticApprovalAllowed") is not False or
                not safe_output(Path(path), ROOT)):
            raise ValueError("Unsafe research report or output destination.")
        write_exclusive(Path(path), result)
        return
    validate_report(result)
    write_aggregate_exclusive(Path(path), result)


def ask_user_settings():
    """Tk window is the consent boundary; no camera/network before acceptance."""
    import tkinter as tk

    root = tk.Tk()
    root.title("VolunServe | Private Laptop Camera Validation")
    root.configure(bg="#f4f8fc")
    root.geometry("680x760")
    root.resizable(False, False)
    choice = {"accepted": False, "camera": 0, "trials": 1, "mode": "camera_only",
              "lighting": "indoor_artificial", "cameraType": "laptop_built_in"}
    camera = tk.IntVar(value=0)
    mode = tk.StringVar(value="camera_only")
    lighting = tk.StringVar(value="indoor_artificial")
    camera_type = tk.StringVar(value="laptop_built_in")
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
    tk.Label(box, text="Non-identifying study conditions (optional counts export)",
             bg="#f4f8fc", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(7, 0))
    conditions = tk.Frame(box, bg="#f4f8fc")
    conditions.pack(anchor="w")
    tk.Label(conditions, text="Lighting", bg="#f4f8fc").pack(side="left")
    tk.OptionMenu(conditions, lighting, "daylight", "indoor_artificial",
                  "low_light", "not_recorded").pack(side="left")
    tk.Label(conditions, text="Camera type", bg="#f4f8fc").pack(side="left")
    tk.OptionMenu(conditions, camera_type, "laptop_built_in", "external_usb",
                  "phone_webcam", "not_recorded").pack(side="left")
    tk.Label(box, text="Session length", bg="#f4f8fc",
             font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(7, 0))
    tk.Radiobutton(box, variable=mode, value="camera_only",
                   text="RECOMMENDED: Camera clarity only (NO AI models, no tests)",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="framing",
                   text="Face framing only (YuNet detection, NO captures)",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="quick",
                   text="Quick pilot: 1 live + 1 print + 1 replay",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="full",
                   text="9-trial pilot: 3 real LIVE + 3 physical PRINT + 3 screen REPLAY",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="live_only",
                   text="LIVE-only diagnostic: 3 real-face captures (NO print/replay)",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="combined_quick",
                   text="NEW: V2 + V1SE pilot — 1 LIVE + 1 PRINT + 1 REPLAY",
                   bg="#f4f8fc").pack(anchor="w")
    tk.Radiobutton(box, variable=mode, value="combined_full",
                   text="NEW: V2 + V1SE pilot — 3 each LIVE/PRINT/REPLAY",
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
                      trials=3 if mode.get() in ("full", "live_only", "combined_full") else 1,
                      mode=mode.get(), lighting=lighting.get(),
                      cameraType=camera_type.get())
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
        # Camera hardware clarity must work independently of downloaded AI.
        # Consent is required above; avoid loading/checking any face models.
        if user.get("mode") == "camera_only":
            if not dependencies_present():
                from tkinter import messagebox
                approved = messagebox.askyesno(
                    "Camera-only Python setup",
                    "Only Python numpy/OpenCV packages are missing. Install "
                    "these public packages? No face models, identity data, "
                    "photos or videos are downloaded or uploaded.",
                )
                if not approved:
                    print("Camera-only setup declined; camera not opened.")
                    return 0
                install_camera_prerequisites(approved=True)
            return run_camera_only(user["camera"])

        combined = user.get("mode") in ("combined_quick", "combined_full")
        args = pilot_args(camera=user["camera"], trials=user["trials"],
                          consent=True, live_only=user.get("mode") == "live_only",
                          four_hypothesis=combined)
        if setup_required(include_v1se=combined):
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
            install_prerequisites(approved=True, include_v1se=combined)
        # Import camera modules only AFTER explicit consent and local setup.
        if user.get("mode") == "framing":
            import cv2
            from pad_camera_quality_local import request_supported_resolution
            from pad_webcam_preview_tk_local import launch_webcam_preview
            camera = cv2.VideoCapture(user["camera"])
            try:
                if not camera.isOpened():
                    raise RuntimeError("No camera at that number. Try another camera or Windows privacy settings.")
                request_supported_resolution(camera)
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
        print(summary, flush=True)
        if combined:
            # Previous GUI only printed SUMMARY and swallowed the actual JSON
            # into an in-memory output list. Always print all four per-model
            # aggregates to the terminal BEFORE showing any modal dialog.
            # These are anonymous trial counts, never face media.
            detailed = format_combined_detailed_counts(report)
            print("\\n" + detailed, flush=True)
            try:
                show_copyable_combined_counts(summary, report)
            except (RuntimeError, OSError, ValueError):
                # A broken/hidden Tk dialog must not erase the terminal output.
                print("Copy window unavailable; detailed aggregate counts "
                      "are printed above. No photos/IDs were saved.", flush=True)
        else:
            notify("Local research result — NOT identity verification", summary)

        # No biometric data is written. Optional anonymous COUNT JSON is
        # saved only after a second explicit user opt-in and a local file choice.
        from tkinter import filedialog, messagebox
        wants_counts = messagebox.askyesno(
            "Optional private research counts",
            "Save ONLY anonymous category counts and selected lighting/camera "
            "labels to a NEW local JSON file? No selfie, video, embedding, "
            "person name or ID is included. You can choose Cancel safely.",
        )
        if wants_counts:
            target = filedialog.asksaveasfilename(
                title="Choose a NEW JSON outside the VolunServe project",
                defaultextension=".json",
                filetypes=[("JSON counts", "*.json")],
                initialfile="VolunServe-PAD-Session-Counts.json",
            )
            if target:
                try:
                    research_export(
                        report,
                        lighting=user.get("lighting", "not_recorded"),
                        camera_type=user.get("cameraType", "not_recorded"),
                        path=target,
                    )
                    notify("Research counts saved locally",
                           "Only anonymous aggregates were saved. "
                           "Do not upload face images or IDs.")
                except (OSError, ValueError) as exc:
                    notify("Counts were not saved",
                           "Choose a NEW JSON outside Git. Existing files "
                           "cannot be overwritten. " + str(exc)[:180],
                           error=True)
        return 0
    except Exception as exc:
        print("Private laptop pilot could not complete:", type(exc).__name__, str(exc))
        notify("Local setup/pilot error",
               "Setup or webcam test failed. No ID was approved.\n\n"
               + str(exc)[:360], error=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
