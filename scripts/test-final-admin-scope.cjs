const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const source = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const rules = source("firestore.rules");
const saLayout = source("app/(superadmin)/_layout.tsx");
const saOverview = source("app/(superadmin)/index.tsx");
const saRecords = source("app/(superadmin)/all-records.tsx");
const adminLayout = source("app/(admin)/_layout.tsx");
const adminLogin = source("app/admin-login.tsx");
const docs = source("docs/final-superadmin-lgu-admin-scope.md");
const ruleSection = (start, end) => {
  const i=rules.indexOf(start), j=rules.indexOf(end,i+start.length);
  assert(i>=0 && j>i,"Missing Firestore collection boundary: "+start);
  return rules.slice(i,j);
};
assert(rules.includes("p.get('adminStatus', 'active') != 'suspended'"),
  "Firestore Admin access must require non-suspended account status");
assert(adminLayout.includes('profile?.adminStatus === "suspended"') &&
  adminLayout.includes('<Redirect href="/admin-login" />'),
  "UI must reject suspended LGU Admin sessions, not just login attempts");
const proposals = ruleSection("match /communityEventProposals/{proposalId}", "match /communityEvents/{eventId}");
const events = ruleSection("match /communityEvents/{eventId}", "match /communityEventParticipants/{participantId}");
assert(proposals.includes("allow update: if isAdmin()") &&
  !proposals.includes("allow update: if isAdminOrSuperAdmin()"),
  "Only operational Admin can review Community Event proposals");
assert(events.includes("allow create: if isAdmin()") &&
  events.includes("allow update: if isAdmin()") &&
  !events.includes("allow create: if isAdminOrSuperAdmin()") &&
  !events.includes("allow update: if isAdminOrSuperAdmin()"),
  "Programmer Super Admin must not publish or start LGU events");
const liveGps = ruleSection("match /communityEventLiveLocations/{eventId}", "match /communityEventProposals/{proposalId}");
assert(liveGps.includes("allow get: if isAdmin()") &&
  liveGps.includes("allow delete: if isAdmin()") &&
  !liveGps.includes("allow get: if isAdminOrSuperAdmin()") &&
  !liveGps.includes("allow delete: if isAdminOrSuperAdmin()"),
  "GPS cleanup belongs to operational LGU Admin or the event organizer, never programmers");
const attendance = rules.slice(rules.indexOf("match /communityEventParticipants/{participantId}"));
assert(attendance.includes("LGU Admin-only attendance corrections/verification.") &&
  attendance.includes("isAdmin()"),
  "Only LGU Admin may perform staff attendance verification");
for(const entry of [
  "System Overview","Admin Accounts",
  "Admin Activity & Audit Logs","System Records (Read Only)","System Settings",
]) assert(saLayout.includes(entry),"Missing Super Admin governance nav "+entry);
for(const entry of [
  "Emergency & Assistance","People & Verification","Events & Volunteering",
  "Donations & Funds","Communication & Reports",
]) assert(adminLayout.includes(entry),"Missing LGU operational nav "+entry);
for(const route of [
  "/(admin)/admin-cases","/(admin)/assistance-requests","/(admin)/identity-reviews",
  "/(admin)/account-approvals","/(admin)/community-events","/(admin)/community-attendance",
  "/(admin)/donor-monitoring","/(admin)/admin-analytics"
]) assert(adminLayout.includes(route),"Missing existing operational route "+route);
assert(!saLayout.includes("Donation Management") &&
  !saRecords.includes('label: "Donations"') &&
  !saRecords.includes('label="Donations"') &&
  !saOverview.includes("Approve Donation"),
  "Super Admin UI must not provide financial operations or dummy financial data");
assert(saOverview.includes('onSnapshot(') &&
  saOverview.includes('adminUids.includes(item.actorUid)') &&
  saOverview.includes('router.push("/(superadmin)/admin-logs"') &&
  saLayout.includes('route: "/(superadmin)/admin-accounts"') &&
  saLayout.includes('route: "/(superadmin)/system-settings"') &&
  !saOverview.includes('Pending LGU Applications'),
  "Super Admin overview must show live governance activity with working navigation, without reintroducing removed LGU Staff onboarding");
assert(adminLogin.includes("Request LGU Admin Access") &&
  adminLogin.includes('router.push("/admin-request")') &&
  docs.includes("Fresh independent LGU review"),
  "Current user-facing request label must still route to pending-only LGU staff application");
console.log("PASS scope: Super Admin governance, LGU operational modules, suspended-account security, event ownership");
