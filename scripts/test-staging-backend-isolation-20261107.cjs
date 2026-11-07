"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("lib/stagingBackendSafety.ts", "utf8");
const compile = (env) => {
  const js = ts.transpileModule(source, {compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
  }}).outputText;
  const mod={exports:{}};
  new Function("module","exports","process","URL",js)(mod,mod.exports,{env},URL);
  return mod.exports;
};
const production=compile({});
assert.equal(production.getSafeVolunServeBackendBaseUrl(),"https://volunserve.onrender.com");
assert.doesNotThrow(()=>production.blockProductionEvidenceUploadDuringStaging());
const stage=compile({EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE:"1"});
assert.equal(stage.getSafeVolunServeBackendBaseUrl(),"https://volunserve-staging-disabled.invalid");
assert.throws(()=>stage.blockProductionEvidenceUploadDuringStaging(),/STAGING BLOCKED/);
const testOrigin="https://volunserve-staging-api.onrender.com";
assert.equal(compile({EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE:"1",EXPO_PUBLIC_STAGING_BACKEND_URL:testOrigin}).getSafeVolunServeBackendBaseUrl(),testOrigin);
for(const url of [
 "https://volunserve.onrender.com", "https://volunserve.com",
 "https://www.volunserve.com", "https://volunserve-3aa5b.web.app",
 "https://volunserve-3aa5b.firebaseapp.com", "https://evil.example.com",
 "http://volunserve-staging.onrender.com",
 "https://volunserve-staging.onrender.com/path",
 "https://user:password@volunserve-staging.onrender.com",
 "https://volunserve-staging.onrender.com/?production=true",
]) {
 const guarded=compile({EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE:"1",EXPO_PUBLIC_STAGING_BACKEND_URL:url});
 assert.throws(()=>guarded.getSafeVolunServeBackendBaseUrl(),/STAGING BLOCKED/,"Unsafe endpoint permitted "+url);
}

const required=[
 ["app/(tabs)/donation.tsx","PAYMONGO_BACKEND_URL"],
 ["app/(tabs)/resident.tsx","ASSISTANCE_BACKEND_URL"],
 ["app/(admin)/assistance-requests.tsx","SECURE_ASSISTANCE_BACKEND"],
 ["app/(admin)/donation-list.tsx","SECURE_DONATION_BACKEND"],
 ["lib/identityVerification.ts","FALLBACK_BACKEND_URL"],
];
for (const [path,variable] of required) {
 const s=fs.readFileSync(path,"utf8");
 assert(s.includes(variable+" = getSafeVolunServeBackendBaseUrl()"),"Staging routing not applied in "+path);
}
const id=fs.readFileSync("lib/identityVerification.ts","utf8");
assert(id.includes('isStagingPreview ? "" : process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL'),
  "Staging identity must not accept potentially production override");
const donate=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
assert(donate.includes("blockProductionEvidenceUploadDuringStaging();"),
  "Production Cloudinary upload must remain blocked in staging");
console.log("PASS: production unchanged, staging cannot reach live Render endpoints or Cloudinary uploads");
