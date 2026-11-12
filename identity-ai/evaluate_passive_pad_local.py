"""PRIVATE local-only shadow PAD evaluation. Does NOT upload, retain or certify faces.

Usage:
  python identity-ai/download_passive_pad_model.py
  python identity-ai/evaluate_passive_pad_local.py --samples PATH_TO_PRIVATE_SAMPLES

Required subfolders: live/, print/, replay/
- live: camera captures of a consenting REAL person
- print: camera captures of a printed face photo (not original digital file)
- replay: camera captures of another screen PLAYING a face video (not original video)

Allowed inputs: .jpg/.jpeg/.png/.webp and .mp4/.mov/.avi/.mkv.
Each video file counts as one trial; at most 8 frames are sampled.
Do not put any sensitive samples in the repo or GitHub issues.
No sample file names, individual scores or images leave this process.
Aggregate counters only printed; optional aggregate JSON saved when requested.
This is an exploratory shadow evaluation, not ISO/IEC 30107-3 certification.
"""
import argparse
import json
import os
from pathlib import Path
import sys

import cv2

import passive_pad_shadow as pad

KINDS = ("live", "print", "replay")
IMAGE_SUFFIXES = frozenset((".jpg", ".jpeg", ".png", ".webp"))
VIDEO_SUFFIXES = frozenset((".mp4", ".mov", ".avi", ".mkv"))
ALLOWED_SUFFIXES = IMAGE_SUFFIXES | VIDEO_SUFFIXES
MAX_TRIALS_PER_CLASS = 100
MAX_FILE_BYTES = 30 * 1024 * 1024
MAX_VIDEO_FRAMES = 8
OBSERVED_LIVE = "model_prefers_live_unvalidated"
OBSERVED_ATTACK = "model_prefers_attack_unvalidated"


def summarize_observations(observations):
    """Aggregate one result per presentation; never disclose filenames or images."""
    result = {"shadowOnly": True, "independentPadValidated": False,
              "identityDecisionUse": "none", "thresholdCalibrated": False,
              "perClass": {}}
    for kind in KINDS:
        values = observations.get(kind, [])
        totals = {"trials": len(values), "observedLive": values.count("live"),
                  "observedAttack": values.count("attack"),
                  "inconclusive": values.count("inconclusive")}
        result["perClass"][kind] = totals
    attack_n = sum(result["perClass"][k]["trials"] for k in ("print", "replay"))
    attack_live = sum(result["perClass"][k]["observedLive"] for k in ("print", "replay"))
    genuine = result["perClass"]["live"]
    result["exploratoryAttackAcceptedFraction"] = (
        round(attack_live / attack_n, 4) if attack_n else None)
    result["exploratoryGenuineNotAcceptedFraction"] = (
        round((genuine["observedAttack"] + genuine["inconclusive"]) /
              genuine["trials"], 4) if genuine["trials"] else None)
    result["caveat"] = (
        "Local per-file exploratory trial counts only; correlated frames/devices, "
        "unmeasured population variance and uncalibrated threshold. "
        "NOT independent PAD certification or evidence for Verified Resident."
    )
    return result


def combine_frame_observations(values):
    """Conservative: if ANY frame resembles live, attack clip could be accepted."""
    if not values or any(v in ("unavailable", "disabled") for v in values):
        return "inconclusive"
    if any(v == OBSERVED_LIVE for v in values):
        return "live"
    if all(v == OBSERVED_ATTACK for v in values):
        return "attack"
    return "inconclusive"


def evaluate_media(path, assessor=pad.assess_frame_shadow):
    """Read local files only. One video file = one trial, not 8 independent trials."""
    try:
        if path.stat().st_size > MAX_FILE_BYTES or path.stat().st_size == 0:
            return "inconclusive"
        if path.suffix.lower() in IMAGE_SUFFIXES:
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                return "inconclusive"
            return combine_frame_observations([assessor(image).get("status")])
        if path.suffix.lower() not in VIDEO_SUFFIXES:
            return "inconclusive"
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            cap.release()
            return "inconclusive"
        try:
            fps = cap.get(cv2.CAP_PROP_FPS)
            fps = fps if 1 <= fps <= 120 else 15
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            observed = []
            # At most the first 8 seconds, one frame per second; avoids
            # treating adjacent highly-correlated frames as separate trials.
            for second in range(MAX_VIDEO_FRAMES):
                index = int(round(second * fps))
                if frame_count > 0 and index >= frame_count:
                    break
                cap.set(cv2.CAP_PROP_POS_FRAMES, index)
                ok, frame = cap.read()
                if not ok:
                    break
                observed.append(assessor(frame).get("status"))
            return combine_frame_observations(observed)
        finally:
            cap.release()
    except (OSError, ValueError, cv2.error):
        return "inconclusive"


def gather(samples_dir, assessor=pad.assess_frame_shadow):
    observations = {}
    for kind in KINDS:
        folder = samples_dir / kind
        if not folder.is_dir() or folder.is_symlink():
            observations[kind] = []
            continue
        files = sorted((p for p in folder.iterdir()
                        if p.is_file() and not p.is_symlink()
                        and p.suffix.lower() in ALLOWED_SUFFIXES),
                       key=lambda p: p.name.lower())[:MAX_TRIALS_PER_CLASS]
        observations[kind] = [evaluate_media(p, assessor) for p in files]
    return observations


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True,
                        help="Local PRIVATE folder containing live/, print/, replay/")
    parser.add_argument("--aggregate-json", type=Path, default=None,
                        help="Optional LOCAL aggregate-only report, never raw samples")
    args = parser.parse_args(argv)
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    if not args.samples.is_dir():
        print("No local PAD samples directory found; nothing uploaded.", file=sys.stderr)
        return 2
    ready = pad.readiness()
    if not ready.get("modelLoaded"):
        print("Verified local ONNX model is unavailable. Download the pinned model first.",
              file=sys.stderr)
        return 2
    results = gather(args.samples)
    if not any(results.values()):
        print("No supported consenting local presentation samples; nothing uploaded.",
              file=sys.stderr)
        return 2
    # Do not publish a partial dataset as a complete live/print/replay assessment.
    # The three classes are required; fewer classes cannot characterize PAD risk.
    if not all(results.get(kind) for kind in KINDS):
        print("Local PAD evaluation requires live/, print/ and replay/ samples.",
              file=sys.stderr)
        return 2
    report = summarize_observations(results)
    print(json.dumps(report, sort_keys=True, indent=2))
    if args.aggregate_json is not None:
        # Refuse to write reports into samples folder; avoid accidental overwrites.
        target = args.aggregate_json.resolve()
        if args.samples.resolve() == target or args.samples.resolve() in target.parents:
            print("Refusing to save an aggregate report inside the sample folder.",
                  file=sys.stderr)
            return 2
        if target.is_symlink():
            print("Refusing a symlinked report target.", file=sys.stderr)
            return 2
        target.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
