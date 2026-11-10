# Live Community Event certificates — temporary 1-minute threshold

## Release scope
Production **Render** backend only, protected branch `backend-live-protected`
(service `srv-daofqomk1f9s73btsg20`). The main branch and staging-only
site/project are not deployed. Do not change Firebase/Firestore rules.

## Strict opt-in and rollback
This new temporary live mode is enabled ONLY if these three Render server
environment settings are present and valid:

- `VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED=true`
- `VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC=2026-11-10T14:55:00Z`
- `VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC=2026-11-17T14:55:00Z`

It automatically expires after 7 days and then reverts to the original
**30-minute** minimum. Remove/set the enabled flag to `false` to revert
earlier. A missing/invalid start or end time (or window >7 days) fails
closed at 30 minutes. Existing separate exact-ID allowlist test policy
is unchanged (and is not being enabled here).

IMPORTANT: The **1-minute threshold applies to every volunteer** for
otherwise eligible Community Events, not just one test UID, if and only if:
- Volunteer **Time In and Time Out both occurred after the UTC start**;
- the event's **completedAt** is after the start and not in the future;
- the event is published, completed, a joined participant other than its
  proposer, and attendance is explicitly Admin-verified with legitimate
  timestamps/IDs.

Old attendance and previously completed events continue under the 30-minute
minimum, including when the background auto-sync scans past records. This
deliberately prevents a retroactive mass award. Existing issued/revoked
records remain immutable; switching back does **not** revoke issued PDFs.

## Release procedure
1. Review the policy and transaction code on the protected Render production
   branch. Confirm emulator tests (1m new, 59s, old 1m, disabled switch).
2. Merge only the checked branch into `backend-live-protected`.
3. Enable the THREE variables on the *production Render backend* using
   update-not-replace semantics. Render will deploy on this env change;
   do not manually trigger a second concurrent deploy.
4. Confirm Render commit, startup logs, successful deployment and unchanged
   production Firebase/web source. Check certificate API refuses anonymous
   requests. Full authenticated volunteer→Admin→PDF E2E still needs real
   eligible participants and is not proven by server CI.
5. Once the temporary demonstration ends, set the flag to `false` or remove
   it. Check the production service is live and reverts to 30 minutes.

## Frontend
The existing Admin Attendance page previously displayed 30 minutes as
a hardcoded informational label. The API remains authoritative. If a
separate production website UI revision is released, it must distinguish
new post-activation attendance from older records and must NEVER issue
certificates by client-side threshold alone.
