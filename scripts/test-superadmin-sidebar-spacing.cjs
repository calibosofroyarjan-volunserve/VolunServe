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
test("Approved five-module Super Admin navigation is unchanged", () => {
  const labels = [...source.matchAll(/\{ label: "(System Overview|LGU Staff & Admin Accounts|System Records|Audit Logs|System Settings)"/g)].map(m=>m[1]);
  assert.deepEqual(labels, ["System Overview","LGU Staff & Admin Accounts","System Records","Audit Logs","System Settings"]);
});
test("Desktop and drawer sidebar have balanced navigation spacing", () => {
  assert(styleBody("sidebar").includes("width: 280"));
  assert(styleBody("sidebarCompact").includes("width: 280"));
  const menu = styleBody("sidebarContent");
  assert(menu.includes("flexGrow: 1"));
  assert(menu.includes('justifyContent: "flex-start"'));
  assert(menu.includes("paddingTop: 28"));
  assert(menu.includes("gap: 11"));
  const item = styleBody("navItem");
  assert(item.includes("minHeight: 58"));
  assert(item.includes("borderRadius: 12"));
  const icon = styleBody("navIcon");
  assert(icon.includes("width: 40") && icon.includes("height: 40"));
  assert(source.includes("styles.navItemActive"));
  assert(source.includes("styles.sidebarUtility"));
});
