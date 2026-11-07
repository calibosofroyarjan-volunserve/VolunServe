"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const preview=fs.readFileSync("components/guest/GuestWorkspace.tsx","utf8");
const admin=fs.readFileSync("components/guest/AdministrativePreviewModules.tsx","utf8");
const ui=fs.readFileSync("constants/volunserveLiveUi.ts","utf8");

for(const role of ["resident","volunteer","admin","superadmin"])
  assert(preview.includes('"'+role+'"'),"Missing workspace: "+role);
for(const x of [
  "ADMIN_PREVIEW_MODULES.map",
  "SUPERADMIN_PREVIEW_MODULES.map",
  "<AdministrativePreviewModules",
  "width < 1040",
  "stackColumns",
  "mobileOverlay",
  "onPress={() => setDrawerOpen(true)}",
  "No account permissions or production data",
])assert(preview.includes(x),"Missing preview UX safeguard: "+x);
assert(!preview.includes("signInWithEmailAndPassword"),"Preview must not authenticate");
assert(!admin.includes("fetch(")&&!admin.includes("addDoc(")&&!admin.includes("setDoc("),
 "Admin and Super Admin demos must contain no live writes or HTTP");
for(const module of [
"command-center","identity-reviews","lgu-attendance","admin-cases",
"assistance-requests","community-events","community-attendance","certificates",
"donor-monitoring","create-announcement",
"overview","admin-accounts","admin-logs","all-records","system-settings"
])assert(admin.includes('key:"'+module+'"'),"Missing clickable design module "+module);
for(const item of [
 "minHeight:ui.minTap","filter===status","setSelected(item[0])",
 "setNotice(","fontSize:ui.type.page.fontSize","backgroundColor:COLOR.surface",
 "borderColor:COLOR.border","disabled&&styles.disabled"
])assert(admin.includes(item),"Missing consistent admin control: "+item);
assert(preview.includes("ui.color.canvas")&&preview.includes("ui.color.sidebar")
 &&preview.includes("ui.type.card.fontSize"),"Shared design palette not adopted by guest preview");
assert(ui.includes("minTap: 44"),"Minimum control size changed");
console.log("PASS: four clickable role workspaces, 15 module designs, shared responsive tokens, no data writes");
