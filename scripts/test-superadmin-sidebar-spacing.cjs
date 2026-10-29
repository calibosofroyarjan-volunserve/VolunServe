"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/_layout.tsx"), "utf8");

function styleBody(key) {
  const start = source.indexOf("  " + key + ": {");
  assert(start >= 0, "Missing style " + key);
  const end = source.indexOf("\n  },", start);
  assert(end > start, "Missing style terminator " + key);
  return source.slice(start, end + 5);
}
test("Four operational modules are in approved sidebar order, with settings moved into dropdown", () => {
  const start = source.indexOf("const navItems: NavItem[] = [");
  const end = source.indexOf("];", start);
  assert(start >= 0 && end > start);
  const labels = [...source.slice(start,end).matchAll(/label: "([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(labels, ["System Overview","LGU Staff & Admin Accounts","System Records","Audit Logs"]);
  assert(!source.slice(start,end).includes("System Settings"));
  assert(source.includes('accessibilityLabel="System Settings"'));
  assert(source.includes('router.push("/(superadmin)/system-settings" as Href)'));
});
test("Desktop and drawer sidebar have consistent top-aligned navigation spacing", () => {
  assert(styleBody("sidebar").includes("width: 280"));
  assert(styleBody("sidebarCompact").includes("width: 280"));
  const menu = styleBody("sidebarContent");
  assert(menu.includes("flexGrow: 1"));
  assert(menu.includes('justifyContent: "flex-start"'));
  assert(menu.includes("paddingTop: 30"));
  assert(menu.includes("gap: 14"));
  const item = styleBody("navItem");
  assert(item.includes("minHeight: 58"));
  const icon = styleBody("navIcon");
  assert(icon.includes("width: 40") && icon.includes("height: 40"));
  assert(source.includes("styles.navItemActive"));
  assert(!source.includes("styles.sidebarUtility"));
  assert(!source.includes("styles.sidebarIdentity"));
  assert(!source.includes("styles.logoutButton"));
});
