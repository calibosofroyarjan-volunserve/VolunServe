# VolunServe — private camera accuracy QA (staging / defense)

**Status: QA tooling only, NOT independently validated.** Keep staging identity media uploads disabled, independentFaceMatchValidated=false and independentPadValidated=false. No automatic Verified Resident approval. Do not send personal images or biometric data to GitHub, chats, the public internet or model vendors.

## Existing integration

- Staging Docker loads SHA256-pinned OpenCV SFace, YuNet and MiniFASNet.
- SFace observes an **uncalibrated 1-to-1 similarity score**; a matching model loading successfully is not real-world accuracy.
- MiniFASNet is an **experimental single-frame** anti-spoofing classifier. Blink/head movement, a positive model score, or a video challenge do not establish independent liveness.
- The Node staging backend deliberately blocks media submissions (HTTP 423). Resident approval must remain restricted to authorized manual Admin review.

## Quick camera capture (recommended)

Use the **GUI-enabled** OpenCV package on Windows so the live camera preview actually opens. The server's headless OpenCV package is not suitable for this desktop capture window. In a separate local checkout of this **draft QA branch**, run in PowerShell:

~~~powershell
py -3.11 -m pip uninstall -y opencv-contrib-python-headless opencv-python-headless
py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python==4.11.0.86
~~~

For each test class, start the camera manually:

~~~powershell
py -3.11 identity-ai/capture_private_camera_qa.py --kind same
py -3.11 identity-ai/capture_private_camera_qa.py --kind different
py -3.11 identity-ai/capture_private_camera_qa.py --kind live
py -3.11 identity-ai/capture_private_camera_qa.py --kind print
py -3.11 identity-ai/capture_private_camera_qa.py --kind replay
~~~

- The script will explicitly ask whether **all photographed people consent** before opening the camera. A denial leaves no files.
- In the camera preview, **click inside the video**, press **Space**, or press **C** (uppercase/lowercase) to capture each photo. Press **Q** / Escape to cancel. The counter `2/2` means the first of two pictures was already captured and the second remains. `same` and `different` each require two separate captures. Let the second person step in only after consent for `different`. Move/change the angle between the two `same` photos.
- For `print` and `replay`, the camera must photograph the physical printed picture or a second screen showing a consented face video; never copy the source digital file into the test folder.
- Data are stored **only** on your PC under `%USERPROFILE%\VolunServe-Private-QA\face` or `%USERPROFILE%\VolunServe-Private-QA\pad`. Each new capture is placed in a new numbered local trial. The tool makes **no network request**, does not need an ID photo, and does not grant Verified Resident.
- Repeat with multiple **consented** camera trials for meaningful exploratory observations. One capture in each class is a smoke test, not a scientific validation.

After taking the photos, install the hash-pinned models and run both **local-only** evaluators:

~~~powershell
py -3.11 identity-ai/download_yunet_model.py
py -3.11 identity-ai/download_sface_model.py
py -3.11 identity-ai/download_passive_pad_model.py
py -3.11 identity-ai/evaluate_sface_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\face"
py -3.11 identity-ai/evaluate_passive_pad_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\pad"
~~~

Share **only the console's aggregate counts** if you want help interpreting them; do **not** upload raw camera images/videos or actual government IDs to a public service.

## Alternative: supply your own previously captured, consented local test samples

Face matching requires two distinct camera photos per pair. Use a folder OUTSIDE Git:

    C:\VolunServe-Face-Private\
      same\
        pair001\
          first.jpg
          second.jpg
        pair002\
          first.jpg
          second.jpg
      different\
        pair001\
          first.jpg
          second.jpg

- In same, both photos are different captures of the **same** consenting person.
- In different, the two photos show **different** consenting people.
- Exactly two JPG/JPEG/PNG/WebP images per pair; max 10 MiB/file; up to 100 pair folders per class. Never use a government ID photo, old account profile, or someone else's face without consent.
- Prefer diverse physical cameras, lighting, sessions and face orientations. Do not name files after real people.
- The evaluator does not upload media or save raw images, per-person scores, face embeddings or file paths.

Anti-spoofing requires camera-captured **presentations**, also stored outside Git:

    C:\VolunServe-PAD-Private\
      live\     (consenting person actually at the verification camera)
      print\    (camera recording a printed face picture)
      replay\   (camera recording another screen playing a facial video)

