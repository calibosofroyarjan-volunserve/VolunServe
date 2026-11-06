"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const theme = read("constants/volunserveUi.ts");
const admin = read("components/admin/AdminReviewHero.tsx");
const dialog = read("components/ui/AppDialogHost.tsx");
const pagination = read("components/ui/ListPagination.tsx");
const native = read("app/(tabs)/volunteer.tsx");
const web = read("app/(tabs)/volunteer.web.tsx");

for (const color of ["background", "surface", "text", "muted", "primary", "border"]) {
  assert(theme.includes(color + ":"), "Missing shared color token: " + color);
}
for (const source of [admin, dialog, pagination, native, web]) {
  assert(source.includes('volunserveUi as ui'), "Missing shared visual tokens");
}
assert(admin.includes("accessibilityLabel={title + \" page header\"}"));
assert(!admin.includes("orbLarge") && !admin.includes("decorativeStem"),
  "Admin headers must not bring back decorative art");
assert(!web.includes("<LinearGradient") && !web.includes("botanicalDesktop") &&
  !web.includes("botanicalMobile"), "Volunteer web header should use a clean surface");
assert(!native.includes("headerLeaf") && native.includes("backgroundColor: ui.color.surface"),
  "Volunteer mobile header should use the same clean surface");
assert(web.includes("openLiveMap()") && native.includes("openLiveMap()"),
  "Do not remove Volunteer Live Map actions");
assert(web.includes("runTransaction(") && native.includes("runTransaction("),
  "Do not remove Volunteer task state transitions");
assert(pagination.includes("safePageSize") && pagination.includes("recordCount") &&
  pagination.includes("ui.minTouchHeight"), "Pagination must clamp invalid inputs and meet minimum touch sizes");
const guardedDismissals = dialog.match(/if \(request && cancelable\) dismissAppDialog\(request\.id\)/g) || [];
assert.equal(guardedDismissals.length, 2,
  "Both Android back and background tap must honor non-cancelable dialogs");
console.log("PASS clean shared UI, protected task actions, pagination and cancelable dialog guards");
