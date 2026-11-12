"""Private, consent-based offline 1:1 face-match measurement.

Uses the actual VolunServe run_face_verification logic on images stored ONLY
on the tester's own computer; does not contact Firebase, Render or the web.
Never prints identity images, filenames, identifiers or per-pair scores.
No auto-approval; no claims of biometric/PAD certification.

Run locally with the production AI dependencies installed:
  python identity-ai/qa_offline_match.py /private-eval/pairs.jsonl

Manifest: JSONL, each line with only:
  {"label":"genuine"|"impostor","reference":"images/a.jpg","probe":"images/b.jpg"}
Paths must stay inside the local directory containing the manifest.
Do not commit the manifest or photos to a GitHub repository.
"""
import argparse
import json
import math
from pathlib import Path

MAX_PAIRS = 2000
MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_THRESHOLD = 0.78

def wilson95(events, total):
    if not total:
        return None
    z = 1.959963984540054
    p = events / total
    denom = 1 + z*z/total
    center = (p + z*z/(2*total))/denom
    margin = z * math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denom
    return {"lower": max(0.0, center-margin), "upper": min(1.0, center+margin)}

def metric(events, total):
    return {"events": events, "trials": total,
            "rate": events/total if total else None,
            "wilson95": wilson95(events,total)}

def parse_manifest(path):
    source = Path(path).expanduser().resolve(strict=True)
    if source.suffix.lower() != ".jsonl":
        raise ValueError("MANIFEST_JSONL_REQUIRED")
    # A private manifest and its face/ID photos must NEVER live in the
    # checkout: this stops accidental commits and Docker build-context copies.
    repo_root = Path(__file__).resolve().parent.parent
    if source.is_relative_to(repo_root):
        raise ValueError("PRIVATE_MEDIA_FOLDER_MUST_BE_OUTSIDE_REPOSITORY")
    root = source.parent
    trials = []
    seen = set()
    with source.open("rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            if len(trials) >= MAX_PAIRS:
                raise ValueError("TOO_MANY_PAIRS")
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError("BAD_MANIFEST_LINE") from exc
            if not isinstance(record, dict) or set(record) != {"label","reference","probe"}:
                raise ValueError("PRIVATE_MANIFEST_FIELDS_FORBIDDEN")
            if record["label"] not in {"genuine","impostor"}:
                raise ValueError("INVALID_PAIR_LABEL")
            paths = []
            for key in ("reference", "probe"):
                part = record[key]
                if not isinstance(part, str) or not part or "://" in part:
                    raise ValueError("INVALID_LOCAL_IMAGE_PATH")
                target = (root / part).resolve()
                if not target.is_relative_to(root) or target.suffix.lower() not in ALLOWED_EXTENSIONS:
                    raise ValueError("LOCAL_IMAGE_OUTSIDE_PRIVATE_DIRECTORY")
                paths.append(target)
            pair_key = (str(paths[0]), str(paths[1]))
            if pair_key in seen:
                raise ValueError("DUPLICATED_COMPARISON")
            seen.add(pair_key)
            trials.append((record["label"], paths[0], paths[1]))
    return trials

def score_pair_locally(reference, probe):
    """Match the current production AI scoring pipeline; failure to acquire is unscorable."""
    try:
        if reference == probe:
            return None
        for item in (reference,probe):
            if not item.is_file() or item.stat().st_size > MAX_IMAGE_BYTES:
                return None
        ref_bytes = reference.read_bytes()
        probe_bytes = probe.read_bytes()
        if ref_bytes == probe_bytes:  # Never inflate accuracy with reused ID media.
            return None
        # Import dependencies only for genuine offline runs, not synthetic tests.
        from main import run_face_verification
        result = run_face_verification(
            uid="private_offline_measurement_only",
            id_document_bytes=ref_bytes,
            selfie_bytes=probe_bytes,
        )
        score = result.get("matchScore")
        if isinstance(score,(float,int)) and not isinstance(score,bool) and math.isfinite(score) and 0<=score<=1:
            return float(score)
    except Exception:
        # No image names, internal exception messages, user data or stack traces.
        pass
    return None

def evaluate(trials, threshold=DEFAULT_THRESHOLD, scorer=score_pair_locally):
    if not isinstance(threshold,(float,int)) or not math.isfinite(threshold) or threshold<=0 or threshold>1:
        raise ValueError("INVALID_THRESHOLD")
    total = {"genuine":0,"impostor":0}
    unscorable = {"genuine":0,"impostor":0}
    errors = {"genuine":0,"impostor":0}
    for label, reference, probe in trials:
        if label not in total:
            raise ValueError("INVALID_PAIR_LABEL")
        total[label] += 1
        score = scorer(reference,probe)
        if score is None:
            unscorable[label] += 1
            continue
        if isinstance(score,bool) or not isinstance(score,(float,int)) or not math.isfinite(score) or score<0 or score>1:
            raise ValueError("INVALID_FACE_SCORE")
        if label == "genuine" and score < threshold:
            errors[label] += 1
        if label == "impostor" and score >= threshold:
            errors[label] += 1
    genuine_scored = total["genuine"] - unscorable["genuine"]
    impostor_scored = total["impostor"] - unscorable["impostor"]
    return {
        "schema": "volunserve_private_offline_face_accuracy_v1",
        "privacy": "aggregate_only_no_IDs_no_images_no_paths_no_pairwise_scores",
        "engine": "production_run_face_verification_pipeline",
        "threshold": threshold,
        "falseMatchRate": metric(errors["impostor"],impostor_scored),
        "falseNonMatchRate": metric(errors["genuine"],genuine_scored),
        "failureToAcquire": {
            "genuine": metric(unscorable["genuine"],total["genuine"]),
            "impostor": metric(unscorable["impostor"],total["impostor"]),
        },
        "allGenuineAttemptsNotMatchedOrUnscorable": metric(
            errors["genuine"] + unscorable["genuine"], total["genuine"]),
        "pairedMatchingMeasurementsPresent": genuine_scored>0 and impostor_scored>0,
        "accuracyIndependentlyValidated": False,
        "independentPadValidated": False,
        "issuerAuthenticityValidated": False,
        "automaticResidentVerificationAllowed": False,
        "onlyAuthorizedAdminMayVerify": True,
        "note": "FMR and FNMR use scorable pairs only. Failure to acquire is separate. "
                "Wilson intervals assume independent comparisons and may overstate "
                "certainty with repeated people/photos. Small pilots are NOT certification. "
                "No camera PAD or ID issuer checks are performed."
    }

def main():
    parser = argparse.ArgumentParser(description="Offline aggregate-only face comparison audit")
    parser.add_argument("manifest", help="Private JSONL manifest, never commit or upload")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                        help="Local trial threshold; does not modify Render or production")
    args = parser.parse_args()
    try:
        trials = parse_manifest(args.manifest)
        result = evaluate(trials, args.threshold)
    except Exception:
        print("BLOCKED: INVALID_PRIVATE_EVALUATION_INPUT_OR_RUNTIME")
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
