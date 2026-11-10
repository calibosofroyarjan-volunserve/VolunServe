"use strict";
/** Stop public web export if Render/GitHub stage variables are missing or unsafe. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const expectedHost="volunserve-staging-api-shell.onrender.com";
if(process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE!=="1")
  throw Error("STAGING BUILD BLOCKED: staging mode must be explicitly enabled");
function compile(path){
 const source=fs.readFileSync(path,"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 const mod={exports:{}};
 new Function("module","exports","process","URL",compiled)(mod,mod.exports,process,URL);
 return mod.exports;
}
const config=compile("lib/stagingFirebaseConfig.ts");
const stage=config.requireIsolatedStagingFirebaseConfig({
 apiKey:process.env.EXPO_PUBLIC_STAGING_FIREBASE_API_KEY,
 authDomain:process.env.EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN,
 projectId:process.env.EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID,
 storageBucket:process.env.EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET,
 messagingSenderId:process.env.EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID,
 appId:process.env.EXPO_PUBLIC_STAGING_FIREBASE_APP_ID,
});
assert(stage.projectId==="volunserve-auth-staging",
  "STAGING BUILD BLOCKED: certificate frontend must use volunserve-auth-staging Firebase project");
require("./test-staging-certificate-connection-20261110.cjs");
const backend=compile("lib/stagingBackendSafety.ts");
const backendUrl=backend.getSafeVolunServeBackendBaseUrl();
const host=new URL(backendUrl).hostname;
assert(host===expectedHost||backendUrl===backend.DISABLED_STAGING_BACKEND,
 "STAGING BUILD BLOCKED: point only to the audited inert staging shell or disabled .invalid host");
assert(!stage.projectId.includes("volunserve-3aa5b"));
assert(!backendUrl.includes("volunserve.onrender.com"));
console.log("PASS: build is isolated. Firebase:",stage.projectId,"Backend:",host);
