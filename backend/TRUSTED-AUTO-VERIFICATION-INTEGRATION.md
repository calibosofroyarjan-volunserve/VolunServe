# VolunServe Trusted Automatic Resident Verification — integration handoff

**Status (25 November 2026): QA prototype only. DO NOT enable or deploy automatic promotion.**

## What already exists

- The original VolunServe National ID portrait vs selfie comparison is running on production. It is **not** an independent check that the ID was issued by the government, nor a validated presentation-attack-detection (PAD)/liveness system.
- Backend `identityAutoApprovalGateway.js` already requires independently authenticated issuer proof, PAD proof, and calibrated face comparison, for the same Resident and the same verification attempt.
- QA-only `identityTrustedAutomaticCompletion.js` models an atomic transition to `identityVerified = true` **only** when all trusted proofs and consented private media pass. `VOLUNSERVE_TRUSTED_AUTO_VERIFY_ENABLED` defaults off.
- QA-only `identityTrustedSignedProof.js` is a **provider-neutral sample** for independently signed Ed25519 compact JWT attestations. It validates two separate pinned keys, signatures, government ID type, Resident ID, request ID, verification ID, expiry and issuer. Its signing format is **NOT confirmed to be the PSA NIDAS API protocol** and must not be presented as such.
- For the current production face-only path, the automatic eligibility gate remains blocked even with a high numerical similarity. Authorized manual Admin approval remains the only verified-status path.

## Official government ID validation

PSA has an official National ID verification flow and an NIDAS/eVerify relying-party onboarding route.

- [National ID eVerify — PSA onboarding](https://everify.gov.ph/)
- [PSA National ID Technical Portal — Integration playbooks](https://sites.google.com/psa.gov.ph/dcrpid-portal/playbooks)
- [National ID Check — human QR validation](https://everify.gov.ph/check)

**The public QR-check website is not a documented unrestricted server API.** Do not scrape it, pass resident IDs to it on a backend without consent, or treat a screenshot/checkbox as a verified issuer signature.

The technical portal says an approved relying party requires an active National ID API connection and API credentials **provided by PSA**, as well as appropriate HTTPS, encryption, cryptographic keys and tokens. The actual PSA protocol, contract, permitted use and approved scope must be obtained and reviewed before implementation. A school capstone is not automatically entitled to the public-agency no-cost arrangement.

## Required to activate true unattended approval

1. **Authorized relying party**: identify whether the SJDM LGU or an approved organization will act as the RP; complete PSA eVerify/NIDAS onboarding and obtain an approved sandbox, API credentials and official API specification. Never paste credentials into chat or commit them to GitHub.
2. **ID authenticity adapter**: implement the actual documented PSA API flow server-to-server and validate provider authenticity/revocation, demographic identity, subject and request/attempt binding. The generic Ed25519 test JWTs here do **not** satisfy this step.
3. **Validated liveness/PAD adapter**: integrate an independently evaluated PAD system with its documented proof format. Eye blinking or head turning alone is not verified anti-spoofing. Reject replay, static-photo and video attacks according to documented threat models.
4. **Calibrated face verification**: establish a validated same-person threshold and quality/error measurements on appropriate consented test sets; do not interpret the old MediaPipe numerical similarity as a verified probability.
5. **Capture-proof binding**: prove that issuer/PAD/face attestations refer to the **same fresh consented capture, UID, request ID, and verification ID**; preserve image privacy and short retention and block stale evidence.
6. **Isolated authenticated E2E**: test Basic Resident -> upload -> issuer/PAD/face checks -> automatic Verified and profile update -> Admin audit, including every failure/mismatch branch in a verified isolated Firebase/Cloudinary/Render environment.
7. **Guarded release**: review threat model, privacy, data retention and access controls; require explicit production approval. Keep manual Admin review fallback and instant kill-switch for automatic promotion.

## Release gate (must remain blocked now)

```
Official PSA RP approval:            NOT CONFIGURED
Approved PSA API and credentials:    NOT CONFIGURED
Independent validated PAD:          NOT CONFIGURED
Calibrated production face matcher: NOT VALIDATED
Trusted provider live integration:  NOT CONNECTED
Isolated authenticated hosted E2E:  NOT CONFIRMED
Production auto-approval flag:       OFF
```

**No production changes, provider purchase, real resident approval or identity-media upload are authorized by these QA tests.** The cryptographic sample proves only that a correctly signed synthetic claim can be checked, not that a real National ID is authentic or a real person is live.
