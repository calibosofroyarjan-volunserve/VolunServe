# VolunServe — Private webcam liveness research pilot

**Status (Nov 13, 2026): Local pilot tool implemented. Real consenting camera trials have not been run through this chat.**

This is a local-only research workflow for the experimental MiniFASNet anti-spoofing model. It uses the user's **own Windows webcam** without uploading or saving facial photos, video clips, ID images, face templates, names or per-frame scores.

The model remains **SHADOW-ONLY**. These observations cannot verify a resident or satisfy formal PAD or ISO/IEC 30107-3 requirements.

## One-time setup on your Windows PC

Open PowerShell at the root of your latest **staging VolunServe checkout**. Use Python 3.11, and run:

    py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86
    py -3.11 identity-ai/download_passive_pad_model.py
    py -3.11 identity-ai/download_yunet_model.py

The model downloader scripts contact trusted public model repositories to retrieve the pinned SHA256-verified weights. The webcam evaluation itself has **no network calls**. Enable Windows camera permission; close Zoom, Teams or other apps that use the webcam.

## Run the complete guided test

With explicit consent from every adult on camera:

    py -3.11 identity-ai/run_pad_webcam_trials_local.py --consent-confirmed --camera 0 --trials-per-class 3 --frames-per-trial 3

The program opens only your local webcam, tells you which physical presentation to prepare, and asks you to press Enter for each trial. It gives a two-second hands-free preparation pause and captures three in-memory, time-separated frames for that trial. **The camera photos/video are NOT saved.**

It prompts for three presentations, with three trials per category by default:

- **LIVE:** Consenting adult physically in front of your webcam, not a saved portrait.
- **PRINT:** A physical **printed portrait** of a consenting adult displayed to the webcam (NEVER a government ID).
- **REPLAY:** A separate phone/monitor playing a consenting face video **to the webcam** (not the original video file itself).

No unrelated bystanders or minors; no screenshots or raw photos uploaded to ChatGPT, GitHub, Firebase or Render. Have a neutral background with sufficient context around the face (the crop needs a 2.7x face region). The terminal does NOT show a preview window, to remain compatible with the headless OpenCV package. Position the subject before pressing Enter.

Press q to cancel at a prompt (the session is discarded). Camera failures abort the session without publishing partial findings. If camera 0 fails, check Windows Settings / Privacy / Camera and try --camera 1.

Do not invent missing print or replay presentations: lacking a printer or a second screen means that real test condition remains **not completed**.

## Optional locally saved counts

You can add this flag to the command:

    --aggregate-json "C:\PAD-Webcam-Aggregate.json"

The tool creates a **new aggregate-only JSON file** outside the Git checkout. It refuses overwriting an existing file or saving inside the repository. Only counters, disagreement counts, research caveats and fixed not-validated flags appear; no face pixels, recordings, file paths or per-person data.

## Understanding the result

A trial is **one physical presentation**, not three independent video frames. The same face crop is passed to two experimental configurations:

- upstream_raw_0_to_255 — original MiniVisionAI raw BGR pixel input
- converted_card_0_to_1 — third-party ONNX card BGR / 255 (used by current staging shadow model)

Outputs include counts for model-live, model-attack and inconclusive observations, exploratory genuine-not-accepted and attack-accepted fractions, and the number of trials on which input-scale outcomes disagree.

These are **not validated PAD error rates** or real population accuracy measurements. More than one adult, multiple camera models, lighting conditions, repeat sessions and independent ground-truth verification are needed for credible estimates. Do not tune the confidence threshold or flip classes to optimize this tiny pilot.

The results must always preserve independentPadValidated=false, modelInputScaleValidatedOnRealSamples=false, modelThresholdCalibrated=false and identityDecisionUse=none. No good-looking result enables automatic Verified Resident approval.

**Production and staging service endpoints stay unchanged. Staging private-media uploads remain blocked.**
