# Identity document-only OCR precheck — staging and release QA

## What changed (Draft PR #409 / PR #410; not deployed)

The Resident's camera still takes a clear ID **photograph first**. The user
explicitly consents to a private upload for government-ID OCR screening when
they tap **Check ID, then Face Scan**. Only after a conservative document
precheck may the Resident enter the selfie camera. This is NOT a real-time
trained visual classifier, issuer authenticity proof, or validated liveness.

### API contracts

- Authenticated Node `POST /api/identity/document/precheck`: Firebase
  verified-mailbox/approved profile; explicit
  `X-VolunServe-Document-Precheck-Consent: true` header; `multipart/form-data`
  containing `idType`, `idDocument`, and `idBackDocument` for non-passports.
- Python `POST /document/precheck`: must require the shared internal key and
  trusted forwarded UID. Rejects requests containing a `selfie` field.
- Limits: 21 MB Node body; max 10 MB per image in AI; account rate-limited
  to 8 seconds between requests and 30 scans per rolling 24-hour window.
- **No face scan** is submitted on this route; it does not consume one of the
  three main face-verification attempts.
- Store only request counters/timestamps in
  `identityDocumentPrecheckThrottle/{uid}` through Admin SDK; do not store
  image content, raw OCR, ID numbers, names, DOB or address.
- Responses: `pass` (recognized selected type + no obvious side conflict),
  `retry` (school/unsupported/unknown/swapped or unreadable),
  `review` (strictly blurry claimed National ID with no conflicting evidence).
  Review is *not* approval; the user proceeds solely to an Admin rescan flow.
- Server sanitizes all received status fields, recomputes `pass` and `review`,
  and hardcodes issuer authenticity/liveness as false. The normal
  `/api/identity/verify` endpoint still enforces ID-screening independently.
- Native Android/iOS and web use the same screen-level gate, with cancellation
  protection if the capture is changed or consent revoked during processing.

## Device checks in isolated, approved candidate staging ONLY

Use fabricated DEMO cards with no real personal information at first.
Do **not** submit genuine National IDs, passports or actual selfies to old
staging sites. The old Render staging lab is on a separate branch and does
not contain this new route.

| Scenario | Expected action |
| --- | --- |
| Front + back correct synthetic National ID | `pass` to selfie (still unauthenticated) |
| Back card shown in Front + front card in Back | `retry`, retake in correct slots |
| Front used twice | Reject identical images, or `retry` on duplicate front clues |
| School ID selected as National ID | `retry`: not a supported government ID |
| Different supported ID type from dropdown | `retry` |
| Valid passport bio page (no back) | Screen passport type; accept only if OCR recognises it |
| Missing reverse on any non-passport | Block request |
| OCR unavailable / ambiguous or low quality | `retry` or strictly `review` for blurry National ID |
| No consent | No photos sent; explanatory notice |
| Camera canceled / photos changed mid-request | Old response must not advance to selfie |
| Wrong internal backend key | Reject at AI |
| Abusive repeated requests | 429 without consuming biometric attempt |
| Admin approval request with unverified issuer/PAD | Independent manual validation mandatory |

**Acceptance gate:** all automated policy/contract tests, TypeScript, native JS
bundle and web bundle CI pass; real browser and Android camera permission,
cancel, retake and service-response tests in isolated environment; privacy
audit. No claims of official QR signature validation, trained multi-layout
front/back classifier or bank-grade PAD until those integrations are actually
implemented and independently tested.
