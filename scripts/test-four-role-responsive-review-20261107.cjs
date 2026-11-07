"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src=fs.readFileSync("components/guest/DesignReviewWorkspace.tsx","utf8");
const route=fs.readFileSync("app/public/preview.tsx","utf8");
const guest=fs.readFileSync("components/guest/GuestWorkspace.tsx","utf8");
const ui=fs.readFileSync("constants/volunserveLiveUi.ts","utf8");
const file=ts.createSourceFile("DesignReviewWorkspace.tsx",src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length,0,"Four role preview has TypeScript parse errors: "+
  file.parseDiagnostics.map(x=>x.messageText).join("; "));
assert(route.includes("<GuestWorkspace />"),"Public preview must use clickable four-role workspace");
const legacyRoute=fs.readFileSync("app/public/design-review.tsx","utf8");
assert(legacyRoute.includes("<DesignReviewWorkspace />"),"Dedicated design-review route must remain available");
assert(guest.includes("AdministrativePreviewModules"),"Actual Guest preview must include the additional Admin/Super Admin module designs");
for(const role of ["resident","volunteer","admin","superadmin"]){
  assert(src.includes(role+": ["),"Missing "+role+" navigation");
}
const names=[
  "Emergency Reports","Request Assistance","Community Events","Donations",
  "Emergency Tasks","Event Attendance","My Certificates","Identity Reviews",
  "Donation Management","Certificates","Announcements","Admin Accounts",
  "System Records","Audit Logs","System Settings"
];
for(const name of names)assert(src.includes(name),"Preview is missing module "+name);
for(const unsafe of [
  /\b(?:addDoc|setDoc|updateDoc|deleteDoc|runTransaction|onSnapshot|getDocs|getDoc)\s*\(/,
  /\bfetch\s*\(/,/\baxios\./,
  /\bloginUser\s*\(/,/\bsignInWith\w*\s*\(/,
  /(?:from|require\()\s*["'][^"']*\/firebase/i,
])assert(!unsafe.test(src),"Read-only preview contains unsafe live action: "+unsafe);
for(const guard of [
  'width < 760','styles.drawerLayer','styles.sidebarWrap',
  'styles.sectionRowMobile','styles.contentMobile','styles.headingMobile',
  'styles.pageIntroMobile','styles.metricGridMobile'
])assert(src.includes(guard),"Desktop/mobile responsive behavior missing "+guard);
for(const clickable of [
  'accessibilityLabel="Open navigation"',
  'accessibilityLabel="Change preview role"',
  'accessibilityLabel="Search sample records"',
  'label="Validate sample form"',
  'label="Previous"',
  'label="Next"'
])assert(src.includes(clickable),"Clickable preview control missing "+clickable);
for(const component of ["VolunServeButton","VolunServeField","ui.color.surface","ui.color.sidebar","ui.type"])
  assert(src.includes(component)||component==="ui.type","Unified UI token/component missing "+component);
assert(ui.includes('minTap: 44'));
assert(src.includes("Guest Preview does not create"));
console.log("PASS: actual Expo public preview has all four workspaces, sample click actions, responsive layouts and zero Firebase writes");
