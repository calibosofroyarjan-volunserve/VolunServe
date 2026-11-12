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
- In the camera preview, press **C** to capture each photo or **Q** / Escape to cancel. `same` and `different` each require two separate captures. Let the second person step in only after consent for `different`. Move/change the angle between the two `same` photos.
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
