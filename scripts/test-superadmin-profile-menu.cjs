"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const layout = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/_layout.tsx"), "utf8");
const profile = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/profile.tsx"), "utf8");

test("Header dropdown only contains View Profile and links to dedicated route", () => {
  const start = layout.indexOf("{accountOpen && (");
  const end = layout.indexOf("<View style={styles.contentArea}>", start);
  assert(start >= 0 && end > start);
  const dropdown = layout.slice(start, end);
  assert(dropdown.includes('accessibilityLabel="View Profile"'));
  assert(dropdown.includes('router.push("/(superadmin)/profile" as Href)'));
  assert(!dropdown.includes("System Settings"));
  assert(!dropdown.includes("Sign Out"));
});

test("Sign Out exists only in sidebar footer and System Settings remains in five-module nav", () => {
  assert(layout.includes('accessibilityLabel="Log out of Super Admin account"'));
  assert(layout.includes('label: "System Settings"'));
  const navs = [...layout.matchAll(/\{ label: "(System Overview|LGU Staff & Admin Accounts|System Records|Audit Logs|System Settings)"/g)].map(x=>x[1]);
  assert.deepEqual(navs, ["System Overview","LGU Staff & Admin Accounts","System Records","Audit Logs","System Settings"]);
  assert(layout.includes('pathname.endsWith("/profile") ? "View Profile"'));
});

test("Profile screen displays live own session and is restricted and read-only", () => {
  assert(profile.includes("useUserSession()"));
  assert(profile.includes("isSuperAdminProfile(profile)"));
  assert(profile.includes('<Redirect href="/admin-login" />'));
  assert(profile.includes("user.email"));
  assert(profile.includes("profile?.fullName"));
  assert(profile.includes("user.uid"));
  assert(profile.includes("Account Status"));
  assert(!/\b(updateDoc|deleteDoc|writeBatch|addDoc|setDoc)\s*\(/.test(profile));
});
