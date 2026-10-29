"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const layout = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/_layout.tsx"), "utf8");
const profile = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/profile.tsx"), "utf8");

test("Header dropdown contains View Profile, System Settings and Sign Out in order", () => {
  const start = layout.indexOf("{accountOpen && (");
  const end = layout.indexOf("<View style={styles.contentArea}>", start);
  assert(start >= 0 && end > start);
  const dropdown = layout.slice(start, end);
  const actions = [...dropdown.matchAll(/accessibilityLabel="(View Profile|System Settings|Sign Out)"/g)].map(m=>m[1]);
  assert.deepEqual(actions, ["View Profile","System Settings","Sign Out"]);
  assert(dropdown.includes('router.push("/(superadmin)/profile" as Href)'));
  assert(dropdown.includes('router.push("/(superadmin)/system-settings" as Href)'));
  assert(dropdown.includes("onPress={confirmSignOut}"));
});
test("Sidebar has neither account identity nor signout and desktop retains name only in header", () => {
  const from = layout.indexOf("function SuperAdminSidebar(");
  const to = layout.indexOf("const styles = StyleSheet.create(",from);
  const sidebar = layout.slice(from,to);
  assert(!sidebar.includes("fullName"));
  assert(!sidebar.includes("initials"));
  assert(!sidebar.includes("Sign Out"));
  assert(!sidebar.includes("System Settings"));
  assert(!sidebar.includes("onSignOut"));
  assert(layout.includes("{fullName}"));
  assert(layout.includes("const confirmSignOut = () => {"));
  assert(layout.includes('pathname.endsWith("/system-settings") ? "System Settings"'));
  assert(layout.includes("logoutUser()"));
});
test("Own profile route is guarded, live and read-only", () => {
  assert(profile.includes("useUserSession()"));
  assert(profile.includes("isSuperAdminProfile(profile)"));
  assert(profile.includes('<Redirect href="/admin-login" />'));
  assert(profile.includes("user.email"));
  assert(profile.includes("user.uid"));
  assert(!/\b(updateDoc|deleteDoc|writeBatch|addDoc|setDoc)\s*\(/.test(profile));
});
