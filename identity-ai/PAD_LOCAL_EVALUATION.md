# VolunServe — private local PAD evaluation (staging only)

**Purpose:** Measure whether the *current experimental* MiniFASNetV2 shadow classifier tends to confuse camera-captured real faces, printed photographs and screen replays. It is **not** certified liveness, independent presentation-attack detection (PAD), proof of ID authenticity, or a reason to approve Verified Resident accounts. Identity media uploads remain disabled.

## What is already integrated

The Render **staging** Python AI Docker build automatically downloads the small `minifasnet_v2.onnx` model from [garciafido's model page](https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx) and verifies the exact **SHA-256** `d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b`. No manually uploaded model weights are needed on Render.

The original [MinivisionAI classifier](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/test.py) treats **class 1 as real face**, while classes 0 and 2 mean presentation attacks. The third-party ONNX model card describes a conflicting class order; the staging shadow code uses the upstream order and **must still be checked against genuine labeled camera samples**. Never use an uncalibrated model result to grant verified identity.

## November 13, 2026 — source preprocessing audit and open risks

- **Corrected in staging:** The originally deployed VolunServe shadow PAD used `max(face_width, face_height) * 2.7` for both crop dimensions, creating a square ROI unlike upstream MiniVisionAI. The staging code now enlarges **face width and height independently by 2.7×**, before resizing to the model's 80×80 input. In VolunServe, missing/ambiguous/edge-truncated face context still fails closed as `inconclusive`, instead of padding invented pixels. This is intentionally stricter than upstream's coordinate clamp/shift behavior.
- **Input scale unresolved:** Upstream MiniVisionAI `src/data_io/functional.py` `ToTensor()` uses `torch.from_numpy(...).float()` for NumPy input; its `div(255)` is commented out. The third-party ONNX model card instead prescribes BGR `pixel/255`. Staging preserves the pinned ONNX card format while the exact converter is independently audited; **do not switch input normalization to force a successful test**.
- **Class mapping unresolved:** Upstream `test.py` treats **class 1** as a genuine image, whereas the converted ONNX model card describes class 0 as genuine. Current VolunServe observations are explicitly `unvalidated`, even if a model logit looks confident. A model output is not proof that the picture came from a live camera.
- **Observed failure:** The user's consented live-face retest produced `class_2` under both 0–255 and 0–1 pipelines (one example only). This raises a **possible false rejection**, not a validated label or measurement of deployed PAD performance. No multi-condition genuine/print/replay results with adequate face framing are available to establish practical accuracy.
- **Readiness contract:** `modelLoaded: true` only means the pinned network initializes. `independentPadValidated`, `modelClassMappingValidated`, `modelInputScaleValidated`, and `thresholdCalibrated` remain **false**, with `identityDecisionUse: none`. No staging or production identity claim may turn these into true merely because a test passes.
- **Actual handler isolation:** The synthetic test `test_pad_shadow_decision_isolation.py` runs the genuine `main.py:run_face_verification` function with mocked, non-biometric inputs and confirms that *all* single-frame PAD outputs, including favorable `model_prefers_live_unvalidated`, still lead to `manual_review`, not automatic verification.
- **Release gate:** This patch is a **technical consistency + safety fix**, not a certified liveness implementation. Before any real-media upload or production identity gate, evaluate the exact ONNX conversion, representative consenting genuine/attack samples across devices, lighting and camera frames, privacy/retention authorization, and independent PAD evidence. Keep issuer/LGU manual review and account access guards.

Upstream audit references:

- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/generate_patches.py
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/data_io/functional.py
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/test.py
- https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx

## New private dual-scale real-device pilot (Nov 13, 2026)

The original PyTorch/ONNX weight parity audit passed **20/20 same-tensor synthetic comparisons**. That resolves numerical conversion and index-order parity on those inputs, **not** which normalization works best for a real camera subject. The upstream NumPy path uses raw 0–255 BGR values, whereas the third-party converted ONNX card says 0–1 BGR. The staging shadow still uses 0–1 and has a previously observed possible genuine-face false rejection.

For a stricter **local-only comparison**, use `identity-ai/evaluate_pad_scales_local.py`. It evaluates the **same cropped frame under both 0–255 and 0–1** without uploads, exports only aggregate paired-trial counts, enforces explicit consent and checks for both pinned MiniFASNet and YuNet models. See [PAD_REAL_DEVICE_DUAL_SCALE_QA.md](PAD_REAL_DEVICE_DUAL_SCALE_QA.md) for the full capture protocol, Windows commands and interpretation. This new evaluation path **does not enable automatic identity approval or claim independent liveness validation**.

## Test safely on your own Windows computer

Python **3.11** and a Git checkout containing the latest staging code are needed. A browser alone cannot execute this private local evaluator.

1. Open Terminal/PowerShell in the cloned VolunServe repository.
2. Install lightweight local evaluator dependencies (no full TensorFlow or PyTorch):

   ```powershell
   py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86
   ```

3. Download the pinned model **to your own PC** (this does not upload anything):

   ```powershell
   py -3.11 identity-ai/download_passive_pad_model.py
   ```

4. Create a folder **outside** the Git repository, with these three directories:

   ```text
   C:\PAD-Test-Private\
     live\
     print\
     replay\
   ```

5. Capture consenting, local test material:
   - `live/`: photos or short videos of **your own live face actually viewed through a camera**, not an old saved portrait.
   - `print/`: **camera photos/videos of a printed face photograph** held up to the same camera. The original digital face image itself is *not* a print-attack sample.
   - `replay/`: **camera photos/videos of a different screen playing a facial video**, as viewed by the verification camera. The original prerecorded clip (before it is displayed on a screen) is *not* a replay-attack sample.

   No government ID images. Use only your own face or people who explicitly consent. Keep every recording on your PC; **never attach samples to a GitHub issue, commit, or public chat**.

6. Run the test **locally**, without staging uploads:

   ```powershell
   py -3.11 identity-ai/evaluate_passive_pad_local.py --samples "C:\PAD-Test-Private"
   ```

The console prints **aggregate counts only** for each type plus two exploratory fractions:
- `exploratoryAttackAcceptedFraction`: simulated print/replay trials that the *shadow model* labeled live, divided by all evaluated attack trials.
- `exploratoryGenuineNotAcceptedFraction`: live trials labeled attack **or inconclusive**, divided by all evaluated live trials. Since uncertain presentations would be rejected in a fail-closed policy, they count as unsuccessful for a real user.

If you choose to save counts locally, append `--aggregate-json "C:\PAD-Aggregate-Only.json"`. No file paths, images, embeddings, user IDs or per-person scores are included in the output.

## Evaluation rules and limitations

- Count **one video file as one trial**; the tool samples up to eight frames in the first ~eight seconds. Frames within one video are correlated and are NOT counted as eight people or eight independent trials.
- `inconclusive` or missing model is **not** a passed liveness check. A clip with any frame labeled live is conservatively counted as potentially accepted; this flags attack risk rather than masking it.
- Test multiple camera models, lighting conditions, and separate sessions. A handful of user-produced samples can identify obvious bugs, **not establish a population-level attack acceptance rate**.
- The initial `0.75` confidence threshold is exploratory and **not calibrated**. Do not adjust it to make a tiny sample set appear successful.
- The label convention is based on upstream source code; verify it with actual labeled captures. For formal PAD use an independently evaluated provider and a protocol addressing ISO/IEC 30107-3, plus privacy, security, presentation-attack instrumentation, bias and independent attacker testing.
- **Never turn this script into an automatic Verified Resident gate**. It is a local QA metric only. Back-end media upload remains HTTP 423 and Admin review remains separately authorized.
- Videos and raw images exist on **your private PC** only; remove them when no longer needed.

### What to report back to the project

Share only the aggregate report (counts and fractions, no photos or videos). Then we can decide if the model should be replaced, enhanced, or withheld pending third-party PAD validation.
