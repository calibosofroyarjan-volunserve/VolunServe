"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("lib/stagingFirebaseConfig.ts", "utf8");
const compiled = ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const moduleRef = {exports:{}};
new Function("module","exports",compiled)(moduleRef,moduleRef.exports);
const {requireIsolatedStagingFirebaseConfig: validate} = moduleRef.exports;
const stage = {
 apiKey:"AIzaDevelopmentPlaceholderNotARealFirebaseProjectKey",
 authDomain:"volunserve-staging-review.firebaseapp.com",
 projectId:"volunserve-staging-review",
 storageBucket:"volunserve-staging-review.firebasestorage.app",
 messagingSenderId:"999999999999",
 appId:"1:999999999999:web:0000000000000000000000",
};
assert.deepEqual(validate(stage),stage);
assert.throws(()=>validate({}),/STAGING BLOCKED/);
assert.throws(()=>validate({...stage,projectId:"volunserve-3aa5b"}),/production VolunServe/);
assert.throws(()=>validate({...stage,authDomain:"volunserve-3aa5b.firebaseapp.com"}),/production VolunServe/);
assert.throws(()=>validate({...stage,storageBucket:"volunserve-3aa5b.firebasestorage.app"}),/production VolunServe/);
assert.throws(()=>validate({...stage,authDomain:"volunserve-staging-review-bad.firebaseapp.com"}),/must match/);
assert.throws(()=>validate({...stage,storageBucket:"other-stage.appspot.com"}),/must match/);
assert.throws(()=>validate({...stage,apiKey:""}),/missing isolated Firebase field/);
assert.throws(()=>validate({...stage,messagingSenderId:"n/a"}),/sender ID is invalid/);

const firebase = fs.readFileSync("lib/firebase.ts","utf8");
assert(firebase.includes('process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE === "1"'),"Staging must be explicitly enabled");
assert(firebase.includes("requireIsolatedStagingFirebaseConfig({"),"Firebase init must fail closed");
assert(firebase.includes("isIsolatedStagingBuild\n  ? isolatedStagingConfig!"),"Explicit stage selection required");
assert(firebase.includes("  : productionConfig;"),"Original production selection must remain unchanged");
const firebaseRc = JSON.parse(fs.readFileSync(".firebaserc","utf8"));
assert.equal(firebaseRc.projects.default,"volunserve-3aa5b",
  "Do not silently switch production project while preparing staging");
console.log("PASS: isolated staging refuses live Firebase, missing config and cross-project Auth/Storage.");
