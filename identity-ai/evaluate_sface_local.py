"""PRIVATE, OFFLINE exploratory SFace 1-to-1 face-matching evaluation.

Folder shape (outside the Git repository):
  SFace-Test-Private/
    same/pair001/first.jpg
    same/pair001/second.jpg
    different/pair002/first.jpg
    different/pair002/second.jpg

Each pair is ONE trial, using two different consented camera captures.
'same' contains the same consenting person in both captures.
'different' contains two different consenting people.
No government IDs, tokens, real profiles or other sensitive metadata are needed.

Print aggregate counts ONLY: no filenames, scores per person, embeddings,
photos or video are printed, transmitted, saved or committed.
This is NOT calibrated biometric identity verification, independent PAD
certification or authorization to automatically promote Verified Residents.
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys

import cv2
import sface_shadow as face

CLASSES = ("same", "different")
IMAGE_EXTENSIONS = frozenset((".jpg", ".jpeg", ".png", ".webp"))
MAX_PAIRS_PER_CLASS = 100
MAX_BYTES_PER_IMAGE = 10 * 1024 * 1024
# Fixed comparison grid ONLY. Do not choose a "winning" threshold on a tiny set.
EXPLORATORY_THRESHOLDS = (0.25, 0.35, 0.45, 0.55, 0.65)
REPO_ROOT = Path(__file__).resolve().parents[1]


def _inside(parent: Path, child: Path) -> bool:
    return parent == child or parent in child.parents


def _safe_image(image_path):
    """Reject symlinks, excessive files and invalid decodes before inference."""
    try:
        if image_path.is_symlink() or not image_path.is_file():
            return None
        length = image_path.stat().st_size
        if not 0 < length <= MAX_BYTES_PER_IMAGE:
            return None
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None or image.ndim != 3 or image.shape[2] != 3:
            return None
        if not 120 <= image.shape[0] <= 3000 or not 120 <= image.shape[1] <= 3000:
            return None
        return image
    except (OSError, ValueError, cv2.error):
        return None


def evaluate_pair(directory, assessor=face.assess_pair_shadow):
    """Use only a pair with precisely two supported files; never print paths."""
    try:
        if directory.is_symlink() or not directory.is_dir():
            return None
        members = list(directory.iterdir())
        if len(members) != 2 or any(
            p.is_symlink() or not p.is_file() or p.suffix.lower() not in IMAGE_EXTENSIONS
            for p in members
        ):
            return None
        images = [_safe_image(p) for p in sorted(members, key=lambda p: p.name)]
        if any(image is None for image in images):
            return None
        observed = assessor(images[0], images[1])
        if not isinstance(observed, dict) or observed.get("status") != "similarity_observed_unvalidated":
            return None
        value = observed.get("cosineSimilarity")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        score = float(value)
        return score if math.isfinite(score) and -1 <= score <= 1 else None
    except (OSError, ValueError, cv2.error):
        return None


def gather(root, assessor=face.assess_pair_shadow):
    """Return private ephemeral scores; caller may report AGGREGATES ONLY."""
    observations = {}
    for label in CLASSES:
        folder = root / label
        if folder.is_symlink() or not folder.is_dir():
            observations[label] = []
            continue
        entries = sorted(
            (p for p in folder.iterdir() if p.is_dir() and not p.is_symlink()),
            key=lambda p: p.name,
        )[:MAX_PAIRS_PER_CLASS]
        observations[label] = [evaluate_pair(p, assessor) for p in entries]
    return observations


def summarize(observations):
    """Conservative, per-pair exploratory rates; never leak score distributions."""
    same = observations.get("same", [])
    different = observations.get("different", [])
    def valid_scores(values):
        return [float(x) for x in values
                if not isinstance(x, bool) and isinstance(x, (int, float))
                and math.isfinite(x) and -1 <= x <= 1]
    same_valid = valid_scores(same)
    diff_valid = valid_scores(different)
    metrics = []
    for threshold in EXPLORATORY_THRESHOLDS:
        # Fail-closed inconclusive same-person pairs count as not accepted.
        false_nonmatch = sum(x < threshold for x in same_valid) + len(same) - len(same_valid)
        false_match = sum(x >= threshold for x in diff_valid)
        metrics.append({
            "exploratoryThreshold": threshold,
            "samePersonNotAccepted": false_nonmatch,
            "differentPersonPotentiallyAccepted": false_match,
            "samePersonNotAcceptedFraction": (round(false_nonmatch / len(same), 4)
                                               if same else None),
            "differentPersonPotentiallyAcceptedFraction": (
                round(false_match / len(different), 4) if different else None),
        })
    return {
        "shadowOnly": True,
        "realDeviceAccuracyValidated": False,
        "thresholdCalibrated": False,
        "independentFaceMatchValidated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "samePersonPairs": len(same),
        "differentPersonPairs": len(different),
        "samePersonInconclusive": len(same) - len(same_valid),
        "differentPersonInconclusive": len(different) - len(diff_valid),
        "exploratoryComparisons": metrics,
        "caveat": (
            "Private per-pair exploratory QA only. Correlated devices, subject selection, "
            "small samples and unmeasured demographic variation make these rates "
            "unsuitable for threshold calibration or automatic identity approval."
        ),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True,
                        help="Private LOCAL folder outside Git containing same/ and different/")
    parser.add_argument("--aggregate-json", type=Path, default=None,
                        help="Optional local JSON aggregate only; never individual scores")
    args = parser.parse_args(argv)
    root = args.samples.resolve()
    if args.samples.is_symlink() or _inside(REPO_ROOT, root):
        print("Refusing symlink or Git repository sample folder.", file=sys.stderr)
        return 2
    if not all((root / k).is_dir() and not (root / k).is_symlink() for k in CLASSES):
        print("Missing private same/ and different/ pair folders.", file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_SFACE_SHADOW"] = "1"
    if not face.readiness().get("modelLoaded"):
        print("Verified local SFace weights unavailable; download pinned weights first.",
              file=sys.stderr)
        return 2
    observations = gather(root)
    if not all(observations.values()):
        print("Both classes require at least one valid-looking pair folder.", file=sys.stderr)
        return 2
    report = summarize(observations)
    # Drop ephemeral scores before writing any JSON.
    del observations
    print(json.dumps(report, sort_keys=True, indent=2))
    if args.aggregate_json is not None:
        target = args.aggregate_json.resolve()
        if (args.aggregate_json.is_symlink() or _inside(root, target) or
                _inside(REPO_ROOT, target)):
            print("Refusing aggregate output inside sample folder or Git.", file=sys.stderr)
            return 2
        target.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
