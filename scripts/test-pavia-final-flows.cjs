"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname,"..");
const code = fs.readFileSync(path.join(root,"lib/communityEventEligibility.ts"),"utf8");
const js = ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsForTest = {};
new Function("exports", js)(exportsForTest);
const {isEventJoinableNow, sjdmEventTimeMillis, validSjdmEventSchedule} = exportsForTest;
const at=(d,h,m)=>new Date(d+"T"+h+":"+m+":00+08:00").getTime();
test("past upcoming events cannot be joined even if status was not closed",()=>{
  assert.equal(isEventJoinableNow({status:"upcoming",date:"2026-10-01",time:"10:00"},at("2026-10-28","15","00")),false);
});
test("future upcoming event accepts join before start only",()=>{
  const event={status:"upcoming",date:"2026-10-30",time:"13:00"};
  assert.equal(isEventJoinableNow(event,at("2026-10-28","15","00")),true);
  assert.equal(isEventJoinableNow(event,at("2026-10-30","13","00")),false);
});
test("an active event ends exactly at its advertised time",()=>{
  const event={status:"active",date:"2026-10-30",time:"13:00",endTime:"16:00"};
  assert.equal(isEventJoinableNow(event,at("2026-10-30","15","30")),true);
  assert.equal(isEventJoinableNow(event,at("2026-10-30","16","00")),false);
});
test("completed and invalid date/time never join",()=>{
  assert.equal(isEventJoinableNow({status:"completed",date:"2026-10-30",time:"13:00"}),false);
  assert.equal(isEventJoinableNow({status:"upcoming",date:"2026-02-31",time:"10:00"}),false);
  assert.equal(isEventJoinableNow({status:"upcoming",date:"2026-10-30",time:"25:00"}),false);
});
test("Join eligibility rechecked after latest Firestore event read and reflected in both web and native UI",()=>{
  const screen=fs.readFileSync(path.join(root,"app/(tabs)/community-events.tsx"),"utf8");
  assert.match(screen,/isEventJoinableNow\(current\)/);
  assert.match(screen,/const open = isEventJoinableNow\(event\);/);
  assert.match(screen,/setBusyEvent\(event.id\)/);
  assert.match(screen,/serverTimestamp\(\)/);
});

test("Request Assistance confirmation is mandatory and suggested titles allow free text",()=>{
  const request=fs.readFileSync(path.join(root,"app/(tabs)/resident.tsx"),"utf8");
  assert.match(request,/const \[declarationAccepted, setDeclarationAccepted\] = useState\(false\)/);
  assert.match(request,/if \(!declarationAccepted\)/);
  assert.match(request,/accessibilityRole="checkbox"/);
  assert.match(request,/setDeclarationAccepted\(false\)/);
  assert.match(request,/Suggested request title \(optional\)/);
  assert.match(request,/Other — write my own/);
  assert.match(request,/onChangeText=\{\(/);
});
test("Both signup views visibly distinguish required fields from optional inputs",()=>{
  for(const p of ["app/signup.tsx","app/signup.web.tsx"]){
    const v=fs.readFileSync(path.join(root,p),"utf8");
    assert.match(v,/color: "#C62828"/);
    assert.match(v,/label\.replace\(/);
  }
});

test("New email signups require verified ownership before protected Resident login",()=>{
  const auth=fs.readFileSync(path.join(root,"lib/firebaseAuth.ts"),"utf8");
  const rules=fs.readFileSync(path.join(root,"firestore.rules"),"utf8");
  const session=fs.readFileSync(path.join(root,"lib/useUserSession.ts"),"utf8");
  assert.match(auth,/emailVerificationRequired: !usesGoogle/);
  assert.match(auth,/await sendEmailVerification\(user\)/);
  assert.match(auth,/await signOut\(auth\)/);
  assert.match(auth,/profile\.emailVerificationRequired === true/);
  assert.match(auth,/await reload\(user\)/);
  assert.match(auth,/await getIdToken\(user, true\)/);
  assert.match(rules,/p\.get\('emailVerificationRequired', false\) != true/);
  assert.match(rules,/request\.auth\.token\.get\('email_verified', false\) == true/);
  assert.match(session,/profileData\?\.emailVerificationRequired === true/);
  for(const file of ["app/signup.tsx","app/signup.web.tsx"]){
    const screen=fs.readFileSync(path.join(root,file),"utf8");
    assert.match(screen,/googleBound \? "\/\(tabs\)" : "\/login"/);
  }
});
test("Mobile Google account linking cannot skip required password",()=>{
  const mobile=fs.readFileSync(path.join(root,"app/signup.tsx"),"utf8");
  assert.match(mobile,/const step4Valid = passwordValid &&/);
  assert.match(mobile,/Create a VolunServe password as well/);
  assert.doesNotMatch(mobile,/googleBound \|\| passwordValid/);
});

test("LGU identity manual verification requires independent original ID and registered-name confirmation",()=>{
  const screen=fs.readFileSync(path.join(root,"app/(admin)/identity-reviews.tsx"),"utf8");
  const api=fs.readFileSync(path.join(root,"backend/server.js"),"utf8");
  assert.match(screen,/originalDocumentReviewed/);
  assert.match(screen,/registeredNameMatched/);
  assert.match(screen,/accessibilityRole="checkbox"/);
  assert.match(screen,/originalDocumentReviewed: action === "verify" && originalDocumentReviewed/);
  assert.match(screen,/registeredNameMatched: action === "verify" && registeredNameMatched/);
  assert.match(screen,/setOriginalDocumentReviewed\(false\)/);
  assert.match(screen,/setRegisteredNameMatched\(false\)/);
  assert.match(api,/request\.body\?\.originalDocumentReviewed === true/);
  assert.match(api,/request\.body\?\.registeredNameMatched === true/);
  assert.match(api,/identity_name_and_document_check_required/);
  assert.match(api,/originalDocumentReviewed: true/);
  assert.match(api,/registeredNameMatched: true/);
});

test("Event times use Philippine UTC+08 even when browser machine timezone differs",()=>{
  assert.equal(sjdmEventTimeMillis("2026-10-30","13:00"),
    Date.parse("2026-10-30T13:00:00+08:00"));
  assert.equal(sjdmEventTimeMillis("2026-02-31","09:00"),null);
  assert.equal(validSjdmEventSchedule({date:"2026-10-30",time:"13:00",endTime:"12:59"}),false);
  assert.equal(validSjdmEventSchedule({date:"2026-10-30",time:"13:00",endTime:"16:00"}),true);
  assert.equal(isEventJoinableNow({status:"active",date:"2026-10-30",time:"13:00",endTime:"16:00"},
    Date.parse("2026-10-30T06:00:00Z")),true);
  assert.equal(isEventJoinableNow({status:"active",date:"2026-10-30",time:"13:00",endTime:"16:00"},
    Date.parse("2026-10-30T08:00:00Z")),false);
});
test("LGU Admin checks future SJDM time and shared end-time validator",()=>{
 const admin=fs.readFileSync(path.join(root,"app/(admin)/community-events.tsx"),"utf8");
 assert.match(admin,/sjdmEventTimeMillis\(proposal.date, proposal.time\)/);
 assert.match(admin,/validSjdmEventSchedule\(proposal\)/);
 assert.doesNotMatch(admin,/new Date\(\s*`\$\{proposal.date\}T\$\{proposal.time\}/);
});
