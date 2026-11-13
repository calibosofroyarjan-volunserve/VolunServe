# VolunServe private V2 + V1SE PAD evaluation — November 13, 2026

## November 13: Easy GREEN face framing for National ID + selfie workflows

**The four-model PAD pilot was the wrong screen for an ordinary ID/selfie
camera framing task.** A user with a clearly visible face on a built-in
laptop webcam should not have to sit excessively far from the screen just
to make a 4× *PAD research context crop* fit.

A new default **Easy GREEN face preview (no 4x, no PAD, no image saved)**
radio option in `start_pad_laptop_gui.py` uses only the checksum-pinned
YuNet face detector. It turns the **face box green** once exactly one
non-truncated face of usable size is inside the camera frame. No 2.7× or
4× enlarged background context is needed; low-quality/edge/tiny/no/multiple
face feedback remains explicit. This mode is **preview-only** and cannot
capture, upload, save, or mark anyone verified.

There are three **different** conditions:

1. **GREEN = one face visible and framed for a prospective selfie.**
   It is NOT "same person as National ID", OCR success, ID authenticity,
   liveness, or account verification.
2. **National ID OCR + front/back/profile screening** lives in the
   separate `identity-ai/main.py` document precheck, via the
   authenticated backend. A recognized layout or text is not evidence
   that the Philippine National ID is authentic.
3. **ID portrait vs selfie 1:1 face comparison** is separate from the
   PAD pilot, with a non-decisional SFace shadow and manual Admin review.
   The staging private ID/selfie submission gate remains HTTP 423
   and must NOT be bypassed merely to make the camera box green.

**No automatic Verified Resident, face match, liveness or ID-authenticity
claims are made by green framing.** Real identity flows require explicit
consent, appropriate document handling, identity-security review and a
controlled authenticated staging acceptance test before any gate is changed.

To run the simple local preview in a separate clean staging PAD checkout:

```powershell
py -3.11 .\identity-ai\start_pad_laptop_gui.py
```

The default mode is **Easy GREEN face preview**, requiring only public
webcam packages and checksum-pinned YuNet detector (separate opt-in).
The old four-hypothesis anti-spoofing research modes remain opt-in and
preserve strict 4× framing and no identity approval.

## V1SE 4x framing and same-bounding-box correction

A review of the original code found a **confirmed integration mismatch**:
the combined V2+V1SE Windows webcam GUI used V2's 2.7x context-only
`FRAMING READY` criterion, although V1SE requires a larger full 4.0x
context. The V1SE classifier refused crops outside the frame and returned
`inconclusive`; the operator did not see that 4.0x capture was still
impossible. This may explain *some*, but not necessarily all, inconclusive
observations. The private operator's measurements are not committed here.

The updated combined GUI now waits until the entire 4.0x V1SE context is
inside the frame. If only V2's 2.7x crop fits, the preview instead says
**MOVE BACK: V1SE needs FULL 4x face context**. The old V2-only and
camera-framing-only modes retain their 2.7x guidance. The combined capture
also forwards the **single face bounding box seen in the preview** to
both models, with their appropriate 2.7x or 4.0x crop. This avoids
independent re-detection in the same observed frame. No image or bbox is
stored, logged, uploaded or added to result JSON.

## Important limits

The upstream ONNX inference example handles **raw float32 BGR inputs** and
uses class index 1 for "Real"; its model reference documents V2=2.7x and
V1SE=4x (see yakhyo/face-anti-spoofing). The additional normalized 0-1
path remains a deliberately **unvalidated research hypothesis** for
comparing scale sensitivity; it must not become an authentication gate.

A full 4x crop is **necessary** for this particular staging no-padding
implementation but is **not proof of model accuracy or liveness**. A
4x-ready frame can still give inconclusive responses from raw or
normalized model scores. Do not reduce the threshold or use raw-only
predictions to auto-approve accounts based on one small pilot. Independent
real-world PAD accuracy remains unvalidated.

The already-deployed Python AI backend, identity uploading HTTP 423 gate,
Admin approval requirements and live VolunServe production are unchanged.
Only staging local QA diagnostics are adjusted.



This is a **local research-only** tool to compare the already-integrated,
checksum-pinned MiniFASNetV2 (2.7× face crop) and MiniFASNetV1SE (4.0× crop).
Each model is evaluated with raw BGR 0–255 and normalized BGR 0–1 input.
Four observations are derived from the **same physical camera presentation**.

**Not done by this software alone:** measure actual independent liveness
accuracy, verify any government ID, authenticate a person, or approve a
Verified Resident. The weights share training lineage and error modes; even
four-way model agreement is NOT independent PAD evidence.

## Easiest Windows option: no photo/video saved

In the updated separate staging PAD checkout, run from the repo root:

```powershell
py -3.11 identity-ai/start_pad_laptop_gui.py
```

1. Choose **NEW: V2 + V1SE pilot — 1 LIVE + 1 PRINT + 1 REPLAY** for a
   preliminary one-presentation-per-category exploratory check. For a later
   properly consented small follow-up, choose 3 each. Do not repeat the older
   9-trial result just to obtain a better score.
