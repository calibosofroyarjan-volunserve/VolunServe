/**
 * Guard Expo Router entry points for unified Login and Community Events.
 * Legacy Admin bookmarks still exist but resolve to the same role-aware form.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

assert(exists("app/login.tsx") && exists("app/login.web.tsx"),
  "Unified Login must be available on web and native");
assert(exists("app/admin-login.tsx") &&
  read("app/admin-login.tsx").includes('<Redirect href="/login" />'),
  "Existing Admin login bookmarks must redirect into the unified form");
for (const entry of ["app/login.tsx", "app/login.web.tsx"]) {
  const login = read(entry);
  assert(login.includes("<PremiumAuthShell>") &&
    login.includes("unifiedPasswordDestination(profile)") &&
    login.includes('router.push("/admin-request")'),
    entry + " must use one role-aware login and retain LGU application access");
}
assert(!read("components/auth/PremiumAuthShell.tsx").includes("styles.switcher"),
  "Unified login must not restore the old role-selection tabs");
console.log("PASS unified Admin, Resident and Volunteer Login entrypoints");

assert(exists("app/(tabs)/community-events.tsx") &&
  read("components/home/Home.native.tsx").includes('"/(tabs)/community-events" as Href'),
  "Native Community Events route must remain navigable");
console.log("PASS Resident/Volunteer community events screen and navigation target");

assert(read("app/_layout.tsx").includes('<Stack.Screen name="admin-login" />'),
  "Admin legacy Login route must remain registered");
assert(read("app/_layout.tsx").includes('<Stack.Screen name="admin-request" />') &&
  read("app/_layout.tsx").includes("isAdminRequestRoute"),
  "LGU staff application page must remain reachable without staff credentials");

for (const layout of ["app/(admin)/_layout.tsx", "app/(superadmin)/_layout.tsx"]) {
  const source = read(layout);
  assert(/router\\.replace\\(\\s*"\\/admin-login" as Href\\s*,?\\s*\\)/.test(source),
    layout + " must type Admin logout redirect, with legacy path forwarded to unified Login");
}
console.log("PASS Admin and Super Admin logout routes preserve typed legacy redirects");
