"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Approved Sir Pavia login shell replaces old right-side form without removing left carousel",()=>{
 const s=read("components/auth/PremiumAuthShell.tsx");
 assert.match(s,/Resident & Volunteer Login/);
 assert.match(s,/LGU & System Administration Login/);
 assert.match(s,/Residents & Volunteers/);
 assert.match(s,/LGU & System Admin/);
 assert.match(s,/styles\.formCard/);
 assert.match(s,/styles\.roleRow/);
 assert.match(s,/styles\.photoBadge/);
 assert.match(s,/SLIDES\.map/);
 assert.match(s,/router\.replace\("\/login"\)/);
 assert.match(s,/router\.replace\("\/admin-login"\)/);
 assert.doesNotMatch(s,/auth-resident-hero\.webp|auth-admin-hero\.webp/);
});
test("Resident web and mobile sign-in keep Firebase and accessible inline error feedback",()=>{
 const web=read("app/login.web.tsx");
 const native=read("app/login.tsx");
 const feedback=read("components/auth/AuthFeedback.tsx");
 for(const src of [web,native]){
   assert.match(src,/AuthFeedback/);
   assert.match(src,/PremiumAuthShell active="resident"/);
   assert.match(src,/homeRouteForProfile/);
   assert.match(src,/loginUser/);
   assert.doesNotMatch(src,/(^|[^\w.])alert\s*\(|window\.confirm\s*\(/m);
 }
 assert.match(web,/browserLocalPersistence/);
 assert.match(web,/browserSessionPersistence/);
 assert.match(web,/sendPasswordResetEmail/);
 assert.match(web,/connectGoogleAccountWeb/);
 assert.match(feedback,/accessibilityRole="alert"/);
});
test("LGU and Super Admin preserve separate credential-only access and staff application",()=>{
 const admin=read("app/admin-login.tsx");
 const root=read("app/_layout.tsx");
 assert.match(admin,/PremiumAuthShell active="admin"/);
 assert.match(admin,/isApprovedProfile\(profile\)/);
 assert.match(admin,/profile\.adminStatus !== "suspended"/);
 assert.match(admin,/signOut\(auth\)/);
 assert.match(admin,/\/\(superadmin\)/);
 assert.match(admin,/\/\(admin\)\/command-center/);
 assert.match(admin,/router\.push\("\/admin-request"\)/);
 assert.doesNotMatch(admin,/GoogleAuthProvider|connectGoogleAccountWeb/);
 assert.match(root,/AppDialogHost/);
});
