"use strict";
/** Synthetic route contract only. No login, user records, cookies or network. */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");

const source=fs.readFileSync("lib/guestLandingRedirect.ts","utf8");
const compilation=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  reportDiagnostics:true,
});
assert.equal(compilation.diagnostics?.length||0,0);
const mockModule={exports:{}};
vm.runInNewContext(compilation.outputText,{
  module:mockModule,exports:mockModule.exports,Error,String,
},{timeout:4000});
const shouldRedirect=mockModule.exports.shouldLeaveGuestLanding;
const authenticated={
  rootSegment:"public",childSegment:"",
  authUid:"synthetic-resident",
  authEmail:"Resident@Example.invalid",
  authEmailVerified:true,
  profileRole:"resident",
  profileEmail:"resident@example.invalid",
  approvedProfile:true,
  disposableEmail:false,
};

test("Approved real Resident session leaves Guest landing, not Guest account linking",()=>{
  assert.equal(shouldRedirect(authenticated),true);
  assert.equal(shouldRedirect({...authenticated,childSegment:"index"}),true);
  const login=fs.readFileSync("app/login.tsx","utf8");
  assert.match(login,/destination = unifiedPasswordDestination\(profile\)/);
  assert.match(login,/router.replace\(destination as any\)/);
});

test("Signed-out Guest and explicit Guest preview remain accessible",()=>{
  assert.equal(shouldRedirect({...authenticated,authUid:null}),false);
  assert.equal(shouldRedirect({...authenticated,childSegment:"preview"}),false);
  assert.equal(shouldRedirect({...authenticated,rootSegment:"verify-certificate"}),false);
  assert.equal(shouldRedirect({...authenticated,rootSegment:"login"}),false);
  assert.equal(shouldRedirect({...authenticated,rootSegment:"signup"}),false);
});

test("No profile, unapproved, email-unverified or mismatched account is not auto-routed",()=>{
  for(const patch of [
    {approvedProfile:false},
    {authEmailVerified:false},
    {profileRole:null},
    {profileRole:"guest",approvedProfile:false},
    {authEmail:null},{profileEmail:null},
    {authEmail:"other@example.invalid"},
    {disposableEmail:true},
  ]){
    assert.equal(shouldRedirect({...authenticated,...patch}),false,
      JSON.stringify(patch));
  }
});

test("Approved staff sign-in may leave public landing without community email assumptions",()=>{
  assert.equal(shouldRedirect({...authenticated,profileRole:"admin",
    profileEmail:"",authEmail:"admin@example.invalid"}),true);
  assert.equal(shouldRedirect({...authenticated,profileRole:"superadmin",
    profileEmail:"",authEmail:"admin@example.invalid"}),true);
  assert.equal(shouldRedirect({...authenticated,profileRole:"admin",
    approvedProfile:false}),false);
});

test("Actual root layout applies guard before early public return and never writes guest role",()=>{
  const root=fs.readFileSync("app/_layout.tsx","utf8");
  const guardStart=root.indexOf("if (isPublicRoute) {");
  const guardEnd=root.indexOf("if (isCertificateVerificationRoute",guardStart);
  assert.ok(guardStart>=0&&guardEnd>guardStart);
  const block=root.slice(guardStart,guardEnd);
  assert.match(block,/shouldLeaveGuestLanding\(/);
  assert.match(block,/authUser\?\.uid/);
  assert.match(block,/profileEmail: profile\?\.email/);
  assert.match(block,/isApprovedProfile\(profile\)/);
  assert.match(block,/router\.replace\(homeRouteForProfile\(profile\)/);
  assert.doesNotMatch(block,/signOut|linkWithCredential|setDoc|updateDoc|guestRole/);
  const guest=fs.readFileSync("app/login.tsx","utf8");
  assert.match(guest,/firebaseSignOut\(auth\)\.then\(\(\) => router.replace\("\/public"\)\)/);
});
