# VolunServe LGU Workspace UI — Final Acceptance

## One ownership per module

| Module | Owns | Must not duplicate |
| --- | --- | --- |
| LGU Command Center | Urgent actionable counts and links to actual review queues | Analytics, approval decisions |
| Analytics | Read-only case, resident/volunteer, attendance, certificate and donation trends | Operating approval buttons or fake counters |
| Resident Identity Reviews | Evidence/identity status and independent review | LGU staff verification |
| User & Volunteer Approvals | Community account status, verified resident eligibility, volunteer review, suspension and reactivation | Re-issuing resident identity or approving LGU Admin staff |
| Community Events | Resident-submitted event proposals, approval/publication | LGU-created Volunteer Events |
| Volunteer Events | LGU-created volunteer activities, capacity, status and attendance entry | Community proposal approval |
| Assistance Requests | Individual Resident assistance claims and evidence | Emergency case response or multi-household relief |
| Emergency Reports | Emergency incidents and responder workflow | Assistance funding |
| Relief Operations | Barangay/multi-household need assessments and distribution | Private individual claim decisions |
| Donation Management | Campaign, donation monitoring and LGU fund release | Super Admin programmer privileges |
| Super Admin | Platform access, independent LGU staff credential review, promotion and audit | Disbursing donations or operational response |

## Presentation contract
- Emerald VolunServe identity: one accent color, clear typography, consistent 24px workspace padding and 16px card radius.
- Page heading explains what the module does and does **not** do. No repeated destination buttons when the sidebar owns navigation.
- Shared stat cards carry **subscribed records only**; never hardcode nonzero dashboard results.
- Filters must visibly change records and preserve review permissions.
- User & Volunteer Approvals uses five records/page and search. Page controls must work after search/filter changes and account status updates.
- Empty states explain why no records exist and offer only an action that actually works.
- No new authorization paths or duplicated admin roles; the backend and Firestore rules remain authoritative.
- Responsive QA: 1440px desktop, 1024px tablet, 390px mobile; check title wraps, action buttons, tabs, table overflow, and cards.

## Executable checks
```powershell
node scripts/test-admin-workspace-unified-ui.cjs
npx tsc --noEmit --pretty false
npx expo export --platform web
npx expo export --platform android
```

Browser/emulator rehearsal should use synthetic accounts, isolated Auth/Firestore emulators and the existing final-defense checklist. Confirm: volunteer pending -> verified resident approval decision and audit, read-only analytics changes on a synthetic Firestore event, event create/edit/attendance, assistance request filtering, login/role redirects. **Compilation is not browser functional acceptance**.

This UI branch targets the final-defense integration branch; no Firebase production deployment, merge to main, or new APK has occurred as part of this change.
