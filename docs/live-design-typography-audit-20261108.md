# System-wide typography consistency review (Nov 8, 2026)

**Working branch:** `design/professional-typography-systemwide-20261108` based on four-role consolidated design PR #279, in turn based on a staging branch descended from verified live Hosting revision `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`.

## Exact design contract
- **Do not replace the original Resident Home.** `components/home/Home.web.tsx` was not modified in this branch. Its hero background, personalized greeting, weather chip, SJDM city seal, Your Current Activity, Community Updates and Emergency Contacts remain the reference.
- **Preserve brand identity.** Dark emerald role sidebars, colorful Home banner, current navigation structure, card layouts, and role-specific presentation remain.
- **Unify typography only.** Use the existing `constants/volunserveLiveUi.ts` typography scale for page (25/32), section (18/25), card (16/23), body (14/21), label (13/19), metadata (12/18), eyebrow (11/16); common 44-point target convention remains. Overrides are restricted to `StyleSheet.create` style objects.
- **No operational logic changes.** Existing real UI handlers remain. No changes to Firebase/Auth/Firestore/rules, Cloud Functions, Render APIs, PayMongo, emergency assignments, attendance/time-in/out, certificates, announcements, user data, or routing callbacks.
- **Desktop and mobile:** native Volunteer and web Volunteer pages each receive tokens; other route-specific breakpoints and compact layouts remain intact. These modifications must be validated visually in staging at 320, 390, 768 and 1440 pixel widths.

## Professional reference
Atlassian Design System typography (principles, text role, weights, line height and reusable tokens): https://atlassian.design/foundations/typography

## Files and scope
The two commits contain 21 actual source files across Admin, Super Admin, Resident, Volunteer and shared shells. This is **not a claim of completion of all 68+ route screens or bug-free operations**. Larger module-specific UI refinements remain a separate visual and authenticated-flow QA task.

## QA required before a release
1. Inspect resulting diff for presentation-only changes; verify Home source and hero assets are unchanged.
2. Run TypeScript, Expo web export, prior role/workflow regression scripts and isolated Render/Firebase staging configuration guards.
3. Manually inspect authenticated Super Admin, Admin, Resident and Volunteer desktop and phone sessions; check dropdowns, modals, buttons, labels, long text, keyboard accessibility and overflow.
4. Exercise real staging workflows including volunteer assignment acceptance, attendance, certificates, admin reviews, donations sandbox, personal reports and announcements; sample read-only preview does not prove them.
5. Compare fresh production release marker before proposing any live deployment. No PR merges, production deployments, migrations, or deletes without approval.

## Second pass — style updates
- `app/(superadmin)/admin-logs.tsx`: title, subtitle, summaryTitle, meta
- `app/(superadmin)/all-records.tsx`: title, subtitle, sectionTitle, recordTitle, recordSubtitle, detailLabel
- `app/(tabs)/resident.tsx`: infoCardTitle, infoCardText, emergencyNoticeText, modeTabText, modeCountText
- `app/(tabs)/volunteer.web.tsx`: title, subtitle, statLabel, mobileTaskTitle, subtitleMobile | skipped: cardTitle:not found
- `app/(tabs)/volunteer.tsx`: title, subtitle, statLabel, cardTitle, metaLabel
- `app/(tabs)/community-events.tsx`: pageTitle, pageSubtitle, sectionTitle, eventTitle, metaText, sectionHint
- `app/(tabs)/donation.tsx`: title, subtitle, sectionTitle, sectionSubtitle, summaryLabel, filterChipText
- `app/(tabs)/my-cases.tsx`: title, subtitle, caseTitle, metaLabel, infoText
- `app/(tabs)/notifications.tsx`: title, subtitle, cardTitle, emptyTitle, filterLabel, metricLabel
- `app/(tabs)/profile.tsx`: pageTitle, pageSubtitle, identityCardTitle, identityCardText, accessLabel | skipped: sectionCardTitle:not found
- `app/(tabs)/certificate.tsx`: title, subtitle, pendingTitle, pendingText, metricLabel
