"""Aggregate-only research metrics for local SFace 1:1 pair evaluation.

A fixed, *operator-chosen* threshold is evaluated; this module neither
selects/endorses a deployment threshold nor verifies any human identity.
Keep individual biometric scores and image paths out of output.
"""
import math


def _wilson_one_sided_upper95(errors, trials):
    """Conservative binomial uncertainty bound on observed scored pairs.

    This bounds an *i.i.d. pair-level* sampling calculation, NOT unknown
    population/participant generalization. Correlated images from the same
    individual can invalidate the independence assumption.
    """
    if not trials:
        return None
    z = 1.6448536269514722
    p = errors / trials
    z2 = z * z
    denominator = 1.0 + z2 / trials
    center = p + z2 / (2.0 * trials)
    spread = z * math.sqrt(p * (1.0 - p) / trials +
                           z2 / (4.0 * trials * trials))
    return min(1.0, max(0.0, (center + spread) / denominator))


def summarize_pairs(pairs, threshold):
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or \
            not math.isfinite(float(threshold)) or not -1.0 <= threshold <= 1.0:
        raise ValueError("invalid_sface_threshold")
    counts = {
        "sameScored": 0, "differentScored": 0,
        "sameUnscorable": 0, "differentUnscorable": 0,
        "falseRejects": 0, "falseAccepts": 0,
        "trueAccepts": 0, "trueRejects": 0,
    }
    for same_person, score in pairs:
        if type(same_person) is not bool:
            raise ValueError("invalid_pair_label")
        name = "same" if same_person else "different"
        if score is None:
            counts[name + "Unscorable"] += 1
            continue
        if isinstance(score, bool) or not isinstance(score, (int, float)) or \
                not math.isfinite(float(score)) or not -1.0 <= score <= 1.0:
            raise ValueError("invalid_face_similarity")
        counts[name + "Scored"] += 1
        if same_person:
            counts["trueAccepts" if score >= threshold else "falseRejects"] += 1
        else:
            counts["falseAccepts" if score >= threshold else "trueRejects"] += 1
    positives = counts["sameScored"]
    negatives = counts["differentScored"]
    total_same = positives + counts["sameUnscorable"]
    total_different = negatives + counts["differentUnscorable"]
    return {
        **counts,
        "threshold": float(threshold),
        "observedFalseAcceptRate": counts["falseAccepts"] / negatives if negatives else None,
        "observedFalseRejectRate": counts["falseRejects"] / positives if positives else None,
        "observedTrueAcceptRate": counts["trueAccepts"] / positives if positives else None,
        "observedTrueRejectRate": counts["trueRejects"] / negatives if negatives else None,
        # Essential context: dropped/unscorable genuine pairs must not
        # disappear from operational rejection-risk reporting.
        "samePairScoreCoverage": positives / total_same if total_same else None,
        "differentPairScoreCoverage": negatives / total_different if total_different else None,
        "observedGenuineNoPositiveResultFraction":
            (counts["falseRejects"] + counts["sameUnscorable"]) / total_same
            if total_same else None,
        "observedFalseAcceptUpper95ScoredPairs":
            _wilson_one_sided_upper95(counts["falseAccepts"], negatives),
        "observedFalseRejectUpper95ScoredPairs":
            _wilson_one_sided_upper95(counts["falseRejects"], positives),
        "uncertaintyNote": (
            "One-sided Wilson 95% bounds assume independent scored pairs. "
            "Repeated images/participants or class imbalance invalidate "
            "population extrapolation. Zero observed errors is NOT zero risk."
        ),
        "sampleAdequacy": "small_or_incomplete_sample"
            if positives < 30 or negatives < 30 else "descriptive_sample_only",
        "identityDecisionUse": "none",
        "independentPadValidated": False,
        "faceMatchAccuracyCertified": False,
    }
