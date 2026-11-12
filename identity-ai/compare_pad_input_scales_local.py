"""PRIVATE local MiniFASNet ONNX preprocessing-scale investigation (QA ONLY).

The original MiniVisionAI ToTensor for NumPy data returns float values in
0..255, while the ONNX model card documents normalization to 0..1.
This tool compares both input scales on the SAME in-memory crop, without
selecting a production mode or claiming a model's classification is correct.

One source image = one trial. Aggregate class-index histograms ONLY are
printed. Class meaning remains unvalidated. No names, filenames, individual
predictions, images, scores, face coordinates or embeddings are written,
uploaded, logged or returned to VolunServe identity approval paths.

Usage:
  py -3.11 identity-ai/compare_pad_input_scales_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA-Retest\pad"
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
from evaluate_passive_pad_local import KINDS, IMAGE_SUFFIXES, MAX_FILE_BYTES

REPO_ROOT = Path(__file__).resolve().parents[1]
MAX_TRIALS = 100
MODES = (("source_raw_0_to_255", 1.0), ("onnx_card_0_to_1", 1.0 / 255.0))
REASONS = ("class_0", "class_1", "class_2", "inconclusive")


def classify_crop_by_mode(crop, scale, net):
    """No self-calibration, threshold change, PAD decision, or class semantics."""
    if not isinstance(crop, np.ndarray) or crop.shape != (80, 80, 3):
        return "inconclusive"
    try:
        blob = cv2.dnn.blobFromImage(
            crop, scalefactor=scale, size=(80, 80), mean=(0, 0, 0),
            swapRB=False, crop=False,
        )
        with pad._LOCK:
            net.setInput(blob)
            raw = np.asarray(net.forward(), dtype=np.float64).reshape(-1)
        if raw.size != 3 or not np.isfinite(raw).all():
            return "inconclusive"
        return f"class_{int(np.argmax(raw))}"
    except (cv2.error, ValueError, TypeError, OverflowError):
        return "inconclusive"


def assess_local_image(image, net):
    """Return only two coarse uncalibrated class indices from same face crop."""
    try:
        crop = pad._face_crop(image)
        if crop is None:
            return {mode: "inconclusive" for mode, _ in MODES}
        return {mode: classify_crop_by_mode(crop, factor, net)
                for mode, factor in MODES}
    except (cv2.error, ValueError, TypeError):
        return {mode: "inconclusive" for mode, _ in MODES}


def read_local_image(path):
    try:
        if (path.is_symlink() or not path.is_file() or
                path.suffix.lower() not in IMAGE_SUFFIXES or
                not 0 < path.stat().st_size <= MAX_FILE_BYTES):
            return None
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if (image is None or image.ndim != 3 or image.shape[2] != 3 or
                image.dtype != np.uint8 or
                not 120 <= image.shape[0] <= 3000 or
                not 120 <= image.shape[1] <= 3000):
            return None
        return image
    except (OSError, ValueError, cv2.error):
        return None


def aggregate(root, net, assessor=assess_local_image):
    """Aggregate class-index counts, never per-image or identifying values."""
    report = {}
    for label in KINDS:
        folder = root / label
        histograms = {mode: Counter() for mode, _ in MODES}
        if folder.is_dir() and not folder.is_symlink():
            paths = sorted((
                p for p in folder.iterdir()
                if p.is_file() and not p.is_symlink()
                and p.suffix.lower() in IMAGE_SUFFIXES
            ), key=lambda p: p.name.lower())[:MAX_TRIALS]
            for p in paths:
                image = read_local_image(p)
                if image is None:
                    result = {mode: "inconclusive" for mode, _ in MODES}
                else:
                    result = assessor(image, net)
                for mode, _ in MODES:
                    key = result.get(mode, "inconclusive")
                    histograms[mode][key if key in REASONS else "inconclusive"] += 1
        report[label] = {
            "trials": sum(histograms[MODES[0][0]].values()),
            "classIndexCountsByInputScale": {
                mode: {reason: histograms[mode][reason] for reason in REASONS}
                for mode, _ in MODES
            },
        }
    return {
        "localOnly": True,
        "experimentalDiagnosticOnly": True,
        "independentPadValidated": False,
        "inputScaleResolved": False,
        "classIndexSemanticsValidated": False,
        "identityDecisionUse": "none",
        "source": "MiniVisionAI ToTensor raw pixels vs ONNX model card normalized pixels",
        "perClass": report,
        "caveat": (
            "These counts only compare input scales, NOT actual PAD validity. "
            "Do not choose labels, preprocessing, confidence thresholds or account "
            "approval rules based on one sample or an unverified model conversion."
        ),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=Path, required=True,
                        help="Private local pad/ folder with live, print, replay")
    args = parser.parse_args(argv)
    sample_root = args.samples.expanduser()
    resolved = sample_root.resolve()
    if (sample_root.is_symlink() or not resolved.is_dir() or
            resolved == REPO_ROOT or REPO_ROOT in resolved.parents):
        print("Choose a PRIVATE local folder outside the source repository.",
              file=sys.stderr)
        return 2
    os.environ["VOLUNSERVE_PASSIVE_PAD_SHADOW"] = "1"
    model = pad._load_net()
    if model is None:
        print("Pinned MiniFASNet ONNX weights not available.", file=sys.stderr)
        return 2
    report = aggregate(resolved, model)
    if not any(v["trials"] for v in report["perClass"].values()):
        print("No supported local consented images; no data uploaded.", file=sys.stderr)
        return 2
    print(json.dumps(report, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
