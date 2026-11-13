"""Private offline four-hypothesis PAD audit, NEVER identity verification.

Runs V2 raw and normalized and V1SE raw and normalized over the same
consented physical camera presentation recordings. Nothing leaves this PC.
No scores, names, filenames, photos, videos, embeddings or IDs in reports.

One file = one physical presentation trial, not N independent video frames.
A folder label supplied by the operator is NOT proof of ground truth.

Windows:
  py -3.11 identity-ai/evaluate_pad_ensemble_local.py --samples C:\PAD-Test-Private \
      --consent-confirmed --operator-labels-reviewed \
      --camera-type laptop_built_in --lighting indoor_artificial
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys

import cv2
import numpy as np

import evaluate_pad_scales_local as scales
import evaluate_passive_pad_local as base
import passive_pad_shadow as v2
import pad_v1se_shadow as v1

KINDS = ("live", "print", "replay")
MODES = ("v2_raw_0_to_255", "v2_normalized_0_to_1",
         "v1se_raw_0_to_255", "v1se_normalized_0_to_1")
PREDICTIONS = frozenset((
    "model_prefers_live_unvalidated", "model_prefers_attack_unvalidated",
    "inconclusive",
))
CAMERAS = ("laptop_built_in", "external_usb", "phone_webcam", "not_recorded")
LIGHTING = ("daylight", "indoor_artificial", "low_light", "not_recorded")
MAX_TRIALS_PER_CLASS = 10
UNDECIDED = ("inconclusive",) * 4
ROOT = Path(__file__).resolve().parent.parent


def assess_four_hypotheses(frame, *, v2_assessor=None, v1_crop=None, v1_net=None):
    """Same ORIGINAL camera frame; V2 2.7x and V1SE 4x crops, two scales each."""
    if (not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or
            frame.ndim != 3 or frame.shape[2] != 3 or
            not 120 <= frame.shape[0] <= 3000 or
            not 120 <= frame.shape[1] <= 3000):
        return UNDECIDED
    evaluate_v2 = v2_assessor if v2_assessor is not None else scales.assess_paired_frame
    first = evaluate_v2(frame)
    if not (isinstance(first, tuple) and len(first) == 2 and
            all(x in PREDICTIONS for x in first)):
        first = UNDECIDED[:2]
    try:
        net = v1_net if v1_net is not None else v1._load_net()
        if net is None:
            return tuple(first) + UNDECIDED[:2]
        crop = v1_crop(frame) if v1_crop is not None else v1._face_crop_4x(frame)
        if (not isinstance(crop, np.ndarray) or crop.dtype != np.uint8 or
                crop.shape != (80, 80, 3)):
            return tuple(first) + UNDECIDED[:2]
        second = []
        with v1._LOCK:
            for scale in (1.0, 1.0 / 255.0):
                blob = cv2.dnn.blobFromImage(
                    crop, scalefactor=scale, size=(80, 80),
                    mean=(0, 0, 0), swapRB=False, crop=False)
                net.setInput(blob)
                second.append(scales.interpret_logits(net.forward()))
        if not all(x in PREDICTIONS for x in second):
            second = list(UNDECIDED[:2])
        return tuple(first) + tuple(second)
    except (cv2.error, OSError, ValueError, TypeError, OverflowError,
            FloatingPointError, ZeroDivisionError):
        return tuple(first) + UNDECIDED[:2]


def combine_one_presentation(frame_results):
    """Conservative research summary. Frames never count as separate trials.

    Any raw/normalized/model live prediction in an attack counts as a red flag.
    The strict four-way consensus only emits live if EVERY sampled frame
    yields live on all FOUR hypotheses. Missing/ambiguous frames abstain.
    """
    clean = []
    for row in frame_results:
        if not isinstance(row, tuple) or len(row) != 4 or any(x not in PREDICTIONS for x in row):
            clean.append(UNDECIDED)
        else:
            clean.append(row)
    if not clean:
        clean = [UNDECIDED]
    model_results = tuple(
        base.combine_frame_observations([row[index] for row in clean])
        for index in range(4)
    )
    if all(x == "model_prefers_live_unvalidated" for row in clean for x in row):
        combined = "live"
    elif all(x == "model_prefers_attack_unvalidated" for row in clean for x in row):
        combined = "attack"
    else:
        combined = "inconclusive"
    return {
        "hypotheses": model_results,
        "ensemble": combined,
        "anyHypothesisObservedLive": any(
            x == "model_prefers_live_unvalidated" for row in clean for x in row
        ),
    }


def evaluate_one_media(path, assessor=assess_four_hypotheses):
    """Load local consenting camera recording, no output/retention of media."""
    inconclusive = combine_one_presentation([])
    try:
        if path.is_symlink() or not path.is_file():
            return inconclusive
        size = path.stat().st_size
        if not 0 < size <= base.MAX_FILE_BYTES:
            return inconclusive
        if path.suffix.lower() in base.IMAGE_SUFFIXES:
            frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
            return combine_one_presentation([assessor(frame)]) if frame is not None else inconclusive
        if path.suffix.lower() not in base.VIDEO_SUFFIXES:
            return inconclusive
        video = cv2.VideoCapture(str(path))
        if not video.isOpened():
            video.release()
            return inconclusive
        try:
            fps = video.get(cv2.CAP_PROP_FPS)
            fps = fps if math.isfinite(fps) and 1 <= fps <= 120 else 15
            count = video.get(cv2.CAP_PROP_FRAME_COUNT)
            rows = []
            for second in range(base.MAX_VIDEO_FRAMES):
                index = int(round(second * fps))
                if math.isfinite(count) and count > 0 and index >= count:
                    break
                video.set(cv2.CAP_PROP_POS_FRAMES, index)
                ok, frame = video.read()
                if not ok:
                    break
                rows.append(assessor(frame))
                del frame
            return combine_one_presentation(rows)
        finally:
            video.release()
    except (cv2.error, OSError, ValueError, TypeError, OverflowError):
        return inconclusive


def collect_private_presentations(samples_dir, *, evaluator=evaluate_one_media):
    """No symlinks. Refuse oversize/overcount rather than silently cherry-pick."""
    if samples_dir.is_symlink() or not samples_dir.is_dir():
        raise ValueError("PRIVATE_SAMPLE_DIRECTORY_REQUIRED")
    if not scales.safe_local_paths(samples_dir, None):
        raise ValueError("PRIVATE_SAMPLES_MUST_BE_OUTSIDE_GIT")
    trials = {kind: [] for kind in KINDS}
    for kind in KINDS:
        folder = samples_dir / kind
        if folder.is_symlink():
            raise ValueError("SAMPLE_SYMLINK_NOT_ALLOWED")
        if not folder.exists():
            continue
        if not folder.is_dir():
            raise ValueError("INVALID_PRESENTATION_FOLDER")
        paths = sorted(
            (p for p in folder.iterdir() if p.is_file()
             and p.suffix.lower() in base.ALLOWED_SUFFIXES),
            key=lambda p: p.name.lower(),
        )
        if len(paths) > MAX_TRIALS_PER_CLASS:
            raise ValueError("TOO_MANY_PRESENTATION_TRIALS")
        for path in paths:
            if path.is_symlink() or not 0 < path.stat().st_size <= base.MAX_FILE_BYTES:
                raise ValueError("UNSAFE_PRESENTATION_MEDIA")
            trials[kind].append(evaluator(path))
    return trials


def summarize_four_hypotheses(trials, *, camera_type="not_recorded",
                              lighting="not_recorded"):
    """Fixed-schema anonymous counts and cautious decision risks, never ISO claims."""
    if camera_type not in CAMERAS or lighting not in LIGHTING:
        raise ValueError("INVALID_NONIDENTIFYING_SESSION_CONTEXT")
    counts = {kind: len(trials.get(kind, ())) for kind in KINDS}
    if any(type(x) is not int or x > MAX_TRIALS_PER_CLASS for x in counts.values()):
        raise ValueError("INVALID_TRIAL_COUNT")
    by_mode = {mode: {kind: {"trials": 0, "observedLive": 0,
                            "observedAttack": 0, "inconclusive": 0}
                      for kind in KINDS} for mode in MODES}
    ensemble = {kind: {"trials": 0, "observedLive": 0,
                       "observedAttack": 0, "inconclusive": 0,
                       "anyHypothesisObservedLive": 0}
                for kind in KINDS}
    for kind in KINDS:
        for row in trials.get(kind, ()):
            if (type(row) is not dict or set(row) !=
                    {"hypotheses", "ensemble", "anyHypothesisObservedLive"}
                    or type(row["hypotheses"]) not in (list, tuple)
                    or len(row["hypotheses"]) != 4
                    or row["ensemble"] not in ("live", "attack", "inconclusive")
                    or type(row["anyHypothesisObservedLive"]) is not bool):
                raise ValueError("INVALID_MODEL_TRIAL")
            ensemble[kind]["trials"] += 1
            ensemble[kind][{"live": "observedLive", "attack": "observedAttack",
                            "inconclusive": "inconclusive"}[row["ensemble"]]] += 1
            ensemble[kind]["anyHypothesisObservedLive"] += int(
                row["anyHypothesisObservedLive"]
            )
            for i, mode in enumerate(MODES):
                x = row["hypotheses"][i]
                if x not in ("live", "attack", "inconclusive"):
                    raise ValueError("INVALID_MODEL_TRIAL")
                by_mode[mode][kind]["trials"] += 1
                by_mode[mode][kind][{"live": "observedLive",
                                     "attack": "observedAttack",
                                     "inconclusive": "inconclusive"}[x]] += 1

    attacks = counts["print"] + counts["replay"]
    attack_any = sum(ensemble[k]["anyHypothesisObservedLive"] for k in ("print", "replay"))
    attack_consensus = sum(ensemble[k]["observedLive"] for k in ("print", "replay"))
    genuine_not_accepted = (ensemble["live"]["observedAttack"] +
                            ensemble["live"]["inconclusive"])
    return {
        "auditType": "private_local_four_hypothesis_pad_exploratory",
        "shadowOnly": True,
        "trialCountsByPresentationType": counts,
        "perHypothesis": by_mode,
        "fourHypothesisConsensus": ensemble,
        "researchRiskCounts": {
            "printOrReplayAnyHypothesisObservedLive": attack_any,
            "printOrReplayFourWayLive": attack_consensus,
            "genuineNotFourWayLive": genuine_not_accepted,
            "totalPrintAndReplay": attacks,
            "totalGenuine": counts["live"],
            "exploratoryAnyHypothesisAttackLiveFraction":
                round(attack_any / attacks, 4) if attacks else None,
            "exploratoryGenuineNotFourWayLiveFraction":
                round(genuine_not_accepted / counts["live"], 4)
                if counts["live"] else None,
        },
        "researchSessionContext": {"cameraType": camera_type, "lighting": lighting},
        "allPresentationTypesSampled": all(x > 0 for x in counts.values()),
        "operatorLabelsIndependentlyVerified": False,
        "distinctParticipantsIndependentlyVerified": False,
        "modelFamilyIndependent": False,
        "modelClassMappingValidated": False,
        "modelThresholdCalibrated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "automaticApprovalAllowed": False,
        "releaseRecommendation": "do_not_enable_biometric_identity_approval",
        "caveat": ("Operator-labeled exploratory physical presentation counts. "
                   "V1SE and V2 are correlated models. These are NOT ISO "
                   "APCER/BPCER, official PAD accuracy or authentication. "
                   "No per-trial/person data stored."),
    }


def safe_output(target, samples_dir):
    if target is None:
        return True
    p = Path(target)
    if p.exists() or p.is_symlink() or p.suffix.lower() != ".json":
        return False
    dest = p.resolve()
    source = samples_dir.resolve()
    return (dest != ROOT and ROOT not in dest.parents and
            dest != source and source not in dest.parents and
            dest.parent.is_dir() and not dest.parent.is_symlink())


def write_exclusive(target, report):
    if target is None:
        return
    payload = json.dumps(report, indent=2, sort_keys=True, allow_nan=False)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd = os.open(target, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.write("\n")
    except BaseException:
        Path(target).unlink(missing_ok=True)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True)
    parser.add_argument("--consent-confirmed", action="store_true")
    parser.add_argument("--operator-labels-reviewed", action="store_true",
                        help="Operator must inspect genuine vs physically PRINT/REPLAY labels")
    parser.add_argument("--camera-type", choices=CAMERAS, default="not_recorded")
    parser.add_argument("--lighting", choices=LIGHTING, default="not_recorded")
    parser.add_argument("--aggregate-json", type=Path,
                        help="Optional NEW aggregate-only path outside Git and media folder")
    args = parser.parse_args(argv)
    if not args.consent_confirmed or not args.operator_labels_reviewed:
        print("Consent and physical-presentation labels must be confirmed; "
              "no local media opened.", file=sys.stderr)
        return 2
    if (not scales.safe_local_paths(args.samples, args.aggregate_json) or
            not safe_output(args.aggregate_json, args.samples)):
        print("Private samples and new aggregate output must stay outside Git.",
              file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    os.environ["VOLUNSERVE_PAD_V1SE_SHADOW"] = "1"
    state_v2 = v2.readiness()
    state_v1 = v1.readiness()
    if not (state_v2.get("modelLoaded") and
            state_v2.get("faceDetectorShadow", {}).get("modelLoaded") and
            state_v1.get("modelLoaded")):
        print("Pinned V2, V1SE or YuNet local model unavailable. "
              "Download models with pinned scripts first.", file=sys.stderr)
        return 2
    try:
        trials = collect_private_presentations(args.samples)
        if not any(trials.values()):
            raise ValueError("NO_CONSENTED_PRESENTATION_TRIALS")
        report = summarize_four_hypotheses(trials, camera_type=args.camera_type,
                                           lighting=args.lighting)
        print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
        write_exclusive(args.aggregate_json, report)
        return 0
    except (ValueError, OSError, TypeError):
        print("Private research stopped safely: invalid sample set or output. "
              "No files uploaded or identity approved.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