2. Check consent. Only adults who explicitly agree may appear. The program
   asks separately before installing missing public packages or pinned models;
   this is NOT permission to collect someone else's biometric information.
3. Use the **visible camera preview** and frame guidance. Every trial has
   an explicit confirmation checkbox for the **physical** presentation.
   LIVE = consenting human physically in front of webcam, **not** a printed
   or screen photograph. PRINT = printed consenting portrait physically
   held in front of camera, **never a school/government ID**. REPLAY =
   consenting portrait video playing on a **separate device screen**, pointed
   at the webcam (not an original MP4 supplied directly).
4. The camera is released on finish or cancel. Local frames are discarded.
   The tool prints only coarse category counts and flags. You may optionally
   save a NEW anonymized counts-only JSON outside the Git checkout. You may
   cancel without saving. **Do not send any real faces or IDs to GitHub/Render**.
5. For comparing devices, repeat *separate consenting sessions* with a
   different camera and lighting environment; label the chosen camera type
   and lighting. Do **not** treat repeats from one person as many unique
   participants or claim laboratory validation.

The old **camera-only** default and legacy V2 quick pilot remain available.
The combined mode is **opt-in only** and refuses to run without the local
V1SE and V2 pinned model weights, YuNet and valid camera permission.

## Offline audit of already consented LOCAL camera-presented media

If genuinely consented camera-captured presentation recordings already exist,
you may analyze these instead of re-recording a pilot. Keep them **outside
the Git checkout**, never upload them to the backend, and obtain explicit
consent for any retention. File layout:

```text
C:\PAD-Private-Session\
    live\       (fresh camera view of real consenting adult)
    print\      (fresh camera view of PHYSICAL print)
    replay\     (fresh camera view of a SEPARATE replay screen)
```

Supported local JPEG, PNG, WebP, MP4, MOV, AVI, MKV; max 30 MiB per file,
max 10 presentation files per category. Each file/video = **one** trial;
up to eight time-separated video frames are checked, not counted as eight
independent samples. Refuse missing consent, symlinked or oversized data.
Confirm a genuinely LIVE category does not contain a print; the previous
pilot suffered a category mixup.

Download models only from the checksum-pinned repository scripts if they
are not already present on your PC:

```powershell
py -3.11 identity-ai/download_passive_pad_model.py
py -3.11 identity-ai/download_pad_v1se_model.py
py -3.11 identity-ai/download_yunet_model.py
```

Then, **only with explicit participant consent and accurate physical labels**:

```powershell
$env:PYTHONPATH="identity-ai"
py -3.11 identity-ai/evaluate_pad_ensemble_local.py --samples "C:\PAD-Private-Session" --consent-confirmed --operator-labels-reviewed --camera-type laptop_built_in --lighting indoor_artificial --aggregate-json "C:\PAD-Four-Hypothesis-Counts.json"
```

No network calls, photos, embeddings, person names, filenames, or per-trial
scores are included in the exported report. The report is NEW-only, created
outside the repo/media directory, not overwritten. The evaluator **does not
delete** the input recordings. Participants must agree to storage duration,
access and deletion, and you must delete them after the authorized study.

## What the report DOES and DOES NOT mean

- `perHypothesis`: separate V2-raw, V2-normalized, V1SE-raw and
  V1SE-normalized coarse observed-live/attack/inconclusive counts.
- `researchRiskCounts.printOrReplayAnyHypothesisObservedLive`: safety red
  flag if **any** one of four hypotheses calls an attack presentation live,
  even when the four-model consensus abstains. This must never be hidden by
  a stricter final threshold.
- `printOrReplayFourWayLive`: physical attack presentations where all four
  model/scale observations across the sampled frames say live. THIS IS STILL
  A FALSE-LIVE RED FLAG, NOT proof a consensus system is safe.
- `genuineNotFourWayLive`: genuine presentations classified attack or
  inconclusive by the conservative research ensemble. Warns about friction,
  unfair genuine-user failures, blur and lighting sensitivity.
- `allPresentationTypesSampled` is a simple coverage check, **not**
  evidence of correct ground truth, distinct participants, or representative
  sampling.
- `modelClassMappingValidated=false`,
  `modelThresholdCalibrated=false`, `independentPadValidated=false`,
  `identityDecisionUse=none`, `automaticApprovalAllowed=false` remain
  mandatory. **Do not advertise the raw fractions as certified APCER/BPCER**.

A real independent study needs a properly documented threat model,
independently confirmed labels, adequate consenting genuine/attack subjects,
different real devices/lighting and trained evaluation supervision. Use
proper PAD methodology before setting any threshold or approving production
biometrics. Code QA, model loading and a tiny operator-labeled pilot do not
resolve printed-photo false acceptance or guarantee replay resistance.

## Release gates

- No real ID/selfie media uploaded to the staging backend: its HTTP 423 gate
  remains enabled.
- No automatic Verified Resident grant based on the experiment.
- No live `volunserve.com` deployment.
- No independent PAD accuracy is yet measured by the automated tests. The
  code can produce actual local results **only when consenting people
  physically present valid presentations to a locally controlled camera**.
