# VolunServe — measured face matching and challenge observations
**2026-11-12 | Staging evaluation plan | no production access or biometric uploads in QA reporting**

## Product workflow: Basic Resident to Verified Resident
Every active **Basic Resident** is eligible to start the existing **Become a Verified Resident** application. It is **not** an automatic status conversion.

1. Basic Resident signs in to their own account and consents to ID and face processing.
2. User captures an allowed government ID: National ID, Driver's License, Passport, UMID or PRC ID. National/Driver/UMID/PRC require correct front/back images; passport uses its bio page.
3. Document OCR checks type, side plausibility, image quality and hints against the stored user profile (including birthday and barangay). OCR is **not** official issuer authentication.
4. Face matching compares a document portrait with the applicant's new selfie, returning a similarity score. Camera movement prompts do **not** prove liveness.
5. Server records **pending Admin review** or retry. AI cannot set `identityVerified:true`, even when its score is high.
6. A separately authorized LGU/Admin performs an independent document review and explicitly approves the Resident. **Only then** is the Basic Resident's status promoted to **Verified Resident**. Unsupported IDs/reversed sides require retry, and all failures must preserve safe access to the Basic Resident account.

There is no mass conversion of existing Basic Resident accounts. Users must apply voluntarily with explicit consent.

## Do not use real people until isolation and consent are ready
The existing isolated staging camera QA page is at `https://volunserve-identity-test-staging.onrender.com`.
**The Render staging Node/AI branches and their secret project alignment have NOT yet been independently verified for `volunserve-full-staging`. Do not send genuine government IDs, faces, names or account tokens to staging until it passes the startup isolation gates.** There is no reason to upload real images to GitHub issues, ChatGPT, spreadsheets or the metrics website.

The **Section 6** local score calculator does not upload or store input. It only accepts numbers in 0..1 and produces aggregated results. Score values should come exclusively from **consented, offline, independently isolated tests of the actual production matching algorithm**. Do not type names, emails, file paths or identification numbers. Refrain from copying individual biometric similarity scores outside the controlled evaluation; only aggregated metrics should leave it.

## Evaluation design
* **Genuine (same-person) trials:** Capture multiple approved portraits/selfies of the same consenting adult under varied supported-device and normal lighting conditions. Label each pair as genuine before measuring.
* **Impostor (different-person) trials:** Compare consented portrait/selfie pairs from different adult subjects in a private offline test setup. Label as impostor before scoring. Never log in to or impersonate another user's VolunServe account.
* **Threshold:** The current production FaceMesh landmark score threshold defaults to `0.78`, but may be overridden by an environment variable. Confirm actual production configuration before interpreting results. Threshold comparisons shown in the UI are **hypothetical**, not deployment updates.
* **False Match Rate (FMR):** fraction of impostor scores **greater than or equal to** the chosen threshold.
* **False Non-Match Rate (FNMR):** fraction of genuine scores **below** the threshold.
* **Uncertainty:** The report uses 95% Wilson intervals, which assume independent trials; multiple captures per subject are correlated, so treat these bounds as descriptive, not a biometric certification.
* **Minimum honest reporting:** both genuine and impostor datasets must be present for a two-sided matching assessment. A small 5–10 adult pilot checks basic usability only and does **not** substantiate a low false-match rate. Preserve participant-level independence in the restricted internal protocol, but do not include participant identifiers in shareable results.
* **Privacy:** obtain informed, revocable consent and an explicit retention/deletion plan. Keep all raw photos on secured local test storage only, avoid production Firestore/Cloudinary, and erase them after approved measurement.

## Spoofing / PAD observations
Use Section 4/5 on the staging lab's **local live-camera challenge only**, with the consent of anyone depicted. Keep separate counts for:
* Printed photos presented to camera and whether the challenge completes
* Second-screen still/video replay and whether the challenge completes

The reported **observed challenge acceptance** equals accepted presentations divided by attempts. This is **not** an independently certified impostor attack presentation accept rate (IAPAR), nor does rejecting the small pilot set prove resistance to injected video, face swaps or advanced presentation attacks.

**Hard block:** independent PAD remains unvalidated. Do not mark `livenessVerified:true`, do not allow automatic Resident verification, and do not claim the system meets ISO/IEC 30107-3:2023 from this pilot. If any spoof is accepted, capture only nonidentifying notes and preserve manual Admin review. Formal remote identity assurance (e.g., NIST SP 800-63A-4) requires tested PAD with IAPAR <0.07 under ISO/IEC 30107-3:2023, and further independent evaluation would be needed.

## Release gates
- [x] Basic Resident application exists with explicit consent, ID screening, AI score, and Admin-only approval in protected production sources
- [x] Local-only aggregate evaluator for FMR/FNMR and print/screen observed challenge acceptance implemented in staging preview branch
- [ ] Isolated full-staging Firebase/Render branch and credentials verified
- [ ] Representative, consented same-person and different-person comparisons measured offline
- [ ] Validated independent PAD chosen, integrated and appropriately evaluated
- [ ] Real camera/browser tests, accessibility checks and failures reviewed
- [ ] Document-issuer authenticity independently verified via authorized process
- [ ] Final restricted QA signoff before any production threshold/policy changes

**Reference:** NIST SP 800-63A-4, https://pages.nist.gov/800-63-4/sp800-63a.html ; NIST FRVT verification accuracy metric definitions, https://www.nist.gov/system/files/documents/2019/11/20/frvt_report_2019_11_19_0.pdf
