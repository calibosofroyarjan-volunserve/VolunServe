# VolunServe Face Recognition — Staging Accuracy Checklist

**Current reality:** The deployed Hybrid AI is NOT yet demonstrated to
correctly identify real people. The existing MediaPipe landmark comparison
produces an **uncalibrated preliminary geometry score**. The pinned OpenCV
SFace recognizer has implemented 1:1 inference for *research-only* observations
when its local YuNet and SFace ONNX weights are installed/enabled. Its threshold
is **not** approved, calibrated, or validated for automatic Resident approval.
Real staging ID/selfie uploads remain **HTTP 423 disabled**.

## What this update implements

- The main face handler rejects an exactly pixel-identical ID photo and selfie
  before quality checks or model inference, with `identical_id_selfie_image`.
  This catches simple image reuse; it **does not** catch cropped/rephotographed
  ID portraits, deepfakes or replay attacks. It is not liveness detection.
- Local, read-only SFace *paired* scoring can measure observed false accepts,
  false rejects, unscorable images and sample size at an **operator-provided**
  threshold. Only aggregate counts/rates are printed. No images, embeddings,
  paths, IDs or per-user scores are written or sent to any network endpoint.
- Unit tests use synthetic pixel arrays and scores exclusively. Passing the
  tests proves guard correctness, **not** face-identification accuracy.

## When a responsible operator has informed-consent test images

Keep them **outside** Git, Render, Firebase, ChatGPT, cloud drives or application
logs. Build a private CSV file with exactly these columns:

```csv
id_image,selfie_image,same_person
pair-a-id.jpg,pair-a-selfie.jpg,same
pair-a-id.jpg,pair-b-selfie.jpg,different
```

The labels must be verified independently and the images must be placed inside
a single private `--image-root` directory, with paths relative to that root.
Do not upload any of these files to the repository.

From a secured Python 3.11 workstation with installed OpenCV, NumPy, Pillow
and the **checksum-verified** SFace/YuNet ONNX weights already present:

```bash
python identity-ai/evaluate_sface_pairs_local.py \
  --pairs-csv /private/face-qa/pairs.csv \
  --image-root /private/face-qa/images \
  --threshold <operator-validated-research-candidate> \
  --consent-confirmed
```

The placeholder is deliberately not a real numeric threshold. A responsible
operator must choose candidate thresholds and obtain enough consenting
different-person pairs to estimate false-accept rates reliably. Low error on
a few pairs does **not** prove safe identity matching. Use varied devices,
lighting, people, image angles and photo-ID quality. Never reuse one person's
image across both classes by mistake.

**Independent remaining blockers:** authorized staging Admin account;
approved privacy notice/retention/deletion; controlled real ID/selfie testing;
independent presentation-attack evaluation on **printed portraits and
screen replay** with permission; and a controlled release/rollback plan.
Neither a still-photo PAD model nor a high face-similarity score is enough to
declare liveness or issuer authenticity.

Never activate automatic Verified Resident status on SFace, MediaPipe or
research PAD output. Admin must still independently validate the ID and decide.
