/**
 * Regression guard for the LGU Admin visual refinements.
 * Verifies all profile links have a destination and the graph remains data-driven.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

assert(exists("app/(admin)/admin-profile.tsx"), "Missing protected LGU Admin profile screen");
assert(exists("app/(tabs)/profile.tsx"), "Resident Profile route must remain available");
assert(!exists("app/(admin)/profile.tsx"), "Admin route must not collide with Resident /profile");
const layout = read("app/(admin)/_layout.tsx");
const profile = read("app/(admin)/admin-profile.tsx");
const chart = read("components/ui/WorkspaceBarChart.tsx");
const overview = read("app/(admin)/command-center.tsx");
const superOverview = read("app/(superadmin)/index.tsx");

assert(layout.includes('onPress={() => openRoute("/(admin)/admin-profile")}'),
  "LGU header/sidebar profile navigation missing");
assert((layout.match(/openRoute\("\/\(admin\)\/admin-profile"\)/g) || []).length === 2,
  "Both Admin profile entry points must link to the same screen");
assert(profile.includes('profile.role !== "admin" || !isApprovedProfile(profile)'),
  "LGU Admin profile must enforce role and approved account status");
assert(profile.includes('doc(db, "users", user.uid)'),
  "Profile must update only its own Firestore record");
assert(profile.includes('fullName: nextName, phoneNumber: nextPhone'),
  "Editable profile data must be limited to non-privileged contact fields");
assert(overview.includes('orientation="vertical"'), "LGU Overview must use vertical columns");
assert(overview.includes("dataError ? null : metrics.activeCases"),
  "Graph must use real count state with unavailable values clearly distinguished");
assert(chart.includes('orientation = "horizontal"'), "Other workspaces must retain legacy horizontal graph by default");
assert(superOverview.includes("<WorkspaceBarChart"), "Super Admin graph must remain intact");
console.log("PASS: colored vertical Admin chart and secure, reachable Admin Profile");
