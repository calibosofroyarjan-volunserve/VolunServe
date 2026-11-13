"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cp = require("node:child_process");
const read = (p) => fs.readFileSync(p, "utf8");
const base = cp.execFileSync("git", ["show", "origin/live-protected:firestore.rules"], { encoding: "utf8" });
const now = read("firestore.rules");
const start = "    match /announcements/{announcementId} {";
const end = "    match /identityVerifications/{uid} {";
const segment = c => {
  const a = c.indexOf(start), b = c.indexOf(end, a);
  assert.ok(a >= 0 && b > a && c.indexOf(start, a + 1) === -1, "rules block boundary must be unique");
  return c.slice(a,b);
};
assert.notEqual(segment(base), segment(now), "announcement rules hotfix is missing");
assert.equal(now.replace(segment(now), segment(base)), base, "STOP: non-announcement Firestore rules were modified");
assert.match(segment(now), /approved\(\) && resource\.data\.audience == 'all'/);
assert.match(segment(now), /request\.resource\.data\.publishAt == request\.time/);
assert.match(segment(now), /allow create: if isAdmin\(\)/);
for (const file of ["app/(tabs)/announcements.tsx","components/home/Home.web.tsx","lib/announcementAlerts.ts"]) {
  const code = read(file);
  assert.match(code, /where\("audience", "==", "all"\)/, file + " must query scoped audience");
}
const admin = read("app/(admin)/create-announcement.tsx");
assert.match(admin, /await user\.getIdToken\(true\)/);
assert.match(admin, /await addDoc\(/);
const shell = read("components/auth/PremiumAuthShell.tsx");
assert.match(shell, /Image\.resolveAssetSource\(SLIDES\[slide\]\)/);
assert.match(shell, /backgroundSize: "cover"/);
assert.match(shell, /backgroundPosition: "center center"/);
assert.match(shell, /Platform\.OS === "web" && slideUri/);
assert.match(shell, /style=\{\[styles\.heroSlideImage, webSlideCover\]\}/);
assert.match(shell, /resizeMode="cover"/);
const changed = cp.execFileSync("git", ["diff", "--name-only", "origin/live-protected...HEAD"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const allow = new Set([
  "components/auth/PremiumAuthShell.tsx",
  "firestore.rules",
  "lib/announcementAlerts.ts",
  "app/(tabs)/announcements.tsx",
  "components/home/Home.web.tsx",
  "app/(admin)/create-announcement.tsx",
  "scripts/test-announcements-published-audience-emulator.cjs",
  "scripts/test-protected-announcements-carousel-scoped.cjs",
  ".github/workflows/validate-live-protected-announcements-carousel-no-deploy.yml"
]);
assert.ok(changed.every(p => allow.has(p)), "STOP: unrelated changed files: "+changed.filter(p=>!allow.has(p)));
console.log("PASS: protected source changed only scoped modules; announcement rules isolated, carousel has web cover + native fallback.");
