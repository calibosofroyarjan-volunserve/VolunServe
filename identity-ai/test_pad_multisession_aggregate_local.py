"""Synthetic/no-person tests for local-only multi-session count aggregation."""
import json
from pathlib import Path
import tempfile
import unittest

import evaluate_pad_scales_local as scales
import pad_multisession_aggregate_local as multi


def make_report(*, extra=False):
    trials = {
        "live": [("live", "attack"), ("live", "attack"), ("live", "attack")],
        "print": [("live", "attack"), ("inconclusive", "attack"),
                  ("inconclusive", "attack")],
        "replay": [("attack", "attack")] * 3,
    }
    report = scales.aggregate_paired(trials)
    if extra:
        report["researchSessionContext"] = {
            "lighting": "indoor_artificial", "cameraType": "laptop_built_in",
        }
    return report


class PrivateMultiSessionTests(unittest.TestCase):
    def test_actual_paired_report_is_accepted_only_as_exploratory_counts(self):
        base = make_report(extra=True)
        limited = multi.validate_report(base)
        self.assertEqual(limited["perScale"]["upstream_raw_0_to_255"]["print"],
                         {"trials": 3, "observedLive": 1, "observedAttack": 0,
                          "inconclusive": 2})
        self.assertEqual(limited["risk"]["print"]["anyScalePredictedLive"], 1)
        self.assertEqual(limited["context"]["lighting"], "indoor_artificial")
        without_context = multi.validate_report(make_report())
        self.assertEqual(without_context["context"]["lighting"], "not_recorded")
        self.assertFalse(base["independentPadValidated"])

    def test_multi_session_totals_never_claim_distinct_people_or_PAD_pass(self):
        first = multi.validate_report(make_report(extra=True))
        second = multi.validate_report(make_report())
        summary = multi.summarize_sessions([first, second])
        self.assertEqual(summary["sessionReportCount"], 2)
        self.assertEqual(summary["conservativeRisk"]["print"]["trials"], 6)
        self.assertEqual(
            summary["conservativeRisk"]["print"]["anyScalePredictedLive"], 2)
        self.assertEqual(
            summary["combinedAttackPresentationsCalledLiveByEitherScale"], 2)
        self.assertEqual(
            summary["perScale"]["upstream_raw_0_to_255"]["live"]["observedLive"], 6)
        self.assertEqual(summary["cameraTypeReportCounts"]["not_recorded"], 1)
        self.assertFalse(summary["distinctParticipantsOrSessionsIndependentlyVerified"])
        self.assertFalse(summary["independentPadValidated"])
        self.assertFalse(summary["automaticApprovalEnabled"])
        self.assertEqual(summary["identityDecisionUse"], "none")
        serialized = json.dumps(summary)
        for forbidden in ("photo.jpg", "personId", "uid", "embedding",
                          "fullName", "private_key", "filename", "faceCoordinates"):
            self.assertNotIn(forbidden, serialized)

    def test_reject_unexpected_fields_and_privacy_sensitive_keys(self):
        candidates = [
            ("uid", "private_user_1"), ("facePhoto", "base64data"),
            ("sessionToken", "secret"), ("personName", "Person 1"),
            ("faceEmbedding", [0.1, 0.3]),
        ]
        for key, value in candidates:
            with self.subTest(key=key):
                raw = make_report()
                raw[key] = value
                with self.assertRaises(multi.InvalidAggregate):
                    multi.validate_report(raw)

    def test_reject_untrusted_or_inconsistent_counts(self):
        for mutate in [
            lambda r: r.update(independentPadValidated=True),
            lambda r: r.update(identityDecisionUse="verified"),
            lambda r: r["trialCountsByPresentationType"].update(print=1000),
            lambda r: r["trialCountsByPresentationType"].update(print=True),
            lambda r: r["pairedTrialStatusDisagreements"].update(live=5),
            lambda r: r["perScale"]["upstream_raw_0_to_255"]["perClass"]["print"].update(observedLive=3),
            lambda r: r["conservativeShadowRisk"].update(printPresentationsAnyScalePredictedLive=0),
            lambda r: r["conservativeShadowRisk"].update(releaseRecommendation="enable"),
            lambda r: r.update(researchSessionContext={"lighting": "person's home",
                                                        "cameraType": "laptop_built_in"}),
            lambda r: r["perScale"]["upstream_raw_0_to_255"].update(personId="someone"),
        ]:
            with self.subTest(mutator=str(mutate)):
                report = make_report()
                mutate(report)
                with self.assertRaises(multi.InvalidAggregate):
                    multi.validate_report(report)

    def test_local_paths_no_duplicate_files_or_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            first = folder / "Session-Counts-A.json"
            second = folder / "Session-Counts-B.json"
            first.write_text(json.dumps(make_report(extra=True)), encoding="utf-8")
            second.write_text(json.dumps(make_report()), encoding="utf-8")
            self.assertEqual(multi.load_session(first)["risk"]["print"]["trials"], 3)
            self.assertEqual(multi.load_session(second)["context"]["lighting"],
                             "not_recorded")
            final = folder / "Study-Counts.json"
            self.assertTrue(multi.safe_output_path(final))
            multi.write_exclusive(final, multi.summarize_sessions(
                [multi.load_session(first), multi.load_session(second)]))
            self.assertTrue(final.is_file())
            self.assertFalse(multi.safe_output_path(final))
            with self.assertRaises(multi.InvalidAggregate):
                multi.write_exclusive(final, {"identityDecisionUse": "none"})
            self.assertFalse(multi.safe_output_path(
                multi.PROJECT_ROOT / "secret-aggregate.json"))

    def test_cli_requires_consent_and_never_uses_camera(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test.json"
            path.write_text(json.dumps(make_report()), encoding="utf-8")
            self.assertEqual(multi.main(["--session", str(path)]), 2)
            self.assertEqual(multi.main([
                "--aggregate-only-consent", "--session", str(path),
                "--session", str(path),
            ]), 2)
            self.assertEqual(multi.main([
                "--aggregate-only-consent", "--session", str(path),
            ]), 0)

    def test_reject_non_json_and_no_report_with_metadata_lookalike(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "not-aggregate.json"
            path.write_text(json.dumps({
                "name": "private", "identityDecisionUse": "none"
            }), encoding="utf-8")
            with self.assertRaises(multi.InvalidAggregate):
                multi.load_session(path)
            path.write_text("x" * (multi.MAX_INPUT_BYTES + 1), encoding="utf-8")
            with self.assertRaises(multi.InvalidAggregate):
                multi.load_session(path)


if __name__ == "__main__":
    unittest.main()
