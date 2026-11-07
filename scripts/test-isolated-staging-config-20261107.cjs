"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("lib/stagingFirebaseConfig.ts", "utf8");
const compiled = ts.transpileModule(source, {compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const moduleRef = {exports:{}};
new Function("module","exports",compiled)(moduleRef,moduleRef.exports);
const {requireIsolatedStagingFirebaseConfig: validate} = moduleRef.exports;
const stage = {
 apiKey:"AIzaDevelopmentPlaceholderNotARealFirebaseProjectKey",
 authDomain:"volunserve-full-staging.firebaseapp.com",
 projectId:"volunserve-full-staging",
 storageBucket:"volunserve-full-staging.firebasestorage.app",
 messagingSenderId:"429213950126",
 appId:"1:429213950126:web:955dbf575697826b674d3f",
};
assert.deepEqual(validate(stage),stage);
assert.throws(()=>validate({}),/STAGING BLOCKED/);
for (const [field, wrong] of [
 ["projectId","volunserve-3aa5b"],
 ["projectId","volunserve-auth-staging"],
 ["projectId","volunserve-staging-review"],
 ["authDomain","volunserve-3aa5b.firebaseapp.com"],
 ["storageBucket","volunserve-3aa5b.firebasestorage.app"],
 ["messagingSenderId","999999999999"],
 ["appId","1:999999999999:web:0000000000000000000000"],
]) {
 assert.throws(()=>validate({...stage,[field]:wrong}),/STAGING BLOCKED/,
   "must reject wrong "+field);
}
assert.throws(()=>validate({...stage,apiKey:""}),/missing isolated Firebase field/);
assert.throws(()=>validate({...stage,apiKey:"invalid"}),/invalid public Firebase Web API key/);
const firebase = fs.readFileSync("lib/firebase.ts","utf8");
assert(firebase.includes('process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE === "1"'),"Staging must be explicitly enabled");
assert(firebase.includes("requireIsolatedStagingFirebaseConfig({"),"Firebase init must fail closed");
assert(firebase.includes("isIsolatedStagingBuild\n  ? isolatedStagingConfig!"),"Explicit stage selection required");
assert(firebase.includes("  : productionConfig;"),"Original production selection must remain unchanged");
const firebaseRc = JSON.parse(fs.readFileSync(".firebaserc","utf8"));
assert.equal(firebaseRc.projects.default,"volunserve-3aa5b",
  "Do not silently switch production project while preparing staging");
console.log("PASS: staging runtime permits only the exact full staging Firebase project; production default unchanged.");
