"""Private aggregate-only VolunServe biometric QA risk summary.

This is an evidence-quality and release-hold report, NOT a biometric decision,
not an identity grant, not threshold selection, and not a PAD certification.
Inputs MUST be aggregate JSON from the existing consented LOCAL SFace/PAD
evaluators. No image, video, filename, face embedding or per-trial score is
opened, logged, persisted or forwarded here.
"""
import argparse
import json
from pathlib import Path


MAX_REPORT_BYTES = 65536
MAX_REASONABLE_TRIALS = 1000


def _count(value):
    return type(value) is int and 0 <= value <= MAX_REASONABLE_TRIALS


def assess_critical_risks(face, pad):
    """Fail closed on invalid/inconsistent metrics, report risks safely.

    Never converts model preference or sample statistics to user identity.
    """
    if not isinstance(face, dict) or not isinstance(pad, dict):
        raise ValueError("invalid_aggregate_schema")
    if (face.get("auditType") != "private_sface_1to1_exploratory" or
            pad.get("auditType") != "private_local_four_hypothesis_pad_exploratory"):
        raise ValueError("unexpected_aggregate_kind")
    if (face.get("identityDecisionUse") != "none" or
            face.get("faceMatchAccuracyCertified") is not False or
            face.get("automaticApprovalAllowed") is not False or
            pad.get("identityDecisionUse") != "none" or
            pad.get("shadowOnly") is not True or
            pad.get("independentPadValidated") is not False or
            pad.get("automaticApprovalAllowed") is not False):
        raise ValueError("unsafe_claim_or_model_status")
    face_keys = ("sameScored", "differentScored", "sameUnscorable",
                 "differentUnscorable", "falseAccepts", "falseRejects")
    if any(not _count(face.get(key)) for key in face_keys):
        raise ValueError("invalid_face_trial_counts")
    if (face["falseAccepts"] > face["differentScored"] or
            face["falseRejects"] > face["sameScored"]):
        raise ValueError("inconsistent_face_trial_counts")
    pad_counts = pad.get("trialCountsByPresentationType")
    risk = pad.get("researchRiskCounts")
    if (not isinstance(pad_counts, dict) or not isinstance(risk, dict) or
            any(not _count(pad_counts.get(k)) for k in ("live", "print", "replay")) or
            any(not _count(risk.get(k)) for k in (
                "printOrReplayAnyHypothesisObservedLive",
                "printOrReplayFourWayLive",
                "genuineNotFourWayLive", "totalPrintAndReplay", "totalGenuine"
            ))):
        raise ValueError("invalid_pad_trial_counts")
    total_attacks = pad_counts["print"] + pad_counts["replay"]
    if (risk["totalPrintAndReplay"] != total_attacks or
            risk["totalGenuine"] != pad_counts["live"] or
            risk["printOrReplayAnyHypothesisObservedLive"] > total_attacks or
            risk["printOrReplayFourWayLive"] > risk["printOrReplayAnyHypothesisObservedLive"] or
            risk["genuineNotFourWayLive"] > pad_counts["live"]):
        raise ValueError("inconsistent_pad_trial_counts")
    blockers = []
    if not face["sameScored"] or not face["differentScored"]:
        blockers.append("same_and_different_photo_pairs_not_both_scored")
    if face["sameUnscorable"] or face["differentUnscorable"]:
        blockers.append("unscorable_face_pairs_need_investigation")
    if face["falseAccepts"]:
        blockers.append("impostor_photo_pair_false_accepts_observed")
    if face["falseRejects"]:
        blockers.append("same_person_photo_pair_false_rejects_observed")
    if not all(pad_counts[k] for k in ("live", "print", "replay")):
        blockers.append("genuine_print_and_replay_presentations_not_all_sampled")
    if risk["printOrReplayAnyHypothesisObservedLive"]:
        blockers.append("print_or_replay_any_model_live_red_flag")
    if risk["genuineNotFourWayLive"]:
        blockers.append("genuine_presentations_not_consistently_live")
    blockers += [
        "sface_threshold_not_independently_calibrated",
        "mini_fasnet_pad_not_independently_validated",
        "actual_staging_authorized_identity_flow_not_proven",
        "human_id_issuer_check_and_privacy_signoff_required",
    ]
    return {
        "status": "research_evidence_only_release_blocked",
        "automaticIdentityApprovalAllowed": False,
        "residentVerificationRequiresIndependentAdminReview": True,
        "blockingReasonCodes": blockers,
        "face": {
            "sameScored": face["sameScored"],
            "differentScored": face["differentScored"],
            "sameUnscorable": face["sameUnscorable"],
            "differentUnscorable": face["differentUnscorable"],
            "falseAccepts": face["falseAccepts"],
            "falseRejects": face["falseRejects"],
        },
        "pad": {
            "livePresentations": pad_counts["live"],
            "physicalPrintPresentations": pad_counts["print"],
            "secondScreenReplayPresentations": pad_counts["replay"],
            "anyModelLiveOnAttack": risk["printOrReplayAnyHypothesisObservedLive"],
            "genuineNotAllModelLive": risk["genuineNotFourWayLive"],
        },
        "limitations": "Aggregate local exploratory QA only; not proven independent ground truth, generalizable accuracy or deployed authentication.",
    }


def _read_private_aggregate(path):
    p = Path(path)
    if not p.is_file() or p.is_symlink() or p.stat().st_size > MAX_REPORT_BYTES:
        raise ValueError("private_aggregate_unavailable")
    with p.open("r", encoding="utf8") as stream:
        return json.load(stream)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sface-aggregate", required=True)
    parser.add_argument("--pad-aggregate", required=True)
    args = parser.parse_args()
    try:
        report = assess_critical_risks(
            _read_private_aggregate(args.sface_aggregate),
            _read_private_aggregate(args.pad_aggregate),
        )
    except (ValueError, TypeError, OSError, UnicodeError, json.JSONDecodeError):
        print("BIOMETRIC_QA_AGGREGATE_BLOCKED: only local aggregate files allowed.")
        return 2
    print(json.dumps(report, sort_keys=True, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
