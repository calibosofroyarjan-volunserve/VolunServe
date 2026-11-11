# Identity profile consistency, issuer authenticity and liveness release gates

**Candidate only — no merge/deploy**. Applies to draft PRs #409 and #410.
Updated 2026-11-12. No real IDs or selfies should be submitted during initial staging QA.

## Implemented in candidate

- Selected ID type must be one of Philippine National ID, driver's license, passport,
  UMID or PRC ID; school/employee IDs never pass. Front/back OCR orientation clues
  do not certify authenticity.
- The backend reads first/last names, a canonical date of birth (`YYYY-MM-DD`, when
  present) and SJDM barangay from the authenticated Firestore user record, not from
  upload/body form fields.
- Birthday and barangay go privately to the configured backend AI service under
  authenticated internal headers, for transient OCR-only comparison.
- The AI **does not return** the DOB, address, card number, raw OCR, image bytes or
  face templates. Returned values: `possible_match`, `possible_conflict` (DOB only),
  `inconclusive` or `not_checked`. OCR disagreement is a clue for Admin correction,
  not proof of fraud or ground for automated account banning.
- `dateOfBirth` is saved for **new** signup profiles, validated as a calendar date,
  permitted on resident creation by Firestore Rules and not on the standard client
  update allowlist. Older accounts without an exact saved DOB remain `not_checked`;
  age alone cannot reconstruct date of birth. A separately reviewed recovery process
  is required for historic accounts.
- Current sign-up address collects region, province, city and **barangay**, not full
  home/street address. Only the barangay is compared. A National ID or passport
  may not display the holder's current residential address. No address or no
  distinct OCR field -> `inconclusive`, never an automatic mismatch/rejection.
- Backend hardcodes `issuerAuthenticityStatus: not_verified` and
  `presentationAttackStatus: not_validated`. A forged AI `verified` result cannot
  autonomously mark a Resident as verified. Independent authorized Admin review
  is required.

## Real issuer authenticity — **NOT AUTOMATED**

- PSA official [National ID Check](https://everify.gov.ph/check) can check National
  ID QR features. The current Admin review screen has an external link and a
  human attestation/notes workflow; PSA does **not** return a verification response
  into this VolunServe code.
- To automate the PSA **National ID eVerify** service, an authorized relying party
  must complete the official regulatory and technical onboarding, be issued API
  credentials, obtain user consent and process signed results securely over its
  server. Do not scrape public results, trust client-side checkboxes, or invent
  a successful API response.
- Driver's license, passport, UMID and PRC require approved issuing-authority
  validation or independent in-person evidence. OCR logos/keywords alone cannot
  authenticate real issuance.

## True liveness / presentation attack detection — **NOT VALIDATED**

- A random blink, mouth, smile or sideways movement is a camera responsiveness
  check, not certified PAD. Video replay, screen presentations and software
  tampering remain possible.
- An actual PAD integration needs an independently assessed vendor/algorithm,
  ideally ISO/IEC 30107-3 evaluation evidence, per-session nonce and expiry,
  binding between the signed PAD result, authenticated user and selfie match,
  server-only secret management, false-reject/accessibility review, and replay
  protection. Do not claim bank-grade liveness without real measured performance.
- The liveness score or media self-attestation must never be used as sole approval.

## Quality gates before live release

1. Complete all GitHub Actions tests for each draft SHA, including Firestore
   Rules/identity/signup regressions, synthetic OCR and browser/Android JS builds.
2. Test staging Firebase and staging Node/Python services on isolated accounts;
   do not use production Firebase or personal ID photographs.
3. Test date normalization and address OCR on consented, privacy-cleared
   documents representing the supported official layouts. Measure false
   matches, ambiguous layout handling and fail-closed behavior.
4. Complete issuer integration/onboarding for automatic authenticity **or**
   require documented manual issuer check and Admin attestation.
5. Complete independently validated PAD before marking `livenessValidated`.
6. Audit retention, user consent, role-based access, account recovery,
   redaction, deletion, and Admin decision evidence with a privacy reviewer.
7. Deploy only from the approved protected release process after review.
