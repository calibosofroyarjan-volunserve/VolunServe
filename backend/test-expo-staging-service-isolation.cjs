"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync("lib/stagingExpoServiceIsolation.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}});
assert.equal(compiled.diagnostics?.length||0,0);

function load(env){
 const m={exports:{}};
 const scope={module:m,exports:m.exports,process:{env},Error};
 vm.runInNewContext(compiled.outputText,scope,{filename:"stagingExpoServiceIsolation.js"});
 return m.exports;
}

test("Production behavior preserves original backend URL and unrelated uploads",()=>{
 const mod=load({});
 assert.equal(mod.isStagingExpoWeb(),false);
 assert.equal(mod.getSafeVolunServeBackendBaseUrl(),"https://volunserve.onrender.com");
 assert.doesNotThrow(mod.blockProductionEvidenceUploadDuringStaging);
 assert.doesNotThrow(mod.blockExternalCheckoutDuringStaging);
});

test("Staging pins all app backends to isolated staging and blocks media/payment",()=>{
 const mod=load({
  EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",
  EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-full-staging",
 });
 assert.equal(mod.isStagingExpoWeb(),true);
 assert.equal(mod.getSafeVolunServeBackendBaseUrl(),
              "https://volunserve-backend-staging.onrender.com");
 assert.throws(mod.blockProductionEvidenceUploadDuringStaging,/STAGING BLOCKED/);
 assert.throws(mod.blockExternalCheckoutDuringStaging,/STAGING BLOCKED/);
});

test("Mismatched, incomplete or production target in staging fails closed",()=>{
 for(const env of [
  {EXPO_PUBLIC_VOLUNSERVE_ENV:"staging"},
  {EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging"},
  {EXPO_PUBLIC_VOLUNSERVE_ENV:"production",EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging"},
  {EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"production"},
  {EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging",
   EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-3aa5b"},
 ]) {
  const mod=load(env);
  assert.throws(mod.getSafeVolunServeBackendBaseUrl,/STAGING BLOCKED/);
  assert.throws(mod.blockExternalCheckoutDuringStaging,/STAGING BLOCKED/);
 }
});

test("Four affected app screens use shared staging routing, uploads and checkout blocked",()=>{
 const expected=[
  ["app/(tabs)/donation.tsx","PAYMONGO_BACKEND_URL = getSafeVolunServeBackendBaseUrl()"],
  ["app/(tabs)/resident.tsx","ASSISTANCE_BACKEND_URL = getSafeVolunServeBackendBaseUrl()"],
  ["app/(admin)/assistance-requests.tsx","SECURE_ASSISTANCE_BACKEND = getSafeVolunServeBackendBaseUrl()"],
  ["app/(admin)/donation-list.tsx","SECURE_DONATION_BACKEND = getSafeVolunServeBackendBaseUrl()"],
 ];
 for(const [file,snippet] of expected){
  const c=fs.readFileSync(file,"utf8");
  assert(c.includes(snippet),file);
  assert(!c.includes('= "https://volunserve.onrender.com"'),file);
 }
 const donations=fs.readFileSync("app/(tabs)/donation.tsx","utf8");
 const post=donations.indexOf("fetch(\`\${PAYMONGO_BACKEND_URL}/api/paymongo/checkout-session");
 const guard=donations.indexOf("blockExternalCheckoutDuringStaging();");
 assert(post>guard&&guard>=0,"Staging must block before checkout POST");
 const admin=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
 const upload=admin.indexOf("const uploadPublicCampaignPhoto = async");
 const block=admin.indexOf("blockProductionEvidenceUploadDuringStaging();",upload);
 const body=admin.indexOf("new FormData()",upload);
 assert(upload>=0&&block>upload&&block<body,"Staging blocks upload before reading/forming media");
 const id=fs.readFileSync("lib/identityVerification.ts","utf8");
 assert(id.includes("assertIdentityMediaSubmissionAllowed(body)"),
        "AI health alone cannot unlock sensitive ID/selfie");
 const server=fs.readFileSync("backend/server.js","utf8");
 assert(server.includes("STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false"));
});

test("Release guard checks staging Firebase/host and production endpoint inventory",()=>{
 const audit=fs.readFileSync("scripts/check-expo-resident-staging-release.cjs","utf8");
 assert.match(audit,/volunserve-full-staging/);
 assert.match(audit,/volunserve-backend-staging\.onrender\.com/);
 assert.match(audit,/STAGING BLOCKED/);
 assert.match(audit,/api\.cloudinary\.com/);
 assert.match(audit,/identityVerification\.ts/);
});
