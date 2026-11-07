"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cp = require("node:child_process");
const LIVE = "e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4";
const read = path => fs.readFileSync(path, "utf8");
const modified = cp.execFileSync("git", ["diff", "--name-only", LIVE, "HEAD"], {encoding:"utf8"})
  .trim().split("\n").filter(Boolean);
const allow = new Set([
  "constants/volunserveLiveUi.ts",
  "components/admin/AdminReviewHero.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(admin)/_layout.tsx",
  "app/(superadmin)/_layout.tsx",
  "components/home/Home.web.tsx",
  "app/(tabs)/volunteer.web.tsx",
  "app/(tabs)/volunteer.tsx",
  "scripts/test-lgu-admin-global-ui-pagination.cjs",
  "scripts/test-admin-response-workspace-ux.cjs",
  "scripts/test-admin-compact-workspace-ux.cjs",
  "scripts/test-admin-people-verification-premium-ui.cjs",
  "scripts/test-portal-resident-volunteer-ui-flow.cjs",
  "scripts/test-resident-volunteer-sidebar.cjs",
  "scripts/test-volunteer-donations-sidebar-removal.cjs",
  "scripts/test-profile-certificates-account-menu.cjs",
  "components/ui/VolunServeButton.tsx",
  "components/ui/AppDialogHost.tsx",
  "components/ui/VolunServeField.tsx",
  "components/ui/ListPagination.tsx",
  "app/(admin)/create-announcement.tsx",
  "app/(superadmin)/system-settings.tsx",
  "app/(tabs)/volunteer-application.tsx",
  "scripts/audit-volunserve-module-controls-20261107.cjs",
  "scripts/test-live-controls-consistency-20261107.cjs",
  ".github/workflows/validate-live-all-modules-20261107.yml",
  "docs/LIVE_ALL_MODULES_UI_REVIEW_20261107.md",
  "scripts/test-live-first-ui-only-20261107.cjs",
  "docs/LIVE_FIRST_UI_REVIEW_20261107.md",
  ".github/workflows/validate-live-first-ui-20261107.yml",
]);
for (const file of modified) assert(allow.has(file), "Protected live file changed: " + file);
const protectedFiles = [
 "app/_layout.tsx", "lib/firebaseAuth.ts", "lib/useUserSession.ts",
 "firestore.rules", "storage.rules", "firebase.json",
 "app/login.tsx", "app/login.web.tsx", "app/signup.tsx", "app/signup.web.tsx",
 "app/(admin)/admin-cases.tsx", "app/(tabs)/community-events.tsx",
 "app/(tabs)/resident.tsx", "app/(tabs)/donation.tsx",
 "backend/server.js", "functions/index.js",
];
assert(!protectedFiles.some(path => modified.includes(path)),
  "High-risk authentication, backend, reports, donations, or database files must remain unchanged");
const theme=read("constants/volunserveLiveUi.ts");
for (const value of ["ui.color", "sidebar", "primary", "surface", "fontSize", "minTap"])
  assert(theme.includes(value)||value==="ui.color", "Missing design token: "+value);
const adminHeader=read("components/admin/AdminReviewHero.tsx");
assert(adminHeader.includes("backgroundColor: ui.color.surface") &&
  adminHeader.includes("const compact = width < 760") &&
  !adminHeader.includes('name="leaf-outline"'));
const resident=read("app/(tabs)/_layout.tsx");
const admin=read("app/(admin)/_layout.tsx");
const superadmin=read("app/(superadmin)/_layout.tsx");
const home=read("components/home/Home.web.tsx");
const volWeb=read("app/(tabs)/volunteer.web.tsx");
const volNative=read("app/(tabs)/volunteer.tsx");
for(const [label,source] of [["Resident",resident],["Admin",admin],["Super Admin",superadmin]])
  assert(source.includes("ui.color.sidebar"),label+" must share the same sidebar color");
assert(resident.includes('label:"My Certificates",icon:"ribbon-outline"') &&
  resident.includes('icon:"hand-left-outline",activeIcon:"hand-left"'));
assert(admin.includes('label: "Emergency Reports", icon: "alert-circle-outline"') &&
  admin.includes('label: "Community Events", icon: "calendar-outline"'));
assert(home.includes("ui.radius.card") &&
  home.includes("latestBellAlerts") &&
  home.includes("setNotificationMenuOpen(open => !open)") &&
  home.includes('router.push("/notifications")'),
  "Home summary cards and existing live notification dropdown must remain");
assert(volWeb.includes("<View style={styles.headerRow}>") &&
  volWeb.includes("<View style={styles.mobileTaskHeader}>") &&
  !volWeb.includes("<LinearGradient") &&
  volWeb.includes("openLiveMap()") &&
  volWeb.includes("runTransaction("));
assert(!volNative.includes("headerLeaf") &&
  volNative.includes("backgroundColor: ui.color.surface") &&
  volNative.includes("openLiveMap()") &&
  volNative.includes("runTransaction("));
assert(admin.includes('label: "Certificates"') &&
  admin.includes('label: "Announcements"') &&
  admin.includes('label: "Donation Management"'));
assert(superadmin.includes("await logoutUser()") &&
  superadmin.includes("router.push(\"/(superadmin)/system-settings\""));
console.log("PASS: live-first revision, protected modules unchanged, consistent UI, key actions preserved.");
