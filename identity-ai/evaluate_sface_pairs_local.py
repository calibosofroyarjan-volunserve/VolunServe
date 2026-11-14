"""Private, local SFace face-pair evaluation — NOT an identity approval tool.

Use only with informed consent from all pictured people. No data is sent to
VolunServe, GitHub, Render or any outside service; nothing is written back.
Example local-only usage:
  python identity-ai/evaluate_sface_pairs_local.py \
      --pairs-csv /private/eval/pairs.csv --image-root /private/eval/images \
      --threshold 0.4 --consent-confirmed

CSV fields: id_image,selfie_image,same_person
same_person: same | different. Images are paths RELATIVE to --image-root.
A real operator must choose/evaluate the threshold; 0.4 above is a syntax
example, NOT a validated/recommended production threshold.

Scoring detects neither government ID authenticity nor liveness/PAD. Printed
FAR/FRR are observed on THIS sample only, never population-certified.
"""
import argparse
import csv
from io import BytesIO
from pathlib import Path


MAX_PAIRS = 1000
MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024


def _within_root(root, relative):
    # Never disclose bad private paths in exceptions or terminal logs.
    if not isinstance(relative, str) or len(relative) > 256 or not relative:
        return None
    p = Path(relative)
    if p.is_absolute() or p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        return None
    try:
        path = (root / p).resolve(strict=True)
        path.relative_to(root)
        if not path.is_file() or path.stat().st_size > MAX_IMAGE_FILE_BYTES:
            return None
        return path
    except (OSError, ValueError, RuntimeError):
        return None


def _private_decode(path, cv2, np, Image, dimensions_allowed):
    if path is None:
        return None
    try:
        with path.open("rb") as f:
            raw = f.read(MAX_IMAGE_FILE_BYTES + 1)
        if len(raw) < 12 or len(raw) > MAX_IMAGE_FILE_BYTES:
            return None
        with Image.open(BytesIO(raw)) as image:
            if not dimensions_allowed(image.width, image.height):
                return None
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.ndim != 3 or frame.shape[2] != 3:
            return None
        return frame
    except Exception:
        # No exception/filename/raw bytes ever logged or returned to caller.
        return None


def evaluate(args):
    if not args.consent_confirmed:
        raise ValueError("Informed photo consent must be confirmed locally.")
    root = Path(args.image_root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Local image directory unavailable.")
    import cv2
    import numpy as np
    from PIL import Image
    import os
    import sface_shadow
    import yunet_shadow
    from image_upload_bounds import image_dimensions_allowed
    from sface_pair_metrics import summarize_pairs

    # The experimental ONNX models are pinned; never download or fall back to
    # fake/random embeddings. Still no automatic identity decision is allowed.
    os.environ["VOLUNSERVE_SFACE_SHADOW"] = "1"
    if (not sface_shadow.readiness().get("modelLoaded") or
            not yunet_shadow.readiness().get("modelLoaded")):
        raise ValueError("Pinned local SFace/YuNet model unavailable; no scores were computed.")

    records = []
    try:
        with open(args.pairs_csv, "r", encoding="utf8", newline="") as file:
            reader = csv.DictReader(file)
            if not reader.fieldnames or set(reader.fieldnames) != {
                "id_image", "selfie_image", "same_person",
            }:
                raise ValueError("CSV must have id_image,selfie_image,same_person columns.")
            for record in reader:
                if len(records) >= MAX_PAIRS:
                    raise ValueError("At most 1000 consented local test pairs are supported.")
                label = str(record.get("same_person") or "").strip().lower()
                if label not in ("same", "different"):
                    raise ValueError("Invalid same_person label.")
                first = _private_decode(
                    _within_root(root, record.get("id_image")), cv2, np, Image,
                    image_dimensions_allowed)
                second = _private_decode(
                    _within_root(root, record.get("selfie_image")), cv2, np, Image,
                    image_dimensions_allowed)
                score = None
                if first is not None and second is not None:
                    result = sface_shadow.assess_pair_shadow(first, second)
                    candidate = result.get("cosineSimilarity")
                    if result.get("status") == "similarity_observed_unvalidated":
                        score = candidate
                # Only ephemeral aggregate research scores retained in RAM.
                records.append((label == "same", score))
                del first, second
    except OSError:
        raise ValueError("Private CSV manifest cannot be read.") from None
    if not records:
        raise ValueError("No consented local test pairs were supplied.")
    return summarize_pairs(records, args.threshold)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pairs-csv", required=True)
    parser.add_argument("--image-root", required=True)
    parser.add_argument("--threshold", type=float, required=True)
    parser.add_argument("--consent-confirmed", action="store_true")
    args = parser.parse_args()
    try:
        results = evaluate(args)
    except Exception:
        print("LOCAL_SFACE_EVALUATION_BLOCKED: check consent, input manifest, pinned models and local runtime. No files or identities printed.")
        raise SystemExit(2) from None
    print("SFACE_LOCAL_RESEARCH_ONLY_NOT_VALIDATED")
    for key in (
        "sameScored", "differentScored", "sameUnscorable", "differentUnscorable",
        "falseAccepts", "falseRejects", "trueAccepts", "trueRejects",
        "threshold", "observedFalseAcceptRate", "observedFalseRejectRate",
        "sampleAdequacy",
    ):
        print(f"{key}={results[key]}")
    print("No auto-approval; no liveness, ID-issuer or population accuracy certification.")


if __name__ == "__main__":
    main()
