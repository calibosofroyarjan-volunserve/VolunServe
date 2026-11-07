"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const file="components/guest/DesignReviewWorkspace.tsx";
const source=fs.readFileSync(file,"utf8");
const screen=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert(!screen.parseDiagnostics.length,"UI review file contains invalid TSX syntax");
for(const role of ['resident','volunteer','admin','superadmin']) {
  assert(source.includes(role+": [")||source.includes('"'+role+'": ['),"Missing "+role+" module list");
}
for(const label of ["Emergency Reports","Request Assistance","Community Events","Emergency Tasks",
"Certificates","Resident Identity Reviews","Assistance Requests","Donation Management","Announcements",
"System Overview","Admin Accounts","System Records","System Settings"])
 assert(source.includes(label),"Missing review module "+label);
for(const token of ["VolunServeButton","VolunServeField","ui.color.sidebar","ui.color.surface",
"ui.color.border","width<800","s.overlay","s.dialogOverlay","setPageNumber","setSearch","setFilter","setSort",
"sample form validated","No real record was created.","No account or database is connected."]) 
 assert(source.includes(token),"Missing responsive control or safety label "+token);
assert(!source.includes("firebase/auth")&&!source.includes("firebase/firestore")&&!source.includes('fetch('),
"Design review must not make Firebase or HTTP calls");
const route=fs.readFileSync("app/public/design-review.tsx","utf8");
const guest=fs.readFileSync("components/guest/GuestWorkspace.tsx","utf8");
assert(route.includes("DesignReviewWorkspace"),"Public route must render responsive 4-role review");
assert(guest.includes('router.push("/public/design-review")'),"Guest portal must link to design review");
console.log("PASS: four-role modules, responsive breakpoints, interactive sample controls and no production access");
