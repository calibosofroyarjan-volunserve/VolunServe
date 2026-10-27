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
// Regression: the original left-side carousel is mandatory on desktop.
// Design references apply to the RIGHT form only, never replace the slideshow.
const heroStart = shell.indexOf('<View style={[styles.hero,');
const rightStart = shell.indexOf('<View style={[styles.right,');
assert(heroStart > 0 && rightStart > heroStart, "Original two-column layout must remain");
const left = shell.slice(heroStart, rightStart);
for (const requirement of [
  'source={SLIDES[slide]}',
  'Report Emergencies',
  'Build Safer Communities',
  'Emergency Reports',
  'Request Assistance',
  'Community Events',
  'Stronger People.',
  'Safer Communities.',
  'SLIDES.map',
  'setSlide(index)',
]) assert(left.includes(requirement), "The original left carousel lost: " + requirement);
assert(shell.includes('setInterval(() => setSlide('),
  "The left carousel must auto-advance");
assert(shell.includes('6500'), "Preserve original slide interval");
assert(shell.includes('slide1.jpg') && shell.includes('slide2.jpg') && shell.includes('slide3.jpg'),
  "Preserve all three original slides");
const right = shell.slice(rightStart);
assert(right.includes("auth-resident-hero.webp") === false,
  "Photo assets must be declared in the source map, not reloaded dynamically");
for (const required of ["styles.photoFrame","styles.wave","styles.formFields",
  'accessibilityRole="tab"', "{children}", "styles.roleRow"]) {
  assert(right.includes(required), "New right-only login design missing: " + required);
}

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
