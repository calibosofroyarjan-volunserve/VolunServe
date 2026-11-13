"""Private offline dual-input-scale PAD research (staging QA only).

Compares original MiniVisionAI 0..255 BGR input to third-party ONNX-card 0..1
using exactly the same consented local images/videos. No network upload, face
storage, per-file reports, image output, person IDs or independent PAD claims.

Requires already downloaded pinned MiniFASNet/YuNet models and local folder
with live/, print/, replay/ of camera presentations (not original source
photos). The print and replay recordings remain ATTACK-QA input only; they
never become accepted verification credentials.

Usage (from the VolunServe repository root):
  python identity-ai/evaluate_pad_scales_local.py \
    --samples "C:\PAD-Test-Private" --consent-confirmed
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys

import cv2
import numpy as np

import evaluate_passive_pad_local as baseline
import passive_pad_shadow as pad


MODES = (("upstream_raw_0_to_255", 1.0),
         ("converted_card_0_to_1", 1.0 / 255.0))


def interpret_logits(logits):
    """Uncalibrated upstream class-1 shadow status; NEVER a PAD approval."""
    values = np.asarray(logits, dtype=np.float64).reshape(-1)
    if values.shape != (3,) or not np.isfinite(values).all():
        return "inconclusive"
    shifted = values - float(np.max(values))
    exp = np.exp(shifted)
    denom = float(exp.sum())
    if denom <= 0 or not math.isfinite(denom):
        return "inconclusive"
    probs = exp / denom
    confidence = float(probs.max())
    if confidence < pad.SHADOW_THRESHOLD:
        return "inconclusive"
    # Upstream authors' sample inference considers class 1 genuine, but
    # this index is an UNVALIDATED local model observation, not a PAD result.
    return ("model_prefers_live_unvalidated" if int(np.argmax(probs)) == 1
            else "model_prefers_attack_unvalidated")


def assess_paired_frame(image, net=None, cropper=None):
    """One in-memory face crop feeds both scale hypotheses, no files saved."""
    inconclusive = ("inconclusive", "inconclusive")
    try:
        network = net if net is not None else pad._load_net()
        if network is None:
            return inconclusive
        crop = cropper(image) if cropper is not None else pad._face_crop(image)
        if crop is None:
            return inconclusive
        if not isinstance(crop, np.ndarray) or crop.dtype != np.uint8 or crop.shape != (80, 80, 3):
            return inconclusive
        results = []
        for _name, scale in MODES:
            blob = cv2.dnn.blobFromImage(
                crop, scalefactor=scale, size=(80, 80),
                mean=(0, 0, 0), swapRB=False, crop=False)
            with pad._LOCK:
                network.setInput(blob)
                logits = network.forward()
            results.append(interpret_logits(logits))
        return tuple(results)
    except (cv2.error, TypeError, ValueError, OSError, OverflowError):
        return inconclusive


def combine_paired_frames(frame_results):
    """One video is one paired trial, never independent per-frame trials."""
    if not frame_results:
        return ("inconclusive", "inconclusive")
    outputs = []
    for index in (0, 1):
        values = []
        for row in frame_results:
            if not isinstance(row, tuple) or len(row) != 2:
                return ("inconclusive", "inconclusive")
            values.append(row[index])
        outputs.append(baseline.combine_frame_observations(values))
    return tuple(outputs)


def evaluate_paired_media(path, assessor=assess_paired_frame):
    """Read a local camera recording once and evaluate each sampled frame at both scales."""
    undecided = ("inconclusive", "inconclusive")
    try:
        if path.is_symlink() or not path.is_file():
            return undecided
        size = path.stat().st_size
        if not 0 < size <= baseline.MAX_FILE_BYTES:
            return undecided
        if path.suffix.lower() in baseline.IMAGE_SUFFIXES:
            frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
            return combine_paired_frames([assessor(frame)]) if frame is not None else undecided
        if path.suffix.lower() not in baseline.VIDEO_SUFFIXES:
            return undecided
        video = cv2.VideoCapture(str(path))
        if not video.isOpened():
            video.release()
            return undecided
        try:
            fps = video.get(cv2.CAP_PROP_FPS)
            fps = fps if math.isfinite(fps) and 1 <= fps <= 120 else 15
            count = video.get(cv2.CAP_PROP_FRAME_COUNT)
            frames = []
            for second in range(baseline.MAX_VIDEO_FRAMES):
                pos = int(round(second * fps))
                if math.isfinite(count) and count > 0 and pos >= count:
                    break
                video.set(cv2.CAP_PROP_POS_FRAMES, pos)
                ok, frame = video.read()
                if not ok:
                    break
                frames.append(assessor(frame))
            return combine_paired_frames(frames)
        finally:
            video.release()
    except (OSError, ValueError, cv2.error, TypeError, OverflowError):
        return undecided


def gather_paired(samples_dir, assessor=assess_paired_frame):
    results = {kind: [] for kind in baseline.KINDS}
    for kind in baseline.KINDS:
        folder = samples_dir / kind
        if not folder.is_dir() or folder.is_symlink():
            continue
        paths = sorted(
            (p for p in folder.iterdir() if p.is_file() and not p.is_symlink()
             and p.suffix.lower() in baseline.ALLOWED_SUFFIXES),
            key=lambda p: p.name.lower(),
        )[:baseline.MAX_TRIALS_PER_CLASS]
        results[kind] = [evaluate_paired_media(path, assessor) for path in paths]
    return results


def conservative_shadow_status(pair):
    """Two-scale diagnostic agreement only; never authentication/liveness proof.

    Any contradictory, invalid, or uncertain model observation ABSTAINS.
    This does not repair the pretrained model or authorize use as a PAD gate.
    """
    if not isinstance(pair, (tuple, list)) or len(pair) != 2:
        return "inconclusive"
    if pair[0] == pair[1] == "live":
        return "agreement_live_unvalidated"
    if pair[0] == pair[1] == "attack":
        return "agreement_attack_unvalidated"
    return "inconclusive"


def private_shadow_risk_summary(trials):
    """Aggregate-only red flags; any scale calling a print live is unsafe.

    Count physical presentations, NOT individual frames. Operator supplied
    categories are not independently authenticated. No media/score retained.
    """
    per_kind = {}
    for kind in baseline.KINDS:
        pairs = trials.get(kind, [])
        counts = {"trials": len(pairs), "scaleAgreedLive": 0,
                  "scaleAgreedAttack": 0, "conflictOrUncertain": 0,
                  "anyScalePredictedLive": 0}
        for pair in pairs:
            status = conservative_shadow_status(pair)
            if status == "agreement_live_unvalidated":
                counts["scaleAgreedLive"] += 1
            elif status == "agreement_attack_unvalidated":
                counts["scaleAgreedAttack"] += 1
            else:
                counts["conflictOrUncertain"] += 1
            if (isinstance(pair, (tuple, list)) and len(pair) == 2 and
                    any(value == "live" for value in pair)):
                counts["anyScalePredictedLive"] += 1
        per_kind[kind] = counts
    print_risk = per_kind["print"]["anyScalePredictedLive"]
    replay_risk = per_kind["replay"]["anyScalePredictedLive"]
    return {
        "perClass": per_kind,
        "printPresentationsAnyScalePredictedLive": print_risk,
        "replayPresentationsAnyScalePredictedLive": replay_risk,
        "unsafeAttackObservations": print_risk + replay_risk,
        "operatorLabelsNotIndependentlyVerified": True,
        "researchConsensusIsAuthentication": False,
        "identityDecisionUse": "none",
        "independentPadValidated": False,
        "releaseRecommendation": "do_not_enable_biometric_identity_approval",
        "note": (
            "At least one print/replay classed as live under EITHER input "
            "hypothesis is a red flag. Contradictory predictions abstain in "
            "the conservative research view. No preview result proves PAD."
        ),
    }


def aggregate_paired(trials):
    """Only numerical aggregate counts; do not include filenames or per-trial logits."""
    by_scale = {name: {} for name, _scale in MODES}
    disagreements = {}
    for kind in baseline.KINDS:
        pairs = trials.get(kind, [])
        valid_pairs = [x if isinstance(x, tuple) and len(x) == 2
                       else ("inconclusive", "inconclusive") for x in pairs]
        disagreements[kind] = sum(a != b for a, b in valid_pairs)
        for index, (name, _scale) in enumerate(MODES):
            by_scale[name][kind] = [p[index] for p in valid_pairs]
    reports = {
        name: baseline.summarize_observations(aggregate)
        for name, aggregate in by_scale.items()
    }
    per_class_count = {kind: len(trials.get(kind, [])) for kind in baseline.KINDS}
    return {
        "auditType": "private_local_pairwise_pad_scale_evaluation",
        "shadowOnly": True,
        "perScale": reports,
        "pairedTrialStatusDisagreements": disagreements,
        "trialCountsByPresentationType": per_class_count,
        "conservativeShadowRisk": private_shadow_risk_summary(trials),
        "allPresentationTypesSampled": all(x > 0 for x in per_class_count.values()),
        "classOrderSemanticsConfirmedOnRealSamples": False,
        "modelInputScaleValidatedOnRealSamples": False,
        "modelThresholdCalibrated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "caveat": (
            "Exploratory local trial-level shadow outputs only. Counts do not "
            "measure independent population accuracy, prove class correctness, "
            "or authorize identity verification. Repeated subjects, correlated "
            "sessions, lighting and devices require independent validation."
        ),
    }


def safe_local_paths(samples_dir, report_path):
    """Keep biometric media and aggregate reports outside checkout and sample tree."""
    source_repo = Path(__file__).resolve().parent.parent
    if samples_dir.is_symlink() or not samples_dir.is_dir():
        return False
    source = samples_dir.resolve()
    if source == source_repo or source_repo in source.parents:
        return False
    if report_path is not None:
        if report_path.is_symlink():
            return False
        output = report_path.resolve()
        if output == source or source in output.parents:
            return False
        if output == source_repo or source_repo in output.parents:
            return False
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True)
    parser.add_argument("--consent-confirmed", action="store_true",
                        help="Confirm all people shown consented and samples stay local")
    parser.add_argument("--aggregate-json", type=Path, default=None,
                        help="Optional LOCAL aggregate-only JSON outside media folder and git")
    args = parser.parse_args(argv)
    if not args.consent_confirmed:
        print("Consent not confirmed; no local media read or uploaded.", file=sys.stderr)
        return 2
    if not safe_local_paths(args.samples, args.aggregate_json):
        print("Private samples must be outside the git repo; report outside samples and git.",
              file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    readiness = pad.readiness()
    if not readiness.get("modelLoaded"):
        print("Pinned local MiniFASNet model unavailable. Nothing uploaded.", file=sys.stderr)
        return 2
    if not readiness.get("faceDetectorShadow", {}).get("modelLoaded"):
        print("Pinned local YuNet face detector unavailable. Download its pinned model first.",
              file=sys.stderr)
        return 2
    trials = gather_paired(args.samples)
    if not any(trials.values()):
        print("No supported private camera presentation media. Nothing uploaded.", file=sys.stderr)
        return 2
    report = aggregate_paired(trials)
    print(json.dumps(report, sort_keys=True, indent=2, allow_nan=False))
    if args.aggregate_json is not None:
        args.aggregate_json.write_text(
            json.dumps(report, sort_keys=True, indent=2, allow_nan=False),
            encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
