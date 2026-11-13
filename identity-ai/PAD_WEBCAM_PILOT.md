# VolunServe — Private webcam liveness research pilot

**Status (Nov 13, 2026): Windows visual preview, framing and guided capture implemented in staging source. GUI integration has synthetic QA coverage; no independent real-device PAD accuracy or production verification is established.**

This is a local-only research workflow for the experimental MiniFASNet anti-spoofing model. It uses the user's **own Windows webcam** without uploading or saving facial photos, video clips, ID images, face templates, names or per-frame scores.

The model remains **SHADOW-ONLY**. These observations cannot verify a resident or satisfy formal PAD or ISO/IEC 30107-3 requirements.

## November 13: printed-photo false-live finding and conservative mitigation

In the operator-labeled 9-trial laptop pilot (3 LIVE, 3 PRINT, 3 REPLAY),
the **raw 0–255** shadow model called all 3 LIVE presentations live,
classified 1/3 physical printed-portrait presentations **live**, marked
2/3 prints inconclusive, and called 3/3 screen replays attack.
The **0–1** model classified all 9 presentations attack, including the
3 actual LIVE faces. This confirms a **potential print false acceptance**
and a **genuine-face false rejection tradeoff** in a tiny single-user pilot.
No model is independently validated; do not pick the mode that appears
most convenient or simply lower confidence thresholds.

To avoid mistaken safety claims, the local pilot now emits an aggregate
`conservativeShadowRisk` report section. It:
- Flags **ANY print/replay presentation called live by EITHER scale**, even
  when the other scale says attack, instead of hiding the print weakness.
- Marks two-scale conflicting/uncertain predictions **inconclusive** for
  research reporting, never a biometric green light.
- Keeps `identityDecisionUse=none`, `independentPadValidated=false`,
  uploads disabled and automatic approval prohibited.

This is a **reporting/abstention mitigation**, NOT a repaired PAD model.
It does not prove that both scales agreeing live would be authentic, and
does not permit software to recognize whether a photo or screen was
physically presented. A larger, independently labeled trial is needed;
do not repeat the same nine samples merely to optimize a reported score.

## Easier LIVE-camera troubleshooting — no need to redo PRINT or REPLAY

If the webcam easily detects a **3×3 photograph** but struggles with your real
face, remember: YuNet's green rectangle means a face pattern is visible; it
is **NOT** proof of liveness and does not mean a portrait photo has passed
identity verification. Do **not** substitute a printed picture in a LIVE slot
to force the guide green; that would corrupt the trial labels.

The Windows launcher has an opt-in **LIVE-only diagnostic: 3 real-face
captures (NO print/replay)**. It records three consenting genuine live
presentations only. The report explicitly contains
`print=0`, `replay=0`, `allPresentationTypesSampled=false`; it cannot
be described as a full spoofing/PAD study or independent liveness validation.
There is no need to repeat your previous 9-trial attack pilot just to
investigate genuine-face detection.

The preview also has **Discard last trial / Retake**. If you notice
that the physical presentation is wrong, or poor framing produced a bad
test, discard the most recently counted trial (still only in memory),
return to its exact stage and capture again. The previous valid trials
remain in memory. After the last trial, you can still discard the last
one **before** pressing Finish / show aggregate. Once the window is
closed, only aggregate counts exist; individual trial images are never
retained, so an earlier trial cannot be re-labeled from that report.

To help genuine-face framing, sit steady with even front-facing light,
position your face approximately centered in the preview, and adjust your
distance until the **full 2.7× green context rectangle** fits inside
the webcam frame. Avoid bright backlighting. These steps help the camera
detect a face and do not prove that the PAD model is accurate.

This feature changes only the local research UI. No AI model weights,
thresholds, backend identity decisions, real biometric uploads, or
production branches are changed.

## Multi-session camera/lighting study

After your confirmed 9-trial pilot, see
[PAD_MULTISESSION_STUDY.md](PAD_MULTISESSION_STUDY.md) for the new, optional
anonymous counts export and multi-session local summary. Choose correct
lighting/camera categories in the Windows launcher. After a completed pilot
you may explicitly consent to save a NEW aggregate-only JSON outside Git,
then compare actual separately collected sessions using the safe local
`pad_multisession_aggregate_local.py` tool. No biometric images, videos,
face templates, personal identifiers or cloud uploads are involved. Session
counts do not establish independent participants or certified PAD.

## One-click laptop procedure (recommended)

