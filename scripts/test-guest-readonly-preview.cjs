// Guest routes intentionally use only local sample presentation, never authenticated data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("components/guest/GuestWorkspace.tsx", "utf8");
const publicLayout = fs.readFileSync("app/public/_layout.tsx", "utf8");
const root = fs.readFileSync("app/_layout.tsx", "utf8");
const index = fs.readFileSync("app/public/index.tsx", "utf8");
const preview = fs.readFileSync("app/public/preview.tsx", "utf8");

for (const name of [
  "Emergency Reports", "Request Assistance", "Community Events", "Donations",
  "Emergency Tasks", "My Progress", "Certificates", "Verified Resident",
  "read-only", "Guest Preview", "Guest Preview does not create",
]) assert(source.includes(name), "missing guest feature: " + name);

for (const dangerous of [/from ["'][^"']*firebase/i, /\baddDoc\s*\(/, /\bsetDoc\s*\(/,
  /\bupdateDoc\s*\(/, /\bdeleteDoc\s*\(/, /\bonSnapshot\s*\(/, /\bsignInAnonymously\s*\(/,
  /\bfetch\s*\(/]) assert(!dangerous.test(source), "guest preview must not fetch/write: " + dangerous);
assert(publicLayout.includes("<Stack"), "isolated guest stack");
assert(root.includes('rootSegment === "public"'), "root auth guard still allows public routes");
assert(index.includes("GuestWorkspace"), "public landing routed");
assert(preview.includes("GuestWorkspace"), "public preview routed");
for (const name of ["donation", "resident", "volunteer", "disaster-response", "map-tracking", "map-tracking.web"]) {
  const legacy = fs.readFileSync("app/public/" + name + ".tsx", "utf8");
  assert(legacy.includes("/public/preview?role="), "legacy guest route must redirect: " + name);
}
console.log("Guest Resident/Volunteer read-only preview contract passed");
