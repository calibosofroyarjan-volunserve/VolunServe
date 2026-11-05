"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
test("Unified premium sign-in retains carousel and one clear login card",()=>{
  const s=read("components/auth/PremiumAuthShell.tsx");
  assert.match(s,/VolunServe Login/);
  assert.match(s,/styles\.formCard/);
  assert.match(s,/styles\.photoBadge/);
  assert.match(s,/SLIDES\.map/);
  assert.doesNotMatch(s,/styles\.switcher|styles\.roleRow|Choose account sign-in/);
  assert.doesNotMatch(s,/auth-resident-hero\.webp|auth-admin-hero\.webp/);
});
test("Web and native password Login authorize by approved role, not a selector",()=>{
  for(const s of [read("app/login.web.tsx"),read("app/login.tsx")]){
    assert.match(s,/unifiedPasswordDestination\(profile\)/);
    assert.match(s,/AuthFeedback/);
    assert.match(s,/<PremiumAuthShell>/);
    assert.match(s,/loginUser/);
    assert.match(s,/router\.push\("\/admin-request"\)/);
    assert.match(s,/router\.push\("\/signup"\)/);
    assert.doesNotMatch(s,/(^|[^\w.])alert\s*\(|window\.confirm\s*\(/m);
  }
});
test("Reset, Google and Guest continue working",()=>{
  const web=read("app/login.web.tsx"),native=read("app/login.tsx");
  const modal=read("components/auth/PasswordResetDialog.tsx");
  assert.match(web,/browserLocalPersistence/);
  assert.match(web,/browserSessionPersistence/);
  for(const s of [web,native]){
    assert.match(s,/PasswordResetDialog/);
    assert.match(s,/setResetOpen\(true\)/);
    assert.match(s,/router\.replace\("\/public"\)/);
    assert.match(s,/handleGoogleLogin/);
    assert.doesNotMatch(s,/sendPasswordResetEmail/);
  }
  assert.match(modal,/await sendPasswordResetEmail\(auth, address\)/);
  assert.match(web,/connectGoogleAccountWeb/);
  assert.match(read("components/auth/AuthFeedback.tsx"),/accessibilityRole="alert"/);
});
test("Staff entrypoint no longer duplicates login and keeps existing bookmarks",()=>{
  const legacy=read("app/admin-login.tsx"),root=read("app/_layout.tsx"),policy=read("lib/unifiedLoginRouting.ts");
  assert.match(legacy,/<Redirect href="\/login" \/>/);
  assert.doesNotMatch(legacy,/loginUser|TextInput/);
  assert.match(root,/AppDialogHost/);
  assert.match(policy,/isAdminProfile|isSuperAdminProfile|isApprovedProfile/);
});
