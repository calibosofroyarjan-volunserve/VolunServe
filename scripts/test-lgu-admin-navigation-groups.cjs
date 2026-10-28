/**
 * Ensures that a grouped LGU sidebar retains every existing destination.
 * UI grouping must never hide/remove a feature or duplicate a module link.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const s = fs.readFileSync(path.resolve(__dirname, "..", "app", "(admin)", "_layout.tsx"), "utf8");
const nav = s.match(/const NAV_ITEMS: NavItem\[\] = \[([\s\S]*?)\n\];/);
const groups = s.match(/const NAV_SECTIONS:[\s\S]*?= \[([\s\S]*?)\n\];/);
assert(nav && groups, "Sidebar data declarations not found");
const labels = [...nav[1].matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
const paths = [...nav[1].matchAll(/route:\s*"([^"]+)"/g)].map(m => m[1]);
const groupLabels = [...groups[1].matchAll(/labels:\s*\[([^\]]+)\]/g)]
  .flatMap(m => [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]));
assert.equal(labels[0], "Command Center", "Command Center must remain the first pinned destination");
assert.equal(new Set(paths).size, paths.length, "Duplicated Admin module routes");
assert.deepEqual([...groupLabels].sort(), labels.slice(1).sort(),
  "A module was removed, duplicated, or moved outside the LGU workflow groups");
assert(s.includes("onPress={() => openRoute(item.route)}"), "Module navigation callbacks are missing");
console.log("PASS " + paths.length + " Admin module routes retained, grouped and reachable");
