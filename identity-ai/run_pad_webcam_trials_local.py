"""VolunServe consented local-webcam PAD pilot. QA ONLY; no recording saved.

This script runs ON THE USER'S PC. It NEVER connects to VolunServe cloud,
uploads faces or IDs, writes images/video, or grants Verified Resident status.
Each prompted physical presentation yields one exploratory trial: live face,
printed portrait, or phone/monitor replay of a consenting portrait video.

Original 0..255 and converted-model-card 0..1 are evaluated on the SAME face
crop. No per-trial prediction or image leaves the process; optional output is
aggregate counts only.

Windows usage from the repository root (after downloading pinned models):
  py -3.11 identity-ai/run_pad_webcam_trials_local.py --consent-confirmed

The Windows default is now a visible Tkinter camera preview with a framing
guide, Capture and Cancel. Use --no-preview only for automated/headless QA.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time

import cv2
import numpy as np

import evaluate_pad_scales_local as dual
import evaluate_passive_pad_local as original
import passive_pad_shadow as pad

# Short, bounded webcam access. Each presentation counts once even if 3 frames.
DEFAULT_TRIALS_PER_CLASS = 3
DEFAULT_FRAMES_PER_TRIAL = 3
MAX_TRIALS_PER_CLASS = 10
MAX_FRAMES_PER_TRIAL = 8
MAX_CAMERA_INDEX = 8
CATEGORIES = original.KINDS


class CameraCaptureError(RuntimeError):
    """No usable camera frame; stop rather than counting phantom trials."""


def valid_frame(frame):
    return (isinstance(frame, np.ndarray) and frame.dtype == np.uint8 and
            frame.ndim == 3 and frame.shape[2] == 3 and
            120 <= frame.shape[0] <= 3000 and
            120 <= frame.shape[1] <= 3000)


def capture_one_trial(capture, *,
                      assessor=dual.assess_paired_frame,
                      frames_per_trial=DEFAULT_FRAMES_PER_TRIAL,
                      frame_pause_s=1.0, sleeper=time.sleep):
    """Sample a real *physical* presentation in memory; one aggregate pair."""
    if not isinstance(frames_per_trial, int) or not 1 <= frames_per_trial <= MAX_FRAMES_PER_TRIAL:
        raise ValueError("INVALID_FRAME_COUNT")
    if not isinstance(frame_pause_s, (int, float)) or not 0.25 <= frame_pause_s <= 3.0:
        raise ValueError("INVALID_FRAME_INTERVAL")
    rows = []
    for index in range(frames_per_trial):
        ok, frame = capture.read()
        if not ok or not valid_frame(frame):
            raise CameraCaptureError("Camera frame unavailable; no trial counted.")
        result = assessor(frame)
        if (not isinstance(result, tuple) or len(result) != 2 or
                any(value not in (
                    "model_prefers_live_unvalidated",
                    "model_prefers_attack_unvalidated", "inconclusive",
                ) for value in result)):
            # Unexpected model/client output is never interpreted as verified.
            result = ("inconclusive", "inconclusive")
        rows.append(result)
        # Do not retain the entire video; individual frames go out of scope.
        del frame
        if index + 1 < frames_per_trial:
            sleeper(frame_pause_s)
    return dual.combine_paired_frames(rows)


def safe_aggregate_output(target):
    """Only a new aggregate JSON outside Git checkout; never overwrite files."""
    if target is None:
        return True
    repo = Path(__file__).resolve().parent.parent
    if target.is_symlink() or target.exists():
        return False
    destination = target.resolve()
    return not (destination == repo or repo in destination.parents or
                not destination.parent.is_dir() or destination.parent.is_symlink())


def write_aggregate_exclusive(target, report):
    """No overwrite and no symlink follow; the content has counts only."""
    if not safe_aggregate_output(target):
        raise ValueError("REPORT_MUST_BE_A_NEW_FILE_OUTSIDE_REPOSITORY")
    encoded = json.dumps(report, indent=2, sort_keys=True, allow_nan=False)
    # This script never includes camera frames, face boxes or per-trial data.
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd = os.open(target, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(encoded)
            stream.write("\n")
    except Exception:
        # An interrupted report should not masquerade as completed results.
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def run_pilot(capture, *, trials_per_class=DEFAULT_TRIALS_PER_CLASS,
              frames_per_trial=DEFAULT_FRAMES_PER_TRIAL,
              input_fn=input, output_fn=print,
              sampler=capture_one_trial, sleeper=time.sleep):
    """Prompted physical camera presentations; never label a synthetic fixture as real."""
    if not 1 <= trials_per_class <= MAX_TRIALS_PER_CLASS:
        raise ValueError("INVALID_TRIAL_COUNT")
    observations = {kind: [] for kind in CATEGORIES}
    directions = {
        "live": (
            "LIVE: Your own consenting face must be physically in front of the camera."
        ),
        "print": (
            "PRINT: Show a physical PRINTED portrait (not a government ID) to the camera."
        ),
        "replay": (
            "REPLAY: Show a SEPARATE screen playing a consenting portrait video to the camera."
        ),
    }
    for kind in CATEGORIES:
        output_fn("")
        output_fn(directions[kind])
        for index in range(trials_per_class):
            # Explicit presenter readiness rather than silent surprise capture.
            action = input_fn(
                f"{kind.upper()} trial {index+1}/{trials_per_class}: "
                "press Enter when the presentation is ready (q to cancel): "
            )
            if str(action).strip().lower() in ("q", "quit", "cancel"):
                raise KeyboardInterrupt
            output_fn("Capturing shortly. Keep the camera presentation steady.")
            sleeper(2.0)
            result = sampler(capture, frames_per_trial=frames_per_trial)
            observations[kind].append(result)
            output_fn("Presentation trial recorded in memory (no photo/video saved).")
    return observations


def run_cli(argv=None, *, camera_factory=None, input_fn=input,
            output_fn=print, sampler=capture_one_trial, sleeper=time.sleep,
            preview_launcher=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--consent-confirmed", action="store_true",
                        help="Confirm every person shown consented and this is private local research")
    parser.add_argument("--camera", type=int, default=0,
                        help="Local camera index (usually 0)")
    parser.add_argument("--trials-per-class", type=int, default=DEFAULT_TRIALS_PER_CLASS)
    parser.add_argument("--frames-per-trial", type=int, default=DEFAULT_FRAMES_PER_TRIAL)
    parser.add_argument("--aggregate-json", type=Path,
                        help="Optional NEW aggregate-only JSON outside Git (no overwrite)")
    preview_group = parser.add_mutually_exclusive_group()
    preview_group.add_argument(
        "--preview", dest="preview", action="store_true", default=None,
        help="Show local Tk webcam with real-time face/crop framing guide")
    preview_group.add_argument(
        "--no-preview", dest="preview", action="store_false",
        help="Legacy headless terminal prompts (no live camera display)")
    args = parser.parse_args(argv)
    # No model/camera/media access before consent AND argument validation.
    if not args.consent_confirmed:
        print("Consent required; camera was not opened. Nothing uploaded.", file=sys.stderr)
        return 2
    if (not 0 <= args.camera <= MAX_CAMERA_INDEX or
            not 1 <= args.trials_per_class <= MAX_TRIALS_PER_CLASS or
            not 1 <= args.frames_per_trial <= MAX_FRAMES_PER_TRIAL or
            not safe_aggregate_output(args.aggregate_json)):
        print("Invalid camera/trial settings or unsafe aggregate destination.", file=sys.stderr)
        return 2

    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    status = pad.readiness()
    if not status.get("modelLoaded") or not status.get("faceDetectorShadow", {}).get("modelLoaded"):
        print("Pinned MiniFASNet or YuNet model unavailable. Run both local model downloaders.",
              file=sys.stderr)
        return 2

    factory = camera_factory if camera_factory is not None else cv2.VideoCapture
    capture = None
    try:
        capture = factory(args.camera)
        if capture is None or not capture.isOpened():
            print("No camera at that index. Check Windows camera permissions.", file=sys.stderr)
            return 2
        output_fn("VolunServe PRIVATE webcam PAD pilot — QA only, not a verified identity test.")
        output_fn("No cloud uploads, no saved face images/videos. Close this program anytime to stop.")
        output_fn("You will capture live, printed-photo and screen-replay camera presentations.")
        output_fn("Model labels, normalization and threshold remain UNVALIDATED.")
        # On a real Windows PC, show the webcam without installing a new
        # OpenCV GUI package: built-in Tk PhotoImage can display local PNG
        # pixels entirely in memory even with opencv-headless installed.
        # Injected fake cameras use legacy CLI by default for headless CI.
        use_preview = (args.preview if args.preview is not None else
                       (sys.platform.startswith("win") and camera_factory is None))
        if use_preview:
            try:
                if preview_launcher is None:
                    from pad_webcam_preview_tk_local import launch_webcam_preview
                    launcher = launch_webcam_preview
                else:
                    launcher = preview_launcher
                trial_data = launcher(
                    capture, trials_per_class=args.trials_per_class,
                    frames_per_trial=args.frames_per_trial)
            except Exception:
                print("Local camera preview could not start. Check Python Tkinter "
                      "and Windows desktop permissions; use --no-preview only "
                      "for headless research.", file=sys.stderr)
                return 2
            if trial_data is None:
                print("Preview cancelled or camera failed; no report saved.",
                      file=sys.stderr)
                return 130
        else:
            output_fn("Headless CLI mode; no camera preview. Use --preview on Windows.")
            trial_data = run_pilot(
                capture, trials_per_class=args.trials_per_class,
                frames_per_trial=args.frames_per_trial, input_fn=input_fn,
                output_fn=output_fn, sampler=sampler, sleeper=sleeper)
    except CameraCaptureError:
        print("Camera capture failed; session discarded. No biometric media saved.",
              file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Cancelled by the participant. No result saved.", file=sys.stderr)
        return 130
    finally:
        if capture is not None:
            capture.release()

    report = dual.aggregate_paired(trial_data)
    # Nothing in result is a subject identifier, prediction on a person or image.
    output_fn(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    if args.aggregate_json is not None:
        try:
            write_aggregate_exclusive(args.aggregate_json, report)
        except (OSError, ValueError):
            print("Could not write safe aggregate report; no biometric data saved.",
                  file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(run_cli())
