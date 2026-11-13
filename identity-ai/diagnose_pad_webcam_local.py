"""Offline, consented webcam diagnostic for inconclusive VolunServe shadow PAD.

This tool diagnoses *why* an exploratory webcam trial is inconclusive:
missing/multiple faces, full 2.7x crop not fitting, uncalibrated low model
confidence, or invalid output. It never shows, writes, uploads, or logs
camera pixels, biometric embeddings, face coordinates or per-frame predictions.

Run on the user's Windows computer ONLY after downloading pinned models:
  py -3.11 identity-ai/diagnose_pad_webcam_local.py --consent-confirmed

All class observations are unvalidated. No identity, liveness, or access
grant can be derived from these counts.
"""
import argparse
from collections import Counter
import json
import math
import os
import sys
import time

import cv2
import numpy as np

import evaluate_pad_scales_local as paired
import passive_pad_shadow as pad
from run_pad_webcam_trials_local import valid_frame, MAX_CAMERA_INDEX
from yunet_shadow import inspect_frame


MAX_FRAMES = 20
DEFAULT_FRAMES = 9
MIN_INTERVAL = 0.25
MAX_INTERVAL = 3.0
REASONS = (
    "face_not_detected",
    "multiple_faces",
    "face_context_out_of_frame",
    "face_detection_inconclusive",
    "model_not_loaded",
    "invalid_camera_frame",
    "model_output_invalid",
    "low_model_confidence",
    "shadow_class_observed",
)
MODE_NAMES = tuple(name for name, _scale in paired.MODES)
INCONCLUSIVE = "inconclusive"
OBSERVATIONS = (
    "model_prefers_live_unvalidated",
    "model_prefers_attack_unvalidated",
    INCONCLUSIVE,
)


def _single_reason(reason):
    return reason if reason in REASONS else "face_detection_inconclusive"


def diagnose_one_frame(image, *, net=None, cropper=None, inspector=None):
    """Returns a privacy-safe stage and two shadow outputs; no face data.

    The model and face detector are called only on in-memory camera images.
    Double YuNet detection occurs only if the crop failed, to distinguish
    missing face from out-of-frame 2.7x crop in coarse diagnostic counts.
    """
    undecided = (INCONCLUSIVE, INCONCLUSIVE)
    empty_scale_reasons = ("face_detection_inconclusive",) * 2
    if not valid_frame(image):
        return ("invalid_camera_frame", undecided, ("invalid_camera_frame",) * 2)
    try:
        model = net if net is not None else pad._load_net()
        if model is None:
            return ("model_not_loaded", undecided, ("model_not_loaded",) * 2)

        crop_func = cropper if cropper is not None else pad._face_crop
        crop = crop_func(image)
        if crop is None:
            detector = inspector if inspector is not None else inspect_frame
            kind = detector(image)
            lookup = {
                "no_face": "face_not_detected",
                "multiple_faces": "multiple_faces",
                "one_face_unvalidated": "face_context_out_of_frame",
                "unavailable": "face_detection_inconclusive",
                "inconclusive": "face_detection_inconclusive",
            }
            reason = lookup.get(kind, "face_detection_inconclusive")
            return (reason, undecided, (reason,) * 2)

        if not isinstance(crop, np.ndarray) or crop.dtype != np.uint8 or crop.shape != (80, 80, 3):
            return ("face_detection_inconclusive", undecided, empty_scale_reasons)

        results, reasons = [], []
        for _name, factor in paired.MODES:
            blob = cv2.dnn.blobFromImage(
                crop, scalefactor=factor, size=(80, 80),
                mean=(0, 0, 0), swapRB=False, crop=False)
            with pad._LOCK:
                model.setInput(blob)
                logits = np.asarray(model.forward(), dtype=np.float64).reshape(-1)
            if logits.shape != (3,) or not np.isfinite(logits).all():
                results.append(INCONCLUSIVE)
                reasons.append("model_output_invalid")
                continue
            observed = paired.interpret_logits(logits)
            results.append(observed if observed in OBSERVATIONS else INCONCLUSIVE)
            reasons.append("low_model_confidence" if observed == INCONCLUSIVE
                           else "shadow_class_observed")

        if "model_output_invalid" in reasons:
            reason = "model_output_invalid"
        elif "low_model_confidence" in reasons:
            reason = "low_model_confidence"
        else:
            reason = "shadow_class_observed"
        return (reason, tuple(results), tuple(reasons))
    except (cv2.error, TypeError, ValueError, OSError, OverflowError):
        return ("model_output_invalid", undecided, ("model_output_invalid",) * 2)


