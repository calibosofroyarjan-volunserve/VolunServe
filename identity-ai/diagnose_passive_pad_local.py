"""Private local PAD diagnosis for unexplained "inconclusive" results.

Reads consenting local test images only; reports per-class aggregate REASON counts.
No photo bytes, face coordinates, biometric values, filenames or embeddings are
printed, saved, committed or uploaded. Staging/production settings unchanged.

Run:
  py -3.11 identity-ai/diagnose_passive_pad_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\pad"
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import sys

import cv2
import numpy as np

import passive_pad_shadow as pad
import yunet_shadow as yunet
from evaluate_passive_pad_local import KINDS, IMAGE_SUFFIXES, MAX_FILE_BYTES

MAX_TRIALS_PER_CLASS = 100
CATEGORIES = frozenset((
    "file_unreadable",
    "invalid_image_dimensions",
    "face_not_detected",
    "multiple_faces",
    "face_detection_inconclusive",
    "insufficient_face_context",
    "model_inconclusive",
    "model_prefers_live_unvalidated",
    "model_prefers_attack_unvalidated",
))


def context_inside_frame(shape, box):
    """Mirror PAD's 2.7x context requirement without publishing face geometry."""
    if len(shape) < 2 or box is None or len(box) != 4:
        return False
    height, width = shape[:2]
    x, y, w, h = box
    side = max(w, h) * 2.7
    left = int(round(x + w / 2 - side / 2))
    top = int(round(y + h / 2 - side / 2))
    right = int(round(x + w / 2 + side / 2))
    bottom = int(round(y + h / 2 + side / 2))
    return left >= 0 and top >= 0 and right <= width and bottom <= height


def diagnose_frame(image, detector=yunet, classifier=pad):
    """Return ONLY one coarse reason. No biometrics or raw scores."""
    if (not isinstance(image, np.ndarray) or image.dtype != np.uint8 or
            image.ndim != 3 or image.shape[2] != 3):
        return "file_unreadable"
    height, width = image.shape[:2]
    if not (120 <= height <= 3000 and 120 <= width <= 3000):
        return "invalid_image_dimensions"

    result = detector.inspect_frame(image)
    if result == "no_face":
        return "face_not_detected"
    if result == "multiple_faces":
        return "multiple_faces"
    if result != "one_face_unvalidated":
        return "face_detection_inconclusive"
    box = detector.single_face_box(image)
    if box is None:
        return "face_detection_inconclusive"
    if not context_inside_frame(image.shape, box):
        return "insufficient_face_context"
    observed = classifier.assess_frame_shadow(image)
    status = observed.get("status") if isinstance(observed, dict) else None
    if status in ("model_prefers_live_unvalidated", "model_prefers_attack_unvalidated"):
        return status
    return "model_inconclusive"


def diagnose_local_file(path, assessor=diagnose_frame):
    try:
        if (path.is_symlink() or not path.is_file() or
                path.suffix.lower() not in IMAGE_SUFFIXES or
                not 0 < path.stat().st_size <= MAX_FILE_BYTES):
            return "file_unreadable"
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        return assessor(image)
    except (OSError, ValueError, cv2.error):
        return "file_unreadable"


def aggregate(root, assessor=diagnose_local_file):
    report = {}
    for kind in KINDS:
        folder = root / kind
        counts = Counter()
        if folder.is_dir() and not folder.is_symlink():
            paths = sorted((p for p in folder.iterdir()
                            if p.is_file() and not p.is_symlink() and
                            p.suffix.lower() in IMAGE_SUFFIXES),
                           key=lambda p: p.name.lower())[:MAX_TRIALS_PER_CLASS]
            for path in paths:
                reason = assessor(path)
                counts[reason if reason in CATEGORIES else "model_inconclusive"] += 1
        report[kind] = {"trials": sum(counts.values()),
                        "reasons": {name: counts[name] for name in sorted(counts)}}
    return {
        "localOnly": True,
        "shadowOnly": True,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
        "perClass": report,
        "note": ("Coarse diagnostics only: insufficient context means the 2.7x face "
                 "crop exceeds the camera frame. Adjust distance and lighting; "
                 "do NOT disable security guards or grant identity approval."),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True)
    args = parser.parse_args(argv)
    root = args.samples
    if root.is_symlink() or not root.is_dir():
        print("Missing or invalid local private samples folder.", file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    if not pad.readiness().get("modelLoaded") or not yunet.readiness().get("modelLoaded"):
        print("Locally downloaded/verified PAD or YuNet model unavailable.", file=sys.stderr)
        return 2
    report = aggregate(root)
    if not any(group["trials"] for group in report["perClass"].values()):
        print("No local supported image samples.", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
