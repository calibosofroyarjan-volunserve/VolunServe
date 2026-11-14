# Test VolunServe SFace with two photos (local, no webcam)

This is a **research diagnostic**, not a way to verify a Resident account or
prove liveness. The script runs on **your own Windows PC**. It takes two
already-saved images, corrects JPEG EXIF rotation from phone cameras, and
attempts 1:1 YuNet + SFace matching. It does not upload anything, save face
templates, change Firebase, or connect to production. It can tell you whether
the model produced an *uncalibrated similarity observation*, **not** whether
the pictured person is definitively the same.

## Prepare once

1. You need Python 3.11 with `numpy==1.26.4`,
   `opencv-contrib-python==4.11.0.86` and Pillow. Existing VolunServe
   `identity-ai/requirements.txt` includes these Python dependencies.
2. On your own machine, with informed consent from anyone whose image you
   use, put two images in a private directory **outside the repository**.
   One should be a cropped/clear ID portrait, the other a separate selfie
   captured on a phone. Do not send them to ChatGPT, GitHub, Render or Firebase.
   Do not upload real documents to the disabled staging photo endpoints.
3. If the local checksum-pinned models are absent, download official
   weights locally (models, **not** face images):

   ```powershell
   py -3.11 identity-ai\download_yunet_model.py
   py -3.11 identity-ai\download_sface_model.py
   ```

   The scripts enforce pinned hashes. If downloads fail, no synthetic/fake
   facial similarity will be substituted. Review the third-party model
   licenses in the repository before downloading.

## One comparison (no CSV and no laptop camera)

From the repository root, in Windows PowerShell:

```powershell
py -3.11 identity-ai\check_sface_two_photos_local.py --image-root "C:\PrivateFaceQA" --id-image "id.jpg" --selfie-image "selfie.jpg" --consent-confirmed
```

This uses **only** those two files. Paths are relative to the private
`--image-root` and file access outside that folder is refused. Images
should already be oriented by EXIF metadata if needed; the local evaluator
now handles JPEG phone rotation the same way as the backend decoder.

Possible outputs:

- `modelStatus=similarity_observed_unvalidated`: SFace computed a finite
  cosine similarity. The number is **not a match percentage**, a verified
  same-person decision, or biometric accuracy certification.
- `stage=id_face_not_detected`: the ID portrait cannot be reliably
  detected; retake/crop with a clear visible portrait and adequate lighting.
- `stage=selfie_face_not_detected`: the selfie face is not detectable.
- `stage=duplicate_capture`: identical decoded images; take a distinct
  selfie. This guard does **not** detect edited copies or screen replays.
- `stage=models_not_installed`: the pinned local YuNet/SFace weights are
  missing/unavailable; use the model download scripts.
- `image_unreadable`: private files are invalid, damaged, or out of
  permitted bounds.

For reliable accuracy evaluation beyond a *single diagnostic*, use the
existing `evaluate_sface_pairs_local.py` with many independently labeled,
consented **same-person and different-person** pairs. Its aggregate observed
false-accept/false-reject rates do not certify population accuracy or PAD.

**Do not enable automatic account verification based on any SFace/MediaPipe
score.** No validated real-device recognition results, live-ID authenticity
check or anti-spoofing evidence are established by this local test. Admin
authorization and independent document review are still mandatory.
