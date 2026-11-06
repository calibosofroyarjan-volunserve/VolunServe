"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const read=relative=>fs.readFileSync(path.join(__dirname,"..",relative),"utf8");
const shell=read("components/auth/PremiumAuthShell.tsx");
const native=read("app/login.tsx"),web=read("app/login.web.tsx"),legacy=read("app/admin-login.tsx");
assert(shell.includes("const compact = width < 900") &&
  shell.includes("const narrow = width < 480") && shell.includes("ScrollView") && shell.includes("heroHeight"),
  "Premium hero must remain responsive");
assert(shell.includes("clipPath:") && shell.includes("polygon(") && shell.includes('Platform.OS === "web"'),
  "Safe web and native geometry is preserved");
for(const label of ["Emergency Reports","Request Assistance","Community Events","VolunServe","Build Safer Communities","Welcome Back"]){
  assert(shell.includes(label), "Premium shell element missing: "+label);
}
assert(!shell.includes("styles.switcher") && !shell.includes("styles.roleRow") && shell.includes("styles.formCard"),
  "Role selection tabs and footer must not appear in a unified login");
assert(native.includes("<PremiumAuthShell>") && web.includes("<PremiumAuthShell>"),
  "Both platform Login routes use the same one-page premium card");
for(const s of [native,web]){
  assert(s.includes("unifiedPasswordDestination(profile)") && s.includes("loginUser("),
    "Password login must resolve authenticated account's actual approved role");
  assert(s.includes('router.push("/admin-request")') && s.includes('router.push("/signup")'),
    "Keep separate access request and ordinary Signup navigation");
  assert(s.includes("handleGoogleLogin") && s.includes('router.replace("/public")') && s.includes("PasswordResetDialog"),
    "Keep Google, Guest and Forgot Password flows");
}
assert(web.includes("useSignupGoogle") && native.includes("useSignupGoogle") &&
       read("lib/useSignupGoogle.web.ts").includes("signInWithPopup") &&
       read("lib/useSignupGoogle.ts").includes("GoogleAuthProvider.credential"),
  "Native and web Google OAuth must be preserved for community accounts");
assert(web.includes('profile.role === "admin" || profile.role === "superadmin"') &&
       native.includes('profile.role === "admin" || profile.role === "superadmin"'),
  "Staff Google OAuth must remain blocked: credentials only");
assert(legacy.includes('<Redirect href="/login" />'), "Old Admin Login URL must redirect to the same form");
console.log("PASS: one responsive premium login, protected staff routing and all community links");
