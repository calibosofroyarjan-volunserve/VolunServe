/**
 * Guard explicit Expo Router entry points used by login and native home.
 * Typed Href assertions protect navigation while local .expo route manifests
 * regenerate; this test verifies those paths still have actual screen files.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const routes = [
  {
    name: "LGU Admin login",
    screen: "app/admin-login.tsx",
    screens: ["app/login.tsx", "app/login.web.tsx"],
    href: '"/admin-login" as Href',
  },
  {
    name: "Resident/Volunteer community events",
    screen: "app/(tabs)/community-events.tsx",
    screens: ["components/home/Home.native.tsx"],
    href: '"/(tabs)/community-events" as Href',
  },
];
for (const route of routes) {
  assert(exists(route.screen), route.name + " route file is missing: " + route.screen);
  for (const source of route.screens) {
    assert(read(source).includes(route.href), source + " does not navigate to " + route.name);
  }
  console.log("PASS " + route.name + " screen and navigation target");
}
assert(read("app/_layout.tsx").includes('<Stack.Screen name="admin-login" />'),
  "Admin login must be a registered route in the root layout");
console.log("PASS root layout registers administrative login");
