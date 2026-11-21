# VolunServe — Critical AI identity validation (staging research only)

**Scope:** three selected IDs (Philippine National ID, Driver's License, Passport), 1:1 face comparison, printed portrait / screen-replay presentation attacks, and secure Resident → Admin status flow. No action below authorizes auto-approval.

## Truthful status

| Critical question | Evidence | Status |
|---|---|---|
| Does SFace load with YuNet and produce 1:1 raw cosine observations? | Pinned model loads; synthetic tests and private two-photo score path | **Implemented, not real-person validated** |
| Does SFace distinguish genuine same-person from impostors? | Independent real paired, labeled, multi-person tests not supplied | **Accuracy UNKNOWN** |
| Can print/video replay spoof the camera? | Experimental correlated MiniFASNet V2/V1SE only; a prior properly labeled print produced a model-live raw observation | **Attack resistance NOT validated** |
| Can an AI score automatically make a Resident Verified? | No; Admin-only server gates, model status `identityDecisionUse=none` | **Must remain disabled** |
| Does actual hosted Resident → Admin browser login, queue, decision and status work? | Synthetic Auth/Firestore E2E and anonymous hosted endpoint checks exist; no authorized signed-in hosted account acceptance | **Not yet proven** |
| Are real ID/selfie uploads approved for staging? | Explicit HTTP 423 until privacy/security sign-off | **Disabled** |

## A. Local consented real-photo SFace evaluation

Do NOT upload real photos, IDs, biometric data or per-user scores to GitHub, Render, Firebase, ChatGPT, or the deployed website.

Create a private folder **outside** your Git repository. Place **separately captured** consenting ID portraits/face-photo images and independent selfies under `images/`. Create a `pairs.csv` with exactly `id_image,selfie_image,same_person` and labels `same` or `different`, with independently checked pair labels. Include multiple consenting adults and multiple devices/sessions; multiple frames of one person are not independent people.

Use a separately documented, operator-chosen **research candidate** threshold. Do **not** claim that this is a production SFace threshold. Example PowerShell command with the operator's chosen numeric threshold `$candidateThreshold`:

```powershell
$env:PYTHONPATH="identity-ai"
py -3.11 identity-ai/evaluate_sface_pairs_local.py --pairs-csv "C:\FaceQA-Private\pairs.csv" --image-root "C:\FaceQA-Private\images" --threshold $candidateThreshold --aggregate-json "C:\FaceQA-Aggregate-Only.json" --consent-confirmed
```

The report includes same/different scored/unscorable counts, false-accept / false-reject rates, **one-sided 95% uncertainty bounds** (the independence assumption may be violated) and a genuine no-positive-result fraction. Small correlated samples, even with 0 observed false accepts, **do not prove reliable face recognition**. Keep `identityDecisionUse=none`.

## B. Private physically labeled PAD (live / print / replay)

With consent, use a separate camera to record the actual *physical presentation* to the scanner in three private directories: `live/` (person present), `print/` (printed consenting face portrait held in front of camera), `replay/` (camera observing consenting face replay on another screen). Merely supplying a printed-picture file or original prerecorded clip **does not simulate a physical presentation attack**. Do not use an ID card in a PAD attack trial.

```powershell
$env:PYTHONPATH="identity-ai"
py -3.11 identity-ai/evaluate_pad_ensemble_local.py --samples "C:\PAD-Test-Private" --consent-confirmed --operator-labels-reviewed --camera-type laptop_built_in --lighting indoor_artificial --aggregate-json "C:\PAD-Aggregate-Only.json"
```

Every **video is one physical presentation trial**, regardless of its sampled frame count. A model-prefers-live observation on a print/replay is a **security red flag even if the four-way model consensus is inconclusive**. Scores do not imply ISO/IEC 30107-3 certification or calibrated detection performance. MiniFASNet models share a training family and are **not independent PAD corroboration**.

## C. Combine evidence without permitting release

```powershell
py -3.11 identity-ai/critical_biometric_risk_gate.py --sface-aggregate "C:\FaceQA-Aggregate-Only.json" --pad-aggregate "C:\PAD-Aggregate-Only.json"
```

The combined gate reads only private *aggregate* JSON. It reports missing different-person samples, unscorable photographs, false accepts, attack false-live observations and genuine-user failures. It always returns `automaticIdentityApprovalAllowed=false` and `status=research_evidence_only_release_blocked`. **Do not edit those safeguards** to force a pass.

## D. Secure hosted staging Resident/Admin workflow

Use separately approved **staging** accounts only. No staging/production passwords, tokens, ID images or selfies should be sent to ChatGPT, issues or CI.

1. Basic Resident requests **in-person no-media LGU review**; expected status is **Pending** and `identityVerified=false`.
2. Authorized operational Admin signs in and sees the Pending item; a Basic Resident must be forbidden from accessing the Admin queue.
3. For a test **without actual physical original ID examination**, choose **Require Retry**, not Verify. Assert Resident remains **Unverified** and audit records the decision.
4. Only when an authorized reviewer has physically checked the original government ID, compared the face in person, completed the permitted independent document check and documented their review may the Admin attest and Verify.
5. Keep server-side credentials scoped to staging. HTTP 423 for ID/selfie upload and no biometric automatic grant must remain intact, even if SFace/PAD research scores look promising.

**Release decision:** Local evaluation and synthetic CI help identify failures and support a defensible defense/demo, but cannot replace independent accuracy/PAD validation, privacy/retention review, issuer checks, or authorized hosted browser acceptance. Live `volunserve.com` must not be modified on the basis of this report.