After opening your **up-to-date staging Git checkout** on your Windows laptop,
double-click **`Start-VolunServe-Camera-Test.cmd`** in the project root.

A small window appears, before any camera access:
- Keep **Framing only** selected first. This is the default and needs no
  printed picture or second phone. Select your webcam (start with Camera 0),
  read the local-processing notice, tick the consent box and press Start.
- If pinned public dependencies or models are missing, a separate confirmation
  asks whether to install/download them. Downloads are the existing checksum
  verified public MiniFASNet and YuNet weights and Python packages; no photo
  or ID is sent over the network. Cancel safely if you do not consent.
- The existing local **visual preview** opens. Move back until the guide says
  **FRAMING READY**. No liveness inference, model score, capture or identity
  result is counted in this first mode. Close when framing works.
- Relaunch the same one-click file. **Quick pilot** uses one LIVE, one
  PRINT and one REPLAY physical presentation; choose **9-trial pilot** for three
  independently prepared LIVE, PRINT and REPLAY trials each. The camera
  **FRAMING READY** indicator is only face detection.
- For **EACH** trial, inspect the stage label, physically show that exact
  presentation, tick the on-screen confirmation checkbox and then press
  **Start Capture**. The button stays disabled until BOTH the 2.7× face crop
  is inside the camera frame and the physical-presentation checkbox is ticked.
  The checkbox resets after each sample to avoid accidental label carryover.
- Consider changing ordinary lighting or camera conditions between the three
  trials, without tuning thresholds to fit the result. Each presentation
  must actually be live, printed portrait, or another screen's replay
  as labeled; checking the box cannot prove the physical ground truth.
- After all physical presentations finish, a local **aggregate-only summary**
  shows the counts for both 0–255 and 0–1 experimental paths, including
  genuinely live presentations misclassified/rejected/inconclusive and
  print/replay presentations mistaken for live. These are **exploratory counts,
  not validated population error rates, measured ISO APCER/BPCER or proof of
  identity**. No image, face template, ID or video is saved.

The first mode specifically avoids repeating the inconclusive 9/9 experiment
before the reported crop/framing problem has been addressed. **Do not pretend
that a displayed photo file is a physical print or screen-replay presentation**.
If a print or second screen is not available, stop after the framing mode;
those attacks remain unevaluated.

This launcher requires Windows with Python 3.11 and the Windows `py` command,
plus the staging checkout containing the existing camera QA scripts.
It does not install Python itself, change your deployed site, enable media
uploads or automatically change the verified status of any account. The
terminal only displays local dependency installation and diagnostics when
necessary; all consent and preview/capture controls are in windows.

## One-time setup on your Windows PC

Open PowerShell at the root of your latest **staging VolunServe checkout**. Use Python 3.11, and run:

    py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86
    py -3.11 identity-ai/download_passive_pad_model.py
    py -3.11 identity-ai/download_yunet_model.py

The model downloader scripts contact trusted public model repositories to retrieve the pinned SHA256-verified weights. The webcam evaluation itself has **no network calls**. Enable Windows camera permission; close Zoom, Teams or other apps that use the webcam.

## Run the complete guided test

With explicit consent from every adult on camera:

    py -3.11 identity-ai/run_pad_webcam_trials_local.py --consent-confirmed --camera 0 --trials-per-class 3 --frames-per-trial 3

**New Windows default:** The program opens a VISIBLE local webcam preview window using Python's built-in Tkinter, even though the installed OpenCV package is `opencv-contrib-python-headless`. It displays the actual camera frame, a framing guide showing whether the original model's full 2.7× face context fits, and **Start Capture / Cancel** controls. No additional GUI OpenCV package, browser, photo upload or separate Camera app is needed. Each completed presentation counts once even if three frames are sampled. **Camera photos/videos are NOT saved.**

If the preview says **MOVE BACK**, move farther away and center the face so the enlarged green crop can fit entirely in the frame. Start Capture remains disabled while the crop is clipped, multiple faces are found, or the camera frame is invalid. Printed and replay presentations must still be physically held before the same webcam, NOT supplied as saved image/video files.

If Tkinter is not available or no graphical desktop is attached, run `py -3.11 -m tkinter` to check the local Windows Python installation. For deliberate headless QA only, append `--no-preview` to use the original terminal workflow. **Don't reinstall OpenCV to add a GUI**; it would risk conflicting with the tested headless environment.

It prompts for three presentations, with three trials per category by default:

