# Community Event certificate test eligibility

**Production remains at 30 minutes.** The 1-minute threshold only applies when **both** the exact event document ID and volunteer Firebase Auth UID are explicitly allowlisted by the backend.

## Configure only for approved testing

For the Firebase Functions runtime, configure these **server-side** environment variables through the reviewed deployment configuration:

- `VOLUNSERVE_CERT_TEST_EVENT_IDS`: comma-separated Firestore `communityEvents` document IDs.
- `VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS`: comma-separated Firebase Authentication volunteer UIDs.

Do **not** put the test allowlists in Expo public environment variables, Firestore event documents, or user-editable profile fields. Empty/unset allowlists fail closed to the original 30-minute threshold. Remove both allowlists after testing. The test values do not change the 30-minute threshold for any other event/account combination.

Test issuance still requires a published and completed event, joined participant, admin-verified attendance, valid Time In/Out, trusted matching document IDs, and successful certificate transaction. No event, participant, or certificate is created merely by enabling the test exception.

## One-time reconciliation after changing allowlists

The existing two automatic Cloud Function triggers run when an event first becomes completed or attendance first becomes verified; they will not automatically rerun solely because a runtime variable changes. For an already completed event, call the new Firebase callable `syncCommunityEventCertificates` as a signed-in, email-verified, approved Admin/Super Admin with `{eventId: "<event Firestore doc ID>"}`. The callable checks each participant through the same secure issuance transaction and returns issued/alreadyExists/notEligible counts. Repeating a call will not duplicate certificates. It does **not** override eligibility, change attendance, or allow arbitrary clients to issue certificates.

The existing web **Retry Certificate Sync** control must be verified/wired to this callable before claiming end-to-end UI integration. Do not deploy the Functions change without approved configuration, a production regression check, and a live-branch verification.

## Tests and verification checklist

From `functions/`, run `npm test`. Confirm both allowlists absent -> 30; both matching -> 1; only one matching -> 30; nonmatching -> 30; wildcard -> 30. Then in a controlled emulator/staging run:
1. Verified 1-minute allowlisted test participant on completed event issues one certificate plus public verification and notification.
2. 59-second allowlisted attendance issues none; 29-minute production attendance issues none; 30-minute production attendance issues one.
3. An ordinary volunteer cannot call manual sync, while approved Admin can.
4. Repeating sync retains a single certificate and notification; revoked certificates are not reissued.
5. Check volunteer My Certificates / PDF / Verify ID and admin attendance view, then confirm live hosting and backend branch alignment.

This change is a **PR-only candidate**, not an approval to deploy or alter production database records.
