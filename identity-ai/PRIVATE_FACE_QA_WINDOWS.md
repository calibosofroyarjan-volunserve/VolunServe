# VolunServe private face-match QA — Windows guide

**Status:** Local-only evaluation kit. This does not validate independent PAD, official government-ID authenticity, or production-grade false-match rates.

## Before collecting any photos

- Obtain voluntary, informed consent from each adult participant, including purpose, use of reference portraits/selfies, access restrictions, and deletion date.
- Do **not** use production Resident accounts, genuine government ID documents, production Firebase, Render uploads, GitHub, ChatGPT files, or shared cloud drives.
- For the first pilot, use consented portrait-style photos and separately captured fresh selfies. This measures the **matching function**, not government-ID issuer authenticity.
- Store all private photos in a restricted Windows folder **outside the VolunServe repository**. Avoid names or ID numbers in filenames and never share individual scores.

## One-time setup

1. Use Windows 10/11 and Docker Desktop configured for Linux containers.
2. Download/clone the feature branch **qa/identity-private-offline-matching-20261112**, not a production branch. Do not deploy this QA branch.
3. Make a private Windows folder at C:\VolunServePrivateFaceQA\images\ (outside the GitHub checkout).
4. Copy consenting adults' portrait-style photos and separately taken selfies there, using arbitrary filename codes.

## Private manifest — example layout only

Create C:\VolunServePrivateFaceQA\pairs.jsonl containing one JSON object per line. The example filenames are fictional: the real local file paths must match your privately collected images.

    {"label":"genuine","reference":"images/a_reference.jpg","probe":"images/a_selfie_1.jpg"}
    {"label":"genuine","reference":"images/b_reference.jpg","probe":"images/b_selfie_1.jpg"}
    {"label":"impostor","reference":"images/a_reference.jpg","probe":"images/b_selfie_1.jpg"}
    {"label":"impostor","reference":"images/b_reference.jpg","probe":"images/a_selfie_1.jpg"}

Each portrait/selfie must be a genuinely separate capture, with exactly one consenting adult. Genuine = same person; impostor = different consenting people. Use a mix of lighting and supported devices as practical; 5–10 people is only a functionality pilot, not formal accuracy validation.

## Windows PowerShell command

From the directory containing the checked-out QA branch:

    .\identity-ai\Run-Private-Face-QA.ps1 -PrivateFolder "C:\VolunServePrivateFaceQA"

The script builds an image using source code only; it runs the matcher inside a container with **networking disabled** and the private image folder mounted **read-only**. The face photos are not in the Docker build context and are not uploaded anywhere by the script.

The output is aggregate-only: FMR, FNMR, and failure-to-acquire counts, with descriptive Wilson 95% intervals. Never share raw files, filenames, per-pair scores or identifiable test records.

## Reading the results

- FMR is the fraction of scorable different-person comparisons at or above the tested threshold.
- FNMR is the fraction of scorable same-person comparisons below the tested threshold.
- Failure-to-acquire reports images that cannot be assigned a reliable comparison score. Those are excluded from the denominator of FMR/FNMR and reported separately.
- Missing genuine or impostor data produce a null result, not a misleading 0% error.
- The offline script assumes threshold 0.78 by default. Verify whether the production Render AI uses an environment override, without revealing secret values, before drawing conclusions.
- Trials repeatedly using the same participants are correlated; the confidence bounds do not certify low real-world error.

## Separate camera challenge observations

On your phone, open https://volunserve-identity-test-staging.onrender.com and use Sections 4–6 for camera FPS, lighting, real-person challenges, printed-photo and screen-video replay observations. These are **camera challenge tests, not certified PAD**. Do not upload actual government IDs or selfies to staging: its full Firebase/Render isolation is not yet verified.

## Retention and approval gate

Use OS access restrictions/disk encryption where possible. Delete private images and manifests at the end of the consented retention period or upon withdrawal. Only aggregate results should leave the private computer.

**Product workflow:** eligible Basic Resident → voluntary ID/selfie application → AI screening and provisional comparison → pending Admin review → independent authorized Admin approval → Verified Resident. A high score alone never grants Verified Resident access.