A digital video on its own is NOT a replay-attack example: record the screen presenting the video using the verification camera. Each video is one presentation trial, even if several frames are inspected.

## Run on your private computer (Python 3.11)

For manually captured photos **outside Git**, use these alternate output folders. If you used the quick camera commands above, you already have the output automatically and do not need to repeat the capture steps.

    py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python==4.11.0.86
    py -3.11 identity-ai/download_yunet_model.py
    py -3.11 identity-ai/download_sface_model.py
    py -3.11 identity-ai/download_passive_pad_model.py

    py -3.11 identity-ai/evaluate_sface_local.py --samples "C:\VolunServe-Face-Private" --aggregate-json "C:\VolunServe-Face-Aggregate.json"
    py -3.11 identity-ai/evaluate_passive_pad_local.py --samples "C:\VolunServe-PAD-Private" --aggregate-json "C:\VolunServe-PAD-Aggregate.json"

Official model downloads need internet access; actual test media processing happens locally. Model hashes, licenses and source attribution are documented in THIRD_PARTY_MODELS.md. No third-party promotional logo is required on VolunServe user screens; preserve legal attribution.

## Critical ONNX input-scale discrepancy (QA comparison only)

The original MiniVisionAI src/data_io/functional.py to_tensor method for
NumPy images returns img.float() with pixel values in **0..255** (its
previous division by 255 is commented out in the upstream source). However,
the third-party ONNX model card specifies **0..1** normalized BGR input.
The third-party card also describes class 0 as live, conflicting with
upstream test.py (where class 1 is genuine). These are unresolved
model-export/provenance discrepancies, not grounds to flip class labels.

**We DO NOT change the existing staging or production PAD predictor**
on this evidence alone. The following local-only comparison evaluates
both scales on the **same consented saved photo** using the same
hash-pinned model and rectangular 2.7x face crop:

~~~powershell
git pull --ff-only origin feat/staging-private-face-pad-evaluation-20261113
py -3.11 identity-ai/compare_pad_input_scales_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA-Retest\pad"
~~~

Only aggregate counts for class_0, class_1, class_2 and inconclusive
are reported separately for source_raw_0_to_255 and onnx_card_0_to_1.
No per-person predictions, confidences, images, embeddings, names,
image paths or biometric information leave your PC.

**The class numbers are NOT independently validated live/attack labels.**
One genuine example cannot identify the correct input scale or verify
the ONNX class mapping. Compare several real consented live,
printed-photo and screen-replay trials under different conditions.
No preprocessing mode is automatically enabled in account approval.

Original upstream and third-party sources:
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/data_io/functional.py
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/test.py
- https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx
## Investigating a genuine face labeled as an attack

A consented LIVE camera sample was labeled `model_prefers_attack_unvalidated`
in exploratory testing. This is a **potential false rejection**, not evidence
of a real spoof. The 2.7x context failure was already fixed by increasing
camera distance, and the next issue is the model classification itself.

Source review (2026-11-13):
- Official MiniVisionAI `src/generate_patches.py` scales face bounding-box
  **width and height independently** before 80x80 resizing. Earlier VolunServe
  implementation used a SQUARE ROI based on the longer dimension. This QA
  branch corrects the ROI shape, while retaining fail-closed rejection when
  the 2.7x context would extend outside the frame.
- The original `src/anti_spoof_predict.py` applies only ToTensor (BGR image
  values divided by 255) and then softmax; our input follows that order,
  without RGB channel swapping.
- The original MiniVisionAI `test.py` treats class **1** as genuine. The
  third-party ONNX model card claims class **0** is genuine. This conflict
  is NOT resolved by changing labels on the basis of a single person's test.
- The original evaluation combines predictions from several anti-spoof
  models, whereas our experimental ONNX QA currently uses a single MiniFASNet
  model. Its reliability is therefore not equivalent to the upstream
  ensemble.

Check the corrected code and repeat **several** consented local LIVE camera
captures under diffuse/bright lighting. Avoid pointing a bright window
behind the subject. Use the same method on actual print and screen replay
presentations. You must not change the confidence threshold, flip labels,
remove the face-context check, or automatically approve Verified Resident
to obtain an artificially successful report.

