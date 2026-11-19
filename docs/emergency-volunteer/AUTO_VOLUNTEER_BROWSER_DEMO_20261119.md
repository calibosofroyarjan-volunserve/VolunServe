# VolunServe Automatic Volunteer — Local Browser Demo

**FOR FICTIONAL CAPSTONE TESTING ONLY.** Not connected to `volunserve.com`, Firebase production, Render, or real emergency volunteers. This is not evidence of a deployed emergency response system.

## Setup (Windows PowerShell or VS Code Terminal)

Requires Node.js 22, Java 21, internet connection for the browser Firebase SDK, and the repository.

```powershell
npm ci
npm ci --prefix backend
node scripts/run-auto-volunteer-demo-local.cjs
```

Open the URLs printed by the script (local machine only):

- **Admin:** `http://127.0.0.1:4179/phase10-admin`
- **Volunteer:** `http://127.0.0.1:4179/phase10-volunteer`

All accounts use **fictional test email addresses** under `phase10.example`. The terminal prints the test password and correct fictional accounts. The pre-seeded case ID is `phase10_case_smoke` and starts as **pending_review**.

## Demonstration

1. Admin signs in with the fictional Admin credentials.
2. Admin enters `phase10_case_smoke` and clicks **Approve & auto-offer to Volunteers**.
3. The local system automatically offers to the two eligible same-barangay fictional volunteers. There is **no separate Start** button.
4. In another browser tab, Volunteer A signs in, uses **Check my offer**, and **Accept** or **Decline**.
5. Only one Volunteer can be the accepted responder. When a winner is accepted, the scheduler closes other pending offers and releases their reservations. If nobody accepts, the automatic worker checks expired offers and advances eligible *fictional* waves while the terminal is running.

Use `Ctrl+C` to stop. Restarting the demo gives fresh emulator data. To run a noninteractive readiness check instead:

```powershell
node scripts/run-auto-volunteer-demo-local.cjs --smoke
```

## Safety and limitations

- Demo project: `demo-volunserve-auto-phase4`; all application APIs bind to **127.0.0.1** and require actual Auth Emulator tokens.
- The script **fails closed** if real service-account/ADC credentials are present, if a non-demo project is configured, or if production dispatch is enabled.
- No real Firebase Rules, Render backend, Hosting, emergency reports, dispatch assignments, or account records are changed.
- There is **no reliable production 24/7 scheduler**. The timer is process-local, not a managed cloud worker.
- This is a fictional public-capstone presentation. Do not present it as a real deployed Emergency Response function.
- The SJDM adjacency/geography data has not been officially verified, and public/emergency deployment still requires secure server-side review, authenticated cloud tests, GPS/mobile testing, rollback controls, and operational sign-off.
