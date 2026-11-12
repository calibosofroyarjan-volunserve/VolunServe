# VolunServe — real-device PAD dual-scale evaluation protocol (PRIVATE, QA ONLY)

**Status (Nov 13, 2026): READY FOR LOCAL CONSENTED CAPTURES; NO REAL-DEVICE ACCURACY RESULTS COLLECTED.**

This protocol supports the final unresolved technical question after authentic upstream PyTorch-to-ONNX numerical parity was confirmed: **how the same genuine face / physical print / replay presentation is classified with the original MiniVisionAI raw BGR 0–255 preprocessing versus the third-party ONNX card's BGR 0–1 preprocessing**. Both models have identical pinned weights; only input normalization differs. We do **not** automatically tune thresholds, determine a valid face, authenticate a government ID, issue a certificate, or approve a VolunServe Resident.

The dual-scale evaluator runs **locally on the owner's computer** and does not call an HTTP API, use Firebase, write face templates, export frame scores, or upload media. It prints only aggregate counts. No production, staging backend or cloud service is involved.

## Obtain only consensual private test recordings

Prepare a folder outside the Git checkout, e.g.:

\`\`\`text
C:\PAD-Test-Private\
   live\
   print\
   replay\
\`\`\`

- **live/**: Fresh camera captures of a consenting person physically present in front of the verification camera. Use several separate attempts and natural lighting. A saved screenshot of a live face is **not** a valid genuine-camera test.
- **print/**: Fresh camera captures of a **physical printed portrait** displayed to the same camera. These are *test presentation attacks*, not official identity evidence. Do not include government IDs or printed IDs. Original portrait files themselves are **not** attack presentations.
- **replay/**: Fresh camera captures of a **separate phone/monitor playing back a consenting portrait video**. Record the camera's view of the presentation rather than submitting the prerecorded clip directly.

The three categories must reflect what was physically presented to the camera. A folder name does not prove the label is correct. Only use your own consenting face or other participants who have explicitly agreed to this isolated research. Avoid minors, unrelated people, and non-consenting bystanders. Do not record or upload ID cards. Clearly document the participant's right to stop and promptly delete their samples; get explicit agreement to locally retain recordings for the agreed test period.

For an exploratory pilot, try separate trials at multiple lighting conditions and different cameras/sessions across the three categories. Avoid treating many frames of the same video or repeated attempts from one person as independent subjects. A small personal pilot can uncover bugs but **cannot support population-level error rates, claim ISO/IEC 30107-3 certification, or validate a deployment threshold**.

## Run on the same Windows machine (outside GitHub/Render)

Run from your **up-to-date staging checkout** in PowerShell. Requires Python 3.11:

\`\`\`powershell
py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86
py -3.11 identity-ai/download_passive_pad_model.py
py -3.11 identity-ai/download_yunet_model.py
$env:PYTHONPATH="identity-ai"
py -3.11 identity-ai/evaluate_pad_scales_local.py --samples "C:\PAD-Test-Private" --consent-confirmed --aggregate-json "C:\PAD-Aggregate-Only.json"
\`\`\`

The command refuses to run without the explicit \`--consent-confirmed\` switch, missing checksum-pinned MiniFASNet or YuNet model, or if samples are inside the repository. It prevents aggregate reports from being placed inside the samples directory or repository. Keep \`C:\PAD-Aggregate-Only.json\` private until you have checked the aggregate contents; **only this aggregate JSON may be shared** if desired. It contains no filenames, labels per person, pixel data, face coordinates, embeddings, or per-trial confidence scores.

Use only supported media: JPEG/PNG/WebP and MP4/MOV/AVI/MKV, maximum 30 MiB per file; at most 100 files per type. Each video counts as **one presentation trial** even when up to eight time-separated frames are checked. The two input scales are evaluated on the **same 2.7× face crop from each sampled frame**. Models remain in memory only.

## Interpret the report without overclaiming

- \`perScale.upstream_raw_0_to_255\`: exploratory shadow observations under original MiniVisionAI NumPy raw BGR input.
- \`perScale.converted_card_0_to_1\`: same observations under the converted ONNX model card's normalization, which is used by the current staging shadow implementation.
- \`perScale.<mode>.perClass.<category>\`: total media trials, \`observedLive\`, \`observedAttack\`, \`inconclusive\` counts. These are **not authenticated outcomes**.
- \`exploratoryGenuineNotAcceptedFraction\`: genuine presentations classified attack **or inconclusive**, divided by all genuine trials. A value of 1.0 on a tiny pilot means that pilot's genuine attempts did not receive a model-live observation—not that the model is universally unusable.
- \`exploratoryAttackAcceptedFraction\`: print and replay trials with **any sampled frame** marked model-live, divided by all recorded attack presentations; inconclusive outcomes remain in the denominator. Do not call this an officially calibrated ISO APCER.
- \`pairedTrialStatusDisagreements\`: for each presentation type, how many one-file trials changed shadow status between the two scales. This is input-scale sensitivity, **not** evidence that one scale is correct.
- \`allPresentationTypesSampled\`: a completeness hint only; it does **not** mean statistically representative or PAD-validated.
- \`independentPadValidated=false\`, \`identityDecisionUse=none\`: must remain unchanged regardless of how many tests are collected.

### Why this is still not production-ready

Synthetic tests and previously established 20/20 original PyTorch-to-ONNX numerical parity **do not** independently validate actual live/attack labels, camera conditions, diverse subjects, accessibility, fairness, replay detection, or threshold calibration. Both the real-face false-rejection observation and the conflicts between upstream class convention and third-party ONNX model card remain concerns until independently assessed with enough consenting labeled camera presentations.

**Hard release gates:** (1) explicit consent and approved retention/deletion/privacy controls; (2) representative multi-device genuine/print/replay field test with a suitable independent expert; (3) formal decision on calibrated model scales/classes and mitigations for false positives/false rejections; (4) approved staging Admin/Resident end-to-end testing; (5) independent issuer/document verification before Verified Resident grants. Keep real identity photo uploads disabled and require manually verified Admin decisions until all release gates are satisfied.

**Do not commit captured faces or ID scans to Git, attach them to issues, or upload them to staging, even if a test fails.**
