const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const read = p => fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const shell = read("components/auth/PremiumAuthShell.tsx");
const login = read("app/login.tsx");
const web = read("app/login.web.tsx");
const admin = read("app/admin-login.tsx");
const google = read("components/auth/GoogleBrandMark.tsx");

for (const s of [
  "Resident & Volunteer Login",
  "LGU & System",
  "Administration Login",
  "Login",
  "Basic",
  "Verified",
  "Volunteer",
  "Resident & Volunteer",
  "auth-resident-hero.webp",
  "auth-admin-hero.webp",
  'accessibilityRole="tab"',
  "Svg",
  "Path",
  "useWindowDimensions",
  "ScrollView",
]) assert(shell.includes(s), "Missing login reference-design element: "+s);
assert(fs.existsSync(path.join(__dirname,"..","assets/images/auth-resident-hero.webp")),
  "Missing local Resident volunteer photo");
assert(fs.existsSync(path.join(__dirname,"..","assets/images/auth-admin-hero.webp")),
  "Missing local SJDM City Hall photo");
assert(shell.includes("clipPath:") && shell.includes("polygon(") && shell.includes('Platform.OS === "web"'),
  "Shared mobile-friendly shape fallback must remain for other auth forms");
for (const value of ['#4285F4','#34A853','#FBBC05','#EA4335']) {
  assert(google.includes(value), "Google brand mark is missing the original Google color: "+value);
}
for (const src of [login,web]) {
  assert(src.includes('<PremiumAuthShell active="resident">'), "Resident login shell missing");
  for (const piece of ["Login as Resident / Volunteer","Continue with Google",
    "Continue as Guest", "Create An Account", "GoogleBrandMark","router.push(\"/signup\")",
    "router.replace(\"/public\")", "handleForgotPassword","rememberMe"]) {
    assert(src.includes(piece), "Resident login feature missing: "+piece);
  }
}
assert(login.includes("GoogleAuthProvider.credential")&&login.includes("handleGoogleLogin"),
  "Native OAuth callback must remain");
assert(web.includes("connectGoogleAccountWeb()")&&web.includes("applySessionPersistence()") &&
  web.includes('profile.role === "admin" || profile.role === "superadmin"') &&
  web.includes("await logoutUser()"), "Web Google popup must preserve admin role denial");
assert(login.includes("browserLocalPersistence")&&login.includes("browserSessionPersistence") &&
  login.includes("applyRememberMe()"), "Native web remember-me persistence must remain");
assert(admin.includes('<PremiumAuthShell active="admin">') &&
  admin.includes("Login as Admin") && admin.includes("Request LGU Admin Access") &&
  admin.includes("loginUser(cleanEmail, password)") &&
  admin.includes('router.push("/admin-request")'), "LGU admin restricted login flow broken");
assert(admin.includes("setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)"),
  "Admin Remember me checkbox must actually change session persistence");
assert(!admin.includes("GoogleAuthProvider")&&!admin.includes("promptGoogleAsync"),
  "Admin must not gain Resident Google OAuth access");
console.log("PASS: reference photo login forms, real Google mark, resident Google+Guest+Sign Up, secure LGU portal, persistent Remember me");
