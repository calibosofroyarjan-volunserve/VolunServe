"""VolunServe PRIVATE multi-session PAD counts aggregator; no biometric media.

Accepts only local, bounded, fixed-schema aggregate JSON files exported by the
consented staging-only laptop pilot. Never opens a camera, accesses credentials,
calls the internet, or claims independent population validation.

Sample invocation (PowerShell):
  py -3.11 identity-ai/pad_multisession_aggregate_local.py --aggregate-only-consent \
    --session C:\PAD-Research\Session-01.json --session C:\PAD-Research\Session-02.json
"""
import argparse
import json
import os
from pathlib import Path
import sys

KINDS = ("live", "print", "replay")
MODES = ("upstream_raw_0_to_255", "converted_card_0_to_1")
COUNT_FIELDS = ("trials", "observedLive", "observedAttack", "inconclusive")
LIGHTING = ("daylight", "indoor_artificial", "low_light", "not_recorded")
CAMERAS = ("laptop_built_in", "external_usb", "phone_webcam", "not_recorded")
MAX_SESSIONS = 30
MAX_INPUT_BYTES = 32000
MAX_TRIALS_PER_CATEGORY = 10
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class InvalidAggregate(ValueError):
    """A report fails the no-media / fixed count schema or safety contract."""


def exact_keys(record, keys):
    if type(record) is not dict or set(record) != set(keys):
        raise InvalidAggregate("Unexpected or missing JSON fields; this is not a safe aggregate report.")


def count(value, maximum):
    if type(value) is not int or not 0 <= value <= maximum:
        raise InvalidAggregate("Malformed count.")
    return value


