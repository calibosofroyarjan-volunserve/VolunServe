# VolunServe — fictional offline Hybrid Identity demo

This **standalone, offline HTML teaching aid** illustrates the designed
Resident application → illustrative AI screening → fictional Admin final
decision → illustrative account status flow.

## How to open

Open `demos/volunserve-hybrid-identity-offline.html` in a desktop or mobile
browser. No localhost, npm, Firebase account, camera, network or installation
is needed.

Demo steps:
1. Select one of the five *supported design* government ID types. No real ID
   images are requested.
2. Choose an illustrative consistent or mismatched document scenario. The
   "assessment" is prewritten sample text, **not a genuine OCR, face
   comparison, issuer check or liveness inference**.
3. Choose fictitious Admin Approve, Require Retry or Reject. Enter at least
   ten characters of example notes. Sample approval is shown only for the
   consistent scenario with the explicitly fictional review assumption ticked.
4. See an in-memory fictional outcome. No real resident is ever verified and
   the fake audit entry disappears when the page is reloaded.

This demo is separate from the real application. It does not grant Admin
access or unlock real identity uploads. In the current isolated staging
backend the ID/selfie endpoints intentionally return HTTP 423 until approved
security/privacy review, and real staging Admin account login remains a
separate blocker. Existing Firebase-emulator tests validate the actual
Admin decision logic with fictional accounts, but they are not a real-device
biometric or issuer authenticity validation.

**Deployment: none.** This file is committed on an isolated release branch.
Do not include it in production deployment or claim it is live OCR/PAD.
