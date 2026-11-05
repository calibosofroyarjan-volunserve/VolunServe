"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/unifiedLoginRouting.ts", "utf8");
const mod = {exports:{}};
const fake = {
  isApprovedProfile: p => p?.status === "approved",
  isAdminProfile: p => p?.status === "approved" && p?.role === "admin" && p?.adminStatus !== "suspended",
  isSuperAdminProfile: p => p?.status === "approved" && p?.role === "superadmin",
  isLguPersonnelProfile: p => p?.status === "approved" && p?.role === "lgu_personnel" && p?.lguVerified === true && p?.employmentStatus === "active",
  homeRouteForProfile: p => p.role === "superadmin" ? "/(superadmin)" : p.role === "admin" ? "/(admin)/command-center" : p.role === "lgu_personnel" ? "/(lgu)" : "/(tabs)"
};
const javascript = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
new Function("module","exports","require", javascript)(mod,mod.exports,(path)=>{
  assert.equal(path,"./firebaseAuth");
  return fake;
});
const route=mod.exports.unifiedPasswordDestination;
let checked=0;function check(label,fn){fn();console.log("PASS "+label);checked++;}
const p=(role,options={})=>({role,status:"approved",...options});
check("Basic Resident route",()=>assert.equal(route(p("resident")),"/(tabs)"));
check("Volunteer community route",()=>assert.equal(route(p("volunteer")),"/(tabs)"));
check("Approved LGU Admin route",()=>assert.equal(route(p("admin",{adminStatus:"active"})),"/(admin)/command-center"));
check("Approved Super Admin route",()=>assert.equal(route(p("superadmin")),"/(superadmin)"));
check("Approved authorized LGU personnel route preserved",()=>assert.equal(route(p("lgu_personnel",{lguVerified:true,employmentStatus:"active"})),"/(lgu)"));
check("No pending applicant login",()=>assert.throws(()=>route(p("applicant",{status:"pending_review"})),/not approved/));
check("No self-promoted applicant",()=>assert.throws(()=>route(p("applicant")) , /pending/));
check("Rejected Resident blocked",()=>assert.throws(()=>route(p("resident",{status:"rejected"})),/not approved/));
check("Suspended Admin blocked",()=>assert.throws(()=>route(p("admin",{adminStatus:"suspended"})),/inactive/));
check("Unauthorized LGU personnel blocked",()=>assert.throws(()=>route(p("lgu_personnel",{lguVerified:false,employmentStatus:"active"})),/not been cleared/));
check("Suspended Super Admin blocked",()=>assert.throws(()=>route(p("superadmin",{status:"suspended"})),/not approved/));
const shell=fs.readFileSync("components/auth/PremiumAuthShell.tsx","utf8");
check("One premium card, no role selector",()=>{
  assert(shell.includes("VolunServe Login"));
  assert(shell.includes("styles.formCard"));
  assert(!shell.includes("styles.switcher"));
  assert(!shell.includes("styles.roleRow"));
  assert(!shell.includes("Choose account sign-in"));
  assert(shell.includes("SLIDES.map"));
});
for(const path of ["app/login.tsx","app/login.web.tsx"]){
  const code=fs.readFileSync(path,"utf8");
  check(path+": credential routing for staff and community",()=>{
    assert(code.includes("unifiedPasswordDestination(profile)"));
    assert(code.includes("router.replace(destination as any)"));
    assert(code.includes("handleLogin"));
    assert(code.includes('accessibilityLabel="Email address"'));
    assert(code.includes('accessibilityLabel="Password"'));
    assert(code.includes("<PremiumAuthShell>"));
    assert(!code.includes("Login as Resident / Volunteer"));
  });
  check(path+": Google community-only and staff email/password",()=>{
    assert(code.includes('profile.role === "admin" || profile.role === "superadmin"'));
    assert(code.includes("Staff accounts must use email and password"));
    assert(code.includes("handleGoogleLogin"));
    assert(code.includes("Sign In"));
  });
  check(path+": reset, guest, general Signup and LGU request are all retained",()=>{
    assert(code.includes("PasswordResetDialog"));
    assert(code.includes('router.replace("/public")'));
    assert(code.includes('router.push("/signup")'));
    assert(code.includes('router.push("/admin-request")'));
    assert(code.includes("Request Admin Access"));
    assert(code.includes("Sign Up"));
  });
}
const legacy = fs.readFileSync("app/admin-login.tsx","utf8");
check("Old /admin-login bookmarks redirect to one Login",()=>{
  assert(legacy.includes('Redirect href="/login"'));
  assert(!legacy.includes("loginUser("));
  assert(!legacy.includes("TextInput"));
});
const applicant=fs.readFileSync("app/admin-request.tsx","utf8");
const staff=fs.readFileSync("app/(superadmin)/admin-accounts.tsx","utf8");
const rules=fs.readFileSync("firestore.rules","utf8");
check("LGU applicants do not self-register as Admin",()=>{
  assert(applicant.includes('role:"applicant",status:"pending_review"'));
  assert(applicant.includes("residentAccess:false,volunteerAccess:false"));
  assert(staff.includes("credentialsConfirmed && identityMatched && lguEmploymentConfirmed"));
  assert(staff.includes('role: "admin"'));
  assert(rules.includes("hasFreshLguCredentialReview()"));
});
console.log(checked+" unified login checks passed");