def validate_report(report):
    """Reject unrecognized fields, personal media and dishonest readiness flags.

    Return only whitelisted numerical and enum values. All original note/text
    fields are discarded, never displayed or combined into a new report.
    """
    if type(report) is not dict:
        raise InvalidAggregate("Expected aggregate JSON object.")
    expected = {
        "auditType", "shadowOnly", "perScale",
        "pairedTrialStatusDisagreements", "trialCountsByPresentationType",
        "conservativeShadowRisk", "allPresentationTypesSampled",
        "classOrderSemanticsConfirmedOnRealSamples",
        "modelInputScaleValidatedOnRealSamples",
        "modelThresholdCalibrated", "independentPadValidated",
        "identityDecisionUse", "caveat",
    }
    if "researchSessionContext" in report:
        expected.add("researchSessionContext")
    exact_keys(report, expected)
    if (report["auditType"] != "private_local_pairwise_pad_scale_evaluation"
            or report["shadowOnly"] is not True
            or report["identityDecisionUse"] != "none"
            or any(report[k] is not False for k in (
                "classOrderSemanticsConfirmedOnRealSamples",
                "modelInputScaleValidatedOnRealSamples",
                "modelThresholdCalibrated", "independentPadValidated"))):
        raise InvalidAggregate("Identity or PAD release flags are unsafe.")
    if type(report["caveat"]) is not str or len(report["caveat"]) > 1000:
        raise InvalidAggregate("Unexpected source-note field.")
    exact_keys(report["trialCountsByPresentationType"], KINDS)
    totals = {
        k: count(report["trialCountsByPresentationType"][k],
                 MAX_TRIALS_PER_CATEGORY) for k in KINDS
    }
    if report["allPresentationTypesSampled"] is not all(v > 0 for v in totals.values()):
        raise InvalidAggregate("Incomplete source-counts assertion.")
    exact_keys(report["pairedTrialStatusDisagreements"], KINDS)
    for k in KINDS:
        count(report["pairedTrialStatusDisagreements"][k], totals[k])

    exact_keys(report["perScale"], MODES)
    per_scale = {}
    for mode in MODES:
        entry = report["perScale"][mode]
        exact_keys(entry, (
            "shadowOnly", "independentPadValidated", "identityDecisionUse",
            "thresholdCalibrated", "perClass",
            "exploratoryAttackAcceptedFraction",
            "exploratoryGenuineNotAcceptedFraction", "caveat",
        ))
        if (entry["shadowOnly"] is not True
                or entry["independentPadValidated"] is not False
                or entry["thresholdCalibrated"] is not False
                or entry["identityDecisionUse"] != "none"):
            raise InvalidAggregate("Unsafe source model-evaluation flags.")
        if type(entry["caveat"]) is not str or len(entry["caveat"]) > 1000:
            raise InvalidAggregate("Unexpected model-note field.")
        for key in ("exploratoryAttackAcceptedFraction",
                    "exploratoryGenuineNotAcceptedFraction"):
            value = entry[key]
            if (value is not None
                    and (type(value) not in (int, float)
                         or not 0 <= value <= 1)):
                raise InvalidAggregate("Invalid exploratory fraction.")
        exact_keys(entry["perClass"], KINDS)
        mode_counts = {}
        for k in KINDS:
            row = entry["perClass"][k]
            exact_keys(row, COUNT_FIELDS)
            v = {field: count(row[field], totals[k]) for field in COUNT_FIELDS}
            if (v["trials"] != totals[k] or
                    v["observedLive"] + v["observedAttack"] +
                    v["inconclusive"] != v["trials"]):
                raise InvalidAggregate("Model count totals are inconsistent.")
            mode_counts[k] = v
        per_scale[mode] = mode_counts

    risk = report["conservativeShadowRisk"]
    exact_keys(risk, (
        "perClass", "printPresentationsAnyScalePredictedLive",
        "replayPresentationsAnyScalePredictedLive",
        "unsafeAttackObservations", "operatorLabelsNotIndependentlyVerified",
        "researchConsensusIsAuthentication", "identityDecisionUse",
        "independentPadValidated", "releaseRecommendation", "note",
    ))
    if (risk["operatorLabelsNotIndependentlyVerified"] is not True
            or risk["researchConsensusIsAuthentication"] is not False
            or risk["identityDecisionUse"] != "none"
            or risk["independentPadValidated"] is not False
            or risk["releaseRecommendation"] !=
            "do_not_enable_biometric_identity_approval"
            or type(risk["note"]) is not str or len(risk["note"]) > 1000):
        raise InvalidAggregate("Risk report contains an unsafe identity claim.")
    exact_keys(risk["perClass"], KINDS)
    safe_risk = {}
    for k in KINDS:
        raw = risk["perClass"][k]
        exact_keys(raw, (
            "trials", "scaleAgreedLive", "scaleAgreedAttack",
            "conflictOrUncertain", "anyScalePredictedLive",
        ))
        v = {field: count(value, totals[k]) for field, value in raw.items()}
        if (v["trials"] != totals[k] or
                v["scaleAgreedLive"] + v["scaleAgreedAttack"] +
                v["conflictOrUncertain"] != totals[k]):
            raise InvalidAggregate("Risk consensus count inconsistent.")
        # Any two-scale agreement on "live" must appear as live in both modes.
        if any(v["scaleAgreedLive"] > per_scale[mode][k]["observedLive"] for mode in MODES):
            raise InvalidAggregate("Consensus cannot exceed model predictions.")
        if v["anyScalePredictedLive"] < max(per_scale[mode][k]["observedLive"] for mode in MODES):
            raise InvalidAggregate("Union of live predictions is inconsistent.")
        if v["anyScalePredictedLive"] > sum(per_scale[mode][k]["observedLive"] for mode in MODES):
            raise InvalidAggregate("Union of live predictions exceeds modes.")
        safe_risk[k] = v
    if (risk["printPresentationsAnyScalePredictedLive"] !=
            safe_risk["print"]["anyScalePredictedLive"]
            or risk["replayPresentationsAnyScalePredictedLive"] !=
            safe_risk["replay"]["anyScalePredictedLive"]
            or risk["unsafeAttackObservations"] !=
            safe_risk["print"]["anyScalePredictedLive"] +
            safe_risk["replay"]["anyScalePredictedLive"]):
        raise InvalidAggregate("Risk totals disagree.")

    context = report.get("researchSessionContext")
    if context is None:
        context = {"lighting": "not_recorded", "cameraType": "not_recorded"}
    else:
        exact_keys(context, ("lighting", "cameraType"))
        if context["lighting"] not in LIGHTING or context["cameraType"] not in CAMERAS:
            raise InvalidAggregate("Use only fixed, non-identifying session categories.")
    return {"perScale": per_scale, "risk": safe_risk,
            "disagreements": {k: report["pairedTrialStatusDisagreements"][k] for k in KINDS},
            "context": {"lighting": context["lighting"],
                        "cameraType": context["cameraType"]}}


