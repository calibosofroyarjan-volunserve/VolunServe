# VolunServe: private multi-session PAD evaluation (staging research only)

**Status:** Tooling only. No independent real-world multi-person/device evaluation has
been performed by this change. No certified liveness/PAD, government ID validation,
face-authenticated identity decision, or upload endpoint is enabled.

## Why more study is needed

The first operator-labeled 3 LIVE / 3 PRINT / 3 REPLAY laptop pilot found the
raw 0–255 model predicted **one physical printed photo as live**, while the
normalized 0–1 model rejected genuine live faces. These are conflicting
exploratory outputs on one person's setup; they do not justify tuning the
threshold or activating user verification.

A green YuNet face box only means a face-like pattern is detected. The
experimental MiniFASNet face score is NOT evidence of actual identity.

## Run independent, consenting physical presentation sessions

A meaningful evaluation needs separate adult volunteers who consent, multiple
physical devices, light conditions and independent review of real attack labels.
**This program cannot establish those facts from an aggregate JSON.** Arrange
an independent observer when possible; note that repeated photos/video clips
and repeated webcam captures of the same person are correlated, so they cannot
stand in for distinct people or devices.

1. Use the up-to-date staging QA worktree, not production or the active
   VolunServe dev checkout. In PowerShell from that directory run:

       py -3.11 identity-ai/start_pad_laptop_gui.py

2. Select **9-trial pilot**. Choose the correct **lighting** and **camera
   type** categories; neither field records a participant's name or device
   serial number. Check consent. Every person appearing must be an adult who
   freely gave permission, and they should be able to stop immediately.
3. For each of the three LIVE trials, show the actual consenting person;
   for PRINT show a physical printed portrait (not an ID); for REPLAY show a
   separate phone/monitor actively playing a consenting portrait video.
   The camera must observe the actual physical presentation in each trial.
   Tick the per-trial confirmation; wait for **FRAMING READY** before
   Start Capture. If a presentation is unavailable, cancel instead of
   pretending another category was measured.
4. After completion, read the local-only summary. The program then separately
   asks whether to **save anonymous research counts**. This is OFF by
   default. Choose Yes and pick a **NEW** \`.json\` file **outside the Git
   checkout**. The program refuses overwriting existing reports. The file
   contains per-category counts, mode disagreements, fixed safety flags
   and operator-selected lighting/camera **category**; it does NOT contain
   photos, video, frame crops, face templates, account IDs or names.
5. For another *real* study session, use its own distinct anonymous JSON path.
   Change the conditions and consenting subject/device when feasible.
   Never reuse a previous file as if it came from a new session.
6. To combine local files safely, run this command with the **actual local**
   paths you chose (NOT the illustrative names below):

       py -3.11 identity-ai/pad_multisession_aggregate_local.py --aggregate-only-consent --session "C:\PAD-Research\Session-A.json" --session "C:\PAD-Research\Session-B.json"

   To optionally write another **NEW** count-only JSON outside Git, add
   \`--output-json "C:\PAD-Research\Combined-Counts.json"\`. Each file
   must be a genuine aggregate-only source generated from the existing pilot.
   The tool rejects unexpected personal fields, mismatched totals, repeated
   paths, unsafe flags and overwritten outputs. It does NOT inspect webcam
   footage, use network connections or upload anything.
7. Share only aggregate counts (not video, selfie or ID), and record whether
   each category was **operator-attested or independently observed**. If the
   program reports a print/replay predicted live, keep the identity approval
   gate disabled and escalate for independent technical review.

## How to interpret the aggregate

- **Per-scale LIVE observed as attack or inconclusive** indicates an
  experimental false-rejection/abstention problem.
- **PRINT or REPLAY observed as LIVE under either scale** indicates
  potential presentation-attack false acceptance.
- **Contradictory scale results** are INCONCLUSIVE, not a live decision.
- Session count is **not people count**. Camera/lighting category counts
  are operator-reported, not verified sources.
- Zero recorded errors in a small test does not imply a zero true attack
  success rate. This tool intentionally does **not** generate misleading
  APCER/BPCER certification labels or infer demographic performance.
- Changing the threshold or selecting whichever scale looks successful on
  the collected cases will overfit the experiment. Freeze a candidate model
  and evaluation protocol **before** independent holdout testing.

**Release gates:** independent attack studies and calibrated error bounds;
consent, minimal collection/retention/deletion and security review; issuer
authenticity checks; audited server authorization and authenticated staging
end-to-end validation. Until then, single-frame PAD remains SHADOW ONLY,
staging private ID/selfie upload HTTP 423 remains enabled as a block, and
manual authorized Admin review is still required. No live deployment.
