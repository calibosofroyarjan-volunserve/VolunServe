const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const read = relative => fs.readFileSync(path.join(__dirname,"..",relative),"utf8");
const shell = read("components/auth/PremiumAuthShell.tsx");
const resident = read("app/login.tsx");
const residentWeb = read("app/login.web.tsx");
const staff = read("app/admin-login.tsx");
assert(shell.includes('const compact = width < 900') &&
  shell.includes('const narrow = width < 480') &&
  shell.includes("ScrollView") && shell.includes("heroHeight"),
  "Shared sign-in hero must adapt for tablet/mobile and allow scrolling");
assert(shell.includes("clipPath:") &&
  shell.includes("polygon(") &&
  shell.includes("Platform.OS === \"web\""),
  "Chamfer corners must be web-only and provide a native fallback");
for (const name of ["Emergency Reports","Request Assistance","Community Events",
  "Resident Login","LGU Admin Login","VolunServe","Build Safer Communities"]) {
  assert(shell.includes(name), "Missing design element: " + name);
}
assert(resident.includes('<PremiumAuthShell active="resident">') &&
  residentWeb.includes('<PremiumAuthShell active="resident">') &&
  staff.includes('<PremiumAuthShell active="admin">'),
  "Both sign-in routes must use the same premium shell");
assert(resident.includes("GoogleAuthProvider.credential") &&
  resident.includes("handleGoogleLogin") &&
  resident.includes('router.replace("/public")') &&
  resident.includes('router.push("/signup")') &&
  resident.includes("handleForgotPassword"),
  "Resident OAuth, guest, signup and password reset are retained");
assert(resident.includes("browserSessionPersistence") &&
  resident.includes("browserLocalPersistence") &&
  resident.includes("applyRememberMe()"),
  "Remember me must be functional instead of decorative");
assert(residentWeb.includes("connectGoogleAccountWeb()") &&
  residentWeb.includes("applySessionPersistence()") &&
  residentWeb.includes('profile.role === "admin" || profile.role === "superadmin"') &&
  residentWeb.includes("await logoutUser()"),
  "Web login must preserve Google popup while denying privileged staff through community auth");
assert(!staff.includes("GoogleAuthProvider") &&
  !staff.includes("promptGoogleAsync") &&
  staff.includes("loginUser(cleanEmail, password)") &&
  staff.includes('router.push("/admin-request")'),
  "LGU login remains password-only with application pathway");
console.log("PASS: professional chamfered login layouts, responsive geometry and preserved auth boundary");