def summarize_diagnostics(records):
    """Only counters and fixed descriptions, never session-level data."""
    reason_counts = Counter({key: 0 for key in REASONS})
    mode_counts = {
        name: Counter({outcome: 0 for outcome in OBSERVATIONS})
        for name in MODE_NAMES
    }
    per_scale_reasons = {
        name: Counter({key: 0 for key in REASONS})
        for name in MODE_NAMES
    }
    for record in records:
        if (not isinstance(record, tuple) or len(record) != 3 or
                not isinstance(record[1], tuple) or len(record[1]) != 2 or
                not isinstance(record[2], tuple) or len(record[2]) != 2):
            reason, outcomes, reasons = (
                "face_detection_inconclusive", (INCONCLUSIVE, INCONCLUSIVE),
                ("face_detection_inconclusive", "face_detection_inconclusive"))
        else:
            reason, outcomes, reasons = record
        reason_counts[_single_reason(reason)] += 1
        for index, name in enumerate(MODE_NAMES):
            status = outcomes[index] if outcomes[index] in OBSERVATIONS else INCONCLUSIVE
            mode_counts[name][status] += 1
            per_scale_reasons[name][_single_reason(reasons[index])] += 1

    total = sum(reason_counts.values())
    primary = max(REASONS, key=lambda k: reason_counts[k]) if total else None
    guidance = {
        "face_not_detected": "YuNet did not detect one face. Confirm camera 0 shows the correct camera, add light, and center the consenting face.",
        "multiple_faces": "YuNet saw more than one face. Remove bystanders and printed/replayed faces for this single-live-face diagnostic.",
        "face_context_out_of_frame": "A face was detected but the required 2.7x crop does not fit. Move farther from the camera and leave space around the face.",
        "face_detection_inconclusive": "The face detector or crop returned an ambiguous result. Retry with one well-lit centered face.",
        "model_not_loaded": "Pinned model was unavailable; check both local model download steps.",
        "invalid_camera_frame": "The camera delivered an invalid frame; check camera index, permissions and resolution.",
        "model_output_invalid": "The local model returned an invalid numerical output. Do not grant identity or change thresholds.",
        "low_model_confidence": "The face crop reached the model but experimental confidence was below 0.75 for one/both scales. Do not lower thresholds to force a pass.",
        "shadow_class_observed": "The experimental model produced a class observation. This is NOT certified liveness or Verified Resident.",
    }
    return {
        "auditType": "offline_shadow_pad_camera_diagnostics_aggregate_only",
        "framesInspected": total,
        "diagnosticReasonCounts": dict(reason_counts),
        "perScale": {
            name: {
                "shadowObservationCounts": dict(mode_counts[name]),
                "reasonCounts": dict(per_scale_reasons[name]),
            } for name in MODE_NAMES
        },
        "mostCommonReason": primary,
        "suggestion": guidance[primary] if primary else "No frames were inspected.",
        "noPhotosSaved": True,
        "shadowOnly": True,
        "independentPadValidated": False,
        "thresholdCalibrated": False,
        "identityDecisionUse": "none",
        "caveat": (
            "Only coarse diagnostic counts from a consented local live camera. "
            "No independent PAD accuracy, genuine/attack score or identity "
            "decision can be inferred."
        ),
    }


def run_cli(argv=None, *, camera_factory=None, input_fn=input,
            output_fn=print, assessor=diagnose_one_frame, sleeper=time.sleep):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--consent-confirmed", action="store_true")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--frames", type=int, default=DEFAULT_FRAMES)
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args(argv)
    if not args.consent_confirmed:
        print("Consent not confirmed; webcam not opened.", file=sys.stderr)
        return 2
    if (not 0 <= args.camera <= MAX_CAMERA_INDEX or
            not 1 <= args.frames <= MAX_FRAMES or
            not math.isfinite(args.interval) or
            not MIN_INTERVAL <= args.interval <= MAX_INTERVAL):
        print("Invalid camera index, frame count or sample interval.", file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    ready = pad.readiness()
    if not ready.get("modelLoaded") or not ready.get("faceDetectorShadow", {}).get("modelLoaded"):
        print("Pinned MiniFASNet or YuNet model unavailable; no webcam session.",
              file=sys.stderr)
        return 2

    capture = None
    try:
        factory = camera_factory if camera_factory is not None else cv2.VideoCapture
        capture = factory(args.camera)
        if capture is None or not capture.isOpened():
            print("Cannot open that camera. Try --camera 1 or check Windows permissions.",
                  file=sys.stderr)
            return 2
        output_fn("PRIVATE live-face diagnostic: no photos saved, no cloud, not identity verification.")
        output_fn("Position ONE consenting live face in front of the camera, centered and farther back so there is space around the head.")
        output_fn("No camera preview is shown. Check your camera position with the Windows Camera app first, then close that app.")
        pressed = input_fn("Press Enter to sample live face (q to cancel): ")
        if str(pressed).strip().lower() in ("q", "quit", "cancel"):
            return 130
        sleeper(1.0)
        rows = []
        for i in range(args.frames):
            ok, frame = capture.read()
            if not ok or not valid_frame(frame):
                print("Camera frame failed; diagnostic discarded.", file=sys.stderr)
                return 2
            rows.append(assessor(frame))
            del frame
            if i + 1 < args.frames:
                sleeper(args.interval)
    except KeyboardInterrupt:
        print("Cancelled; no diagnostic report stored.", file=sys.stderr)
        return 130
    finally:
        if capture is not None:
            capture.release()
    output_fn(json.dumps(summarize_diagnostics(rows), sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run_cli())
