# VolunServe Donations — Finalized Web Layout Rollout

This change retains the existing donation campaign collections, secure hosted PayMongo Checkout Session endpoint, signed webhook, Firebase authentication and role-based routing. No fabricated demo donations are inserted.

## Visual design
- Resident and approved Volunteer, Admin and Super Admin sidebars now use the finalized deep-teal gradient, emblem, emerald selection and subtle leaf watermark.
- The existing Resident donation campaign browser is made roomier for landscape screens and still requires the user to select a campaign before checkout.
- A shared Admin/Super Admin web dashboard reads live `donations` and `donationCampaigns` records for metrics, recent donations, campaign progress, search, status filters, payment details and donor profile.
- Notifications are shown per Admin/Super Admin, with individual read status.
- No Donation Trends graph is included.

## Transaction behavior and privacy
- Residents use **PayMongo Sandbox**, GCash TEST checkout via the existing Render backend. Credit cards, Maya and bank payouts are **not** newly enabled.
- Only a signed, confirmed PayMongo payment webhook changes `donations.status` to `received`, updates `paymentStatus` to `paid` and increments the verified campaign amount. Checkout redirects alone do not verify money.
- The checkout accepts an optional donor message (200 chars).
- The backend creates one deterministic `notifications` document per approved Admin/Super Admin for each newly confirmed payment. Repeated webhooks cannot duplicate the notification because confirmed payments are processed idempotently in a Firestore transaction.
- The donor's record can be inspected only by authorized Admin/Super Admin. No card data, scanned IDs or precise beneficiary addresses are displayed.
- Sandbox donations are **not real money** and must never be described as settled or released. The Payout & Fund Tracking tab intentionally does not fabricate bank settlement records.

## Production rollout
1. Inspect the PR and merge to `main`; confirm the GitHub TypeScript/web-export smoke check passed.
2. On the Windows laptop (with a clean working tree), run:
   ```powershell
   git pull --ff-only origin main
   $env:NODE_OPTIONS="--max-old-space-size=3072"
   npx expo export --platform web --clear --max-workers 1
   Test-Path .\dist\index.html
   npx --yes firebase-tools@latest deploy --only hosting --project volunserve-3aa5b
   ```
   Deploy hosting **only after** the production export succeeded and `Test-Path` returned `True`.
3. Redeploy the **Render backend** from the merged GitHub `main` if Render is not already set to auto-deploy. The allowed-origin change and notifications are backend code and do not take effect from a Firebase Hosting-only deploy.
4. Keep PayMongo credentials **only** in Render environment variables; never add test keys/webhook secret to `app.json`, frontend code, GitHub files or screenshots. Confirm `PAYMONGO_MODE=test`, a valid `PAYMONGO_SECRET_KEY` with `sk_test_`, and `PAYMONGO_WEBHOOK_SECRET` are configured.
5. Confirm PayMongo webhook points to `https://volunserve.onrender.com/api/paymongo/webhook` in TEST mode, and that Firestore rules still allow each role to see only its authorized records.
6. Test `https://volunserve.com/donation` while signed into a permitted Resident account. A campaign must be **published**, accept monetary donations, have a verified goal, approved location and suitable public image. A simulated GCash payment should become `Paid` only after webhook delivery.
7. Sign into two different Admin accounts and one Super Admin account; confirm each sees exactly one notification and the same donation record. Mark one notification read; the other Admin should still have their own unread notification.
8. Review the latest campaigns, verify totals are not double counted after a duplicate webhook, and confirm the `My Donations` screen reflects the test transaction.
9. Test desktop and mobile browsers for sidebar scrolling, page overflow, campaign selection and the donation details column.

## Validation
GitHub Actions smoke test passed for backend Node syntax, `npx tsc --noEmit`, Expo web export, and existence of `dist/index.html`. No live Firebase payment test or final screenshot was conducted through this GitHub connector.

## Outstanding scope
No real bank settlement integration or fund release posting is implemented by this change. Production payouts need finance reconciliation and separate authorized release/audit workflow; it is deliberately not simulated as an automatic successful transfer.