~~~powershell
git pull --ff-only origin feat/staging-private-face-pad-evaluation-20261113
py -3.11 identity-ai/capture_private_camera_qa.py --kind live --camera 0
py -3.11 identity-ai/diagnose_passive_pad_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\pad"
py -3.11 identity-ai/evaluate_passive_pad_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\pad"
~~~

With the corrected crop, retest output may change, but success is **not
guaranteed**. If genuine faces are still called attacks across reasonable
conditions and devices, record this as a model limitation and use an
independently evaluated PAD system for any future automated identity gate.
Only aggregate counts should be shared.

Source links:
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/generate_patches.py
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/anti_spoof_predict.py
- https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/test.py
- https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx

## When every PAD test is inconclusive

An all-inconclusive result is **not an anti-spoofing success**. The genuine live
image being inconclusive also means genuine-face acceptance failed in this very
small sample. The 0.0 attack fraction does not establish reliability.

Run the **private, image-only diagnostic** from this branch. It never prints
photos, names, face coordinates or per-person confidence.

~~~powershell
git pull --ff-only origin feat/staging-private-face-pad-evaluation-20261113
py -3.11 identity-ai/diagnose_passive_pad_local.py --samples "$env:USERPROFILE\VolunServe-Private-QA\pad"
~~~

This reports aggregate reasons for each group:

- `face_not_detected`: improve lighting/focus, center one real face and
  capture enough face detail; print/screen samples may be harder to detect.
- `multiple_faces`: keep exactly one pictured face in the frame.
- `insufficient_face_context`: the experimental classifier requires 2.7x
  context around the detected face and refuses crops extending outside
  the image. Move **farther from the camera**, include head and shoulders and
  background on all sides; a large close-up face can cause this despite
  strong detection.
- `model_inconclusive`: face crop was possible but model was uncertain or
  failed. Do not lower the threshold simply to make a test pass.
- `model_prefers_live_unvalidated` or `model_prefers_attack_unvalidated`:
  these are preliminary model observations, **not independent PAD proof**.

Retake the consenting samples with better natural room lighting, one
well-centered face and more space around the head; use a separate
video replay/printed-photo sample captured by the webcam, not the
original digital file. The classifier and scoring policy remain unmodified.

## How to read the outputs

- SFace samePersonNotAcceptedFraction: at a **fixed experimental threshold**, the fraction of genuine same-person pairs that score too low or are inconclusive.
- SFace differentPersonPotentiallyAcceptedFraction: the fraction of different-person pairs scoring high enough for a *potential* false match. Inconclusive pairs never count as accepted.
- PAD exploratoryAttackAcceptedFraction: printed-photo or replay trials where the experimental classifier labeled any frame as live.
- PAD exploratoryGenuineNotAcceptedFraction: genuine live presentations marked as attack or inconclusive.
- Counts are per **pair/presentation**, never per correlated video frame. Small samples have high uncertainty. Do not tune thresholds only to pass your own small sample set.

**These numbers are NOT certified biometric FMR/FNMR, PAD protection under ISO/IEC 30107-3, proof of government-ID issuer authenticity or grounds for automatic identity approval.** Neither script changes the verification backend.

## Next safety and final-defense gates

- [x] Staging model integration, Docker startup and no-deploy synthetic tests previously passed.
- [x] Private SFace similarity and PAD exploratory aggregate testing tools provided.
- [x] Consent-first local webcam capture CLI, no-upload/no-overwrite and synthetic tests provided (draft QA PR).
- [ ] Real consented same-person and different-person pairs tested across devices and sessions.
- [ ] Real live/printed-photo/screen-replay cases captured using physical cameras.
- [ ] Independent error analysis, threshold calibration and multi-camera spoof evaluation.
- [ ] Privacy/retention review, authorized staging media, and manual Admin review end-to-end.
- [ ] Issuer authenticity independent check and separate protected production release approval.

**Accurate defense statement:** VolunServe integrates pretrained face models and OCR with a custom verification workflow, screening policy and Admin-review controls. The team does not claim the pretrained models were trained from scratch or that PAD, issuer authenticity and automated Verified Resident decisions are certified. Delete test media when evaluation concludes; share only aggregate JSON counts, never raw faces or IDs.