def load_session(path):
    """Only new, local, non-symlink files outside the repo and limited in size."""
    p = Path(path)
    if p.is_symlink() or not p.is_file() or p.suffix.lower() != ".json":
        raise InvalidAggregate("Input must be a regular local JSON report.")
    resolved = p.resolve()
    if resolved == PROJECT_ROOT or PROJECT_ROOT in resolved.parents:
        raise InvalidAggregate("Reports must remain outside the checkout.")
    if p.stat().st_size > MAX_INPUT_BYTES or p.stat().st_size == 0:
        raise InvalidAggregate("Report is unexpectedly large or empty.")
    try:
        report = json.loads(p.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError, OSError) as exc:
        raise InvalidAggregate("Could not read a well-formed local JSON report.") from exc
    return validate_report(report)


def summarize_sessions(sessions):
    """Count sessions, not people; no individual identifiers or confidence claim."""
    if not 1 <= len(sessions) <= MAX_SESSIONS:
        raise InvalidAggregate("Need 1–30 reports.")
    totals = {mode: {
        k: {field: 0 for field in COUNT_FIELDS}
        for k in KINDS} for mode in MODES}
    risk = {k: {"trials": 0, "anyScalePredictedLive": 0,
                "conflictOrUncertain": 0} for k in KINDS}
    lighting = {k: 0 for k in LIGHTING}
    cameras = {k: 0 for k in CAMERAS}
    for session in sessions:
        lighting[session["context"]["lighting"]] += 1
        cameras[session["context"]["cameraType"]] += 1
        for mode in MODES:
            for k in KINDS:
                for field in COUNT_FIELDS:
                    totals[mode][k][field] += session["perScale"][mode][k][field]
        for k in KINDS:
            risk[k]["trials"] += session["risk"][k]["trials"]
            for field in ("anyScalePredictedLive", "conflictOrUncertain"):
                risk[k][field] += session["risk"][k][field]

    return {
        "auditType": "private_local_multisession_pad_shadow_counts",
        "sessionReportCount": len(sessions),
        "distinctParticipantsOrSessionsIndependentlyVerified": False,
        "cameraTypeReportCounts": cameras,
        "lightingReportCounts": lighting,
        "perScale": totals,
        "conservativeRisk": risk,
        "combinedAttackPresentationsCalledLiveByEitherScale": (
            risk["print"]["anyScalePredictedLive"] +
            risk["replay"]["anyScalePredictedLive"]),
        "identityDecisionUse": "none",
        "independentPadValidated": False,
        "automaticApprovalEnabled": False,
        "releaseRecommendation": "do_not_enable_biometric_identity_approval",
        "caveat": (
            "Aggregate-only operator-labeled exploratory results. The tool "
            "cannot prove distinct participants, independent sessions, attack "
            "authenticity, or representativeness; repeated participants/devices "
            "and correlated samples invalidate naive population error estimates. "
            "Do not report as measured APCER/BPCER or PAD certification."
        ),
    }


def safe_output_path(path):
    if path is None:
        return True
    p = Path(path)
    if p.is_symlink() or p.exists() or p.suffix.lower() != ".json":
        return False
    resolved = p.resolve()
    return (resolved != PROJECT_ROOT and PROJECT_ROOT not in resolved.parents
            and resolved.parent.is_dir() and not resolved.parent.is_symlink())


def write_exclusive(path, summary):
    if not safe_output_path(path):
        raise InvalidAggregate("Output must be a new JSON outside the project.")
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd = os.open(path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            json.dump(summary, out, indent=2, sort_keys=True, allow_nan=False)
            out.write("\n")
    except BaseException:
        Path(path).unlink(missing_ok=True)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aggregate-only-consent", action="store_true",
                        help="Confirm these are voluntary research-only count reports.")
    parser.add_argument("--session", action="append", type=Path, required=True,
                        help="Existing aggregate-only local JSON, outside Git; repeat 1–30x.")
    parser.add_argument("--output-json", type=Path,
                        help="Optional NEW local summary JSON outside Git.")
    args = parser.parse_args(argv)
    if not args.aggregate_only_consent:
        print("Consent required before any local report is read.", file=sys.stderr)
        return 2
    if not 1 <= len(args.session) <= MAX_SESSIONS or not safe_output_path(args.output_json):
        print("Invalid count or output location.", file=sys.stderr)
        return 2
    try:
        resolved = [str(p.resolve()) for p in args.session]
        if len(set(resolved)) != len(resolved):
            raise InvalidAggregate("The same source report was supplied twice.")
        sessions = [load_session(path) for path in args.session]
        result = summarize_sessions(sessions)
        print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
        if args.output_json is not None:
            write_exclusive(args.output_json, result)
        return 0
    except (InvalidAggregate, OSError) as exc:
        print("Aggregate-only evaluation stopped: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
