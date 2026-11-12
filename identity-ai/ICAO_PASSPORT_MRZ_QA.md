# VolunServe — Government ID OCR and passport MRZ review (staging draft)

**Why no new large download?** VolunServe already uses an installed, ready-made, open-source `Tesseract OCR` engine via `pytesseract` inside `identity-ai/Dockerfile` and `identity-ai/main.py`. Existing `strict_document_screening.py` checks **exactly five** user-selected types: National ID, Driver's License, Passport, UMID and PRC ID. Its synthetic tests include school/employee ID rejection, side-swap/duplicate clues, image sharpness, name text-presence, date of birth and barangay-level residential evidence. **OCR text is never returned or persisted by the screening functions.**

## New optional standards-based clue: ICAO TD3 passport MRZ

Uses the existing Tesseract OCR text as input; no external API or biometric/ID upload and no heavyweight ML weights. `passport_mrz_shadow.py` checks:

- Two 44-character MRZ lines starting with a passport document code (`P<`), and plausible MRZ-character syntax.
- ICAO 9303 7/3/1 weighted modulo-10 check digits for passport number, birth date, expiry date, optional data and composite.
- Whether a checksum-consistent MRZ birth date plausibly matches the **server-trusted profile birth date**. Only sanitized possible-match/conflict status is returned. MRZ's two-digit year cannot independently prove a complete birth date.
- An illegible, absent or contradicting MRZ is treated as unverified or needing further review; OCR errors do not establish fraud. A checksum-consistent MRZ does **NOT** prove passport authenticity: valid checksums can be reproduced.

### Integration

`main.py:screen_government_id` automatically supplies already-extracted transient passport OCR text to `assess_passport_mrz()` when the selected ID type is `passport`. No other ID type is changed. The result contains only sanitized status keys:

- `passportMrzCheck`: `not_detected`, `checksum_consistent_unverified`, `checksum_inconsistent_or_ocr_error`, or `multiple_candidates`.
- `passportMrzBirthDateCheck`: `not_checked`, `inconclusive`, `possible_match`, or `possible_conflict`.
- `passportMrzCheckDigitsConsistent`: boolean for OCR string integrity **only**.
- `passportIssuerAuthenticityVerified: false`, `passportMrzManualReviewRequired: true`.

Conflicting/checksum-inconsistent OCR never causes an automated approval; profile birth-date conflicts remain warning clues for authorized Admin review. Missing MRZ also never becomes a positive verification. The existing precheck route requires private internal backend authentication and remains subject to strict staging upload blocks.

### Tests and constraints

Run from the project checkout:

```powershell
py -3.11 -m unittest discover -s identity-ai -p 'test_passport_mrz_shadow.py' -v
py -3.11 -m unittest discover -s identity-ai -p 'test_passport_mrz_integration.py' -v
```

Test data are fictional ICAO samples only. No real people's passport photos, IDs, passport numbers, DOBs or credentials are needed or included in the repository. This functionality is **not** a trained Philippine government ID model, visual front/back classifier, QR signature validator, issuer database lookup or automated Verified Resident decision.

**Final-release gates:** consented physical-camera OCR evidence across all five document classes, special national-ID variants, repeated front/back scans, picture/replay defenses, accuracy and authorization tests, approved biometric-data retention, independently checked issuer evidence, and manual Admin review. Do not turn off `STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED=false` or production safeguards in order to demonstrate this feature.

### Standards/reference provenance

- ICAO Doc 9303, Part 4 (TD3 passport MRZ field layout): https://www.icao.int/publications/Documents/9303_p4_cons_en.pdf
- ICAO Doc 9303, Part 3 (check digit method): https://www.icao.int/publications/documents/9303_p3_cons_en.pdf
- Tesseract OCR: https://github.com/tesseract-ocr/tesseract (Apache-2.0)
- Existing source notices: `identity-ai/THIRD_PARTY_MODELS.md`
