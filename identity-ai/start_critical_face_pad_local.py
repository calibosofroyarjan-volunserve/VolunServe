"""Private, guided VolunServe Windows face/PAD evaluation launcher.

No cloud, downloader, live-account access, camera or images are touched merely
by opening this menu. No automatic identity decision, biometric storage or
production deployment. Real observations require independently consented data
and actual physical presentations on the user's own machine.
"""
from __future__ import annotations

import math
from pathlib import Path
import subprocess
import sys


_ROOT = Path(__file__).resolve().parent
_REPO = _ROOT.parent
_ALLOWED_SCRIPTS = {
    "1": "choose_sface_pair_local.py",
    "2": "evaluate_sface_pairs_local.py",
    "3": "run_pad_webcam_trials_local.py",
    "4": "critical_biometric_risk_gate.py",
}


def _local_dialog(kind, *, title, file_types=None):
    """A local Windows dialog; do not echo paths or files to terminal."""
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        if kind == "file":
            return filedialog.askopenfilename(
                parent=root, title=title, filetypes=file_types)
        if kind == "folder":
            return filedialog.askdirectory(parent=root, title=title)
        if kind == "new_json":
            return filedialog.asksaveasfilename(
                parent=root, title=title, defaultextension=".json",
                filetypes=[("Aggregate-only JSON", "*.json")])
        raise ValueError("invalid_dialog_type")
    finally:
        root.destroy()


def _private_new_json(candidate):
    """Reject repository paths, existing targets, and symlinks before execution."""
    if not isinstance(candidate, str) or not candidate:
        return False
    try:
        path = Path(candidate)
        if path.suffix.lower() != ".json" or path.is_symlink() or path.exists():
            return False
        resolved = path.resolve()
        repo = _REPO.resolve()
        if resolved == repo or repo in resolved.parents:
            return False
        return resolved.parent.is_dir() and not resolved.parent.is_symlink()
    except (OSError, ValueError, RuntimeError):
        return False


def _positive_consent(input_fn, output_fn):
    output_fn(
        "Only analyze photos you own or have permission to use. "
        "All pictured people must explicitly consent. "
        "Keep all photos/recordings OUTSIDE the Git repository and off cloud services."
    )
    output_fn("This is exploratory QA, not real identity approval, liveness or certified accuracy.")
    return str(input_fn("Type YES to confirm consent and local-only testing: ")).strip() == "YES"


def _candidate_threshold(input_fn):
    """An operator must enter a research comparison point, not a validated default."""
    raw = str(input_fn(
        "Enter a research-only SFace cosine comparison threshold (-1 to 1; "
        "NOT a production threshold): "
    )).strip()
    try:
        value = float(raw)
        if not math.isfinite(value) or not -1.0 <= value <= 1.0:
            return None
        return value
    except ValueError:
        return None


def prepare_local_command(choice, *, input_fn=input, output_fn=print,
                          dialog=_local_dialog):
    """Returns a local Python argv vector; no shell, network or secrets."""
    if choice not in _ALLOWED_SCRIPTS:
        return None
    if not _positive_consent(input_fn, output_fn):
        output_fn("LOCAL_QA_CANCELLED: consent not confirmed.")
        return None
    script = _ROOT / _ALLOWED_SCRIPTS[choice]
    if not script.is_file():
        output_fn("LOCAL_QA_BLOCKED: required script missing from this checkout.")
        return None
    if choice == "1":
        # This child independently requests photo-specific consent with Tk.
        return [sys.executable, str(script)]
    if choice == "2":
        manifest = dialog("file", title="Choose PRIVATE labeled pairs.csv",
                          file_types=[("CSV manifest", "*.csv")])
        photos = dialog("folder", title="Choose PRIVATE consenting image directory")
        report = dialog("new_json", title="NEW SFace aggregate-only report")
        threshold = _candidate_threshold(input_fn)
        if not manifest or not photos or not _private_new_json(report) or threshold is None:
            output_fn("LOCAL_SFACE_BLOCKED: private inputs, safe report or research threshold missing.")
            return None
        if Path(manifest).suffix.lower() != ".csv":
            output_fn("LOCAL_SFACE_BLOCKED: choose a .csv manifest.")
            return None
        # Existing evaluator independently enforces paths under private root,
        # photo permissions, manifest schema, pinned weights and no overwrites.
        return [
            sys.executable, str(script),
            "--pairs-csv", manifest, "--image-root", photos,
            "--threshold", str(threshold), "--aggregate-json", report,
            "--consent-confirmed",
        ]
    if choice == "3":
        report = dialog("new_json", title="NEW PAD camera aggregate-only report")
        if not _private_new_json(report):
            output_fn("LOCAL_PAD_BLOCKED: choose a NEW private JSON destination outside Git.")
            return None
        output_fn(
            "For actual attack trials, the webcam must see a real person, "
            "then a PHYSICAL printed consenting portrait, then a different "
            "screen replaying a consenting portrait video. NEVER use ID cards."
        )
        # Existing runner displays a consented camera preview, captures only
        # in RAM, and groups repeated frames into one presentation trial.
        return [
            sys.executable, str(script), "--consent-confirmed",
            "--preview", "--four-hypothesis",
            "--trials-per-class", "3",
            "--aggregate-json", report,
        ]
    face = dialog("file", title="Choose SFace AGGREGATE ONLY JSON",
                  file_types=[("JSON report", "*.json")])
    pad = dialog("file", title="Choose PAD AGGREGATE ONLY JSON",
                 file_types=[("JSON report", "*.json")])
    if not face or not pad or face == pad:
        output_fn("LOCAL_QA_BLOCKED: two DIFFERENT aggregate JSON files required.")
        return None
    # Combined script reads only JSON schema-limited aggregate counts.
    return [
        sys.executable, str(script),
        "--sface-aggregate", face, "--pad-aggregate", pad,
    ]


def run_menu(*, input_fn=input, output_fn=print,
             dialog=_local_dialog, executor=None):
    """Intentionally require a fresh user action for every local test."""
    output_fn("VOLUNSERVE CRITICAL FACE / PAD — PRIVATE COMPUTER QA")
    output_fn("1. Two-photo SFace diagnostic (one score, NOT accuracy)")
    output_fn("2. Labeled same/different-person SFace accuracy pilot")
    output_fn("3. Live / physical-print / second-screen PAD camera pilot")
    output_fn("4. Combined aggregate-only risk report")
    output_fn("0. Exit without accessing any media")
    option = str(input_fn("Choose 0–4: ")).strip()
    if option == "0":
        output_fn("No photo, camera or account accessed.")
        return 0
    if option not in _ALLOWED_SCRIPTS:
        output_fn("Unknown option. No media accessed.")
        return 2
    argv = prepare_local_command(option, input_fn=input_fn,
                                 output_fn=output_fn, dialog=dialog)
    if argv is None:
        return 2
    # Do not use shell=True; child runs a fixed, local project script only.
    result = (executor if executor is not None else subprocess.run)(argv, check=False)
    return int(result.returncode)


if __name__ == "__main__":
    try:
        raise SystemExit(run_menu())
    except (KeyboardInterrupt, EOFError):
        print("LOCAL_QA_CANCELLED: no upload or automated identity grant.")
        raise SystemExit(130) from None
