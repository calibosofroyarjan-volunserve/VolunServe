"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const stage=fs.readFileSync("components/auth/ReadOnlyPreviewAuthNotice.tsx","utf8");
assert(stage.includes("Sign-in is disabled on this preview"));
assert(stage.includes("Please do not type your real email, password"));
assert(stage.includes('router.replace("/public/preview")'));
assert(!stage.includes("<TextInput"),"The staged warning must never ask for passwords or emails");
assert(!stage.includes("loginUser(") && !stage.includes("signUpUser(") && !stage.includes("signInWith"),
  "Staging auth notice must not invoke login/sign-up methods");
const files=[
 ["app/login.web.tsx","WebLogin","ProductionWebLogin"],
 ["app/login.tsx","Login","ProductionLogin"],
 ["app/signup.web.tsx","Signup","ProductionSignup"],
 ["app/signup.tsx","Signup","ProductionSignup"],
 ["app/admin-request.tsx","LguStaffApplication","ProductionLguStaffApplication"],
];
for(const [path,entry,real] of files) {
  const src=fs.readFileSync(path,"utf8");
  const wrapper = "export default function "+entry+"() {\n"+
   "  if (isStagingPreview) return <ReadOnlyPreviewAuthNotice />;\n"+
   "  return <"+real+" />;\n}";
  assert(src.includes(wrapper),"Missing safe staging early-return in "+path);
  assert(src.includes("function "+real+"() {"),"Production form must remain preserved in "+path);
}
console.log("PASS: staging routes never render interactive login, signup, or staff application credential fields");