- **LIVE:** Consenting adult physically in front of your webcam, not a saved portrait.
- **PRINT:** A physical **printed portrait** of a consenting adult displayed to the webcam (NEVER a government ID).
- **REPLAY:** A separate phone/monitor playing a consenting face video **to the webcam** (not the original video file itself).

No unrelated bystanders or minors; no screenshots or raw photos uploaded to ChatGPT, GitHub, Firebase or Render. Have a neutral background with sufficient context around the face (the crop needs a 2.7x face region). The camera preview runs locally in a Tk window; frames and guidance boxes are transient in memory and are not logged or transmitted. Press the green **Start Capture (in-memory)** button only when the full 2.7× crop is visible.

Press q to cancel at a prompt (the session is discarded). Camera failures abort the session without publishing partial findings. If camera 0 fails, check Windows Settings / Privacy / Camera and try --camera 1.

Do not invent missing print or replay presentations: lacking a printer or a second screen means that real test condition remains **not completed**.

## Optional locally saved counts

You can add this flag to the command:

    --aggregate-json "C:\PAD-Webcam-Aggregate.json"

The tool creates a **new aggregate-only JSON file** outside the Git checkout. It refuses overwriting an existing file or saving inside the repository. Only counters, disagreement counts, research caveats and fixed not-validated flags appear; no face pixels, recordings, file paths or per-person data.

## If every webcam trial returns inconclusive (0 observed live / 0 observed attack)

The program may have read nine valid camera frames/trials successfully but failed to classify all of them. **This does not show that attack detection works.** It is usually caused by the wrong webcam being active, missing/ambiguous face detection, the 2.7× face crop falling outside the frame, or low experimental model confidence. You cannot tell which from the trial summary alone.

Run the **private live-face diagnostic** first (you do not need to repeat the printed/replay trials yet):

    py -3.11 identity-ai/diagnose_pad_webcam_local.py --consent-confirmed --camera 0 --frames 9

Use a consenting adult's **actual live face** only. For a visible framing guide instead of the original terminal-only diagnostic, launch `run_pad_webcam_trials_local.py --consent-confirmed` on Windows; its Tk window shows exactly where the required 2.7× crop fits. The standalone `diagnose_pad_webcam_local.py` is still a terminal-only analysis and outputs aggregate counts, without saving photos or videos. If you use Windows Camera to initially check the camera, close it before opening Python.

The CLI outputs **only aggregate reason counts** (no pixels, coordinates, filenames, embeddings, or per-person scores). The most common reason explains next steps:

- `face_not_detected`: YuNet sees no face — check camera index, lighting, single centered face
- `multiple_faces`: keep one consenting face in frame for this diagnostic
- `face_context_out_of_frame`: face was detected but the required full-context 2.7× crop is clipped — step back, keep more background around the head
- `low_model_confidence`: model received a face crop but outputs did not meet the **uncalibrated** 0.75 exploratory threshold — do **not** lower the threshold or claim liveness; independent validation remains necessary
- `model_output_invalid` / `model_not_loaded`: QA inference/model problem, not a user identity failure

If the camera output remains inconclusive, share a **terminal screenshot showing only the aggregate report**. Do not attach selfie photos, camera frames, government IDs, face recordings, or private account data. Re-run the full live/print/replay pilot only after resolving any camera/framing problem. A good result still does not validate live identity or allow automatic Verified Resident approval.

## Understanding the result

A trial is **one physical presentation**, not three independent video frames. The same face crop is passed to two experimental configurations:

- upstream_raw_0_to_255 — original MiniVisionAI raw BGR pixel input
- converted_card_0_to_1 — third-party ONNX card BGR / 255 (used by current staging shadow model)

Outputs include counts for model-live, model-attack and inconclusive observations, exploratory genuine-not-accepted and attack-accepted fractions, and the number of trials on which input-scale outcomes disagree.

These are **not validated PAD error rates** or real population accuracy measurements. More than one adult, multiple camera models, lighting conditions, repeat sessions and independent ground-truth verification are needed for credible estimates. Do not tune the confidence threshold or flip classes to optimize this tiny pilot.

The results must always preserve independentPadValidated=false, modelInputScaleValidatedOnRealSamples=false, modelThresholdCalibrated=false and identityDecisionUse=none. No good-looking result enables automatic Verified Resident approval.

**Production and staging service endpoints stay unchanged. Staging private-media uploads remain blocked.**
