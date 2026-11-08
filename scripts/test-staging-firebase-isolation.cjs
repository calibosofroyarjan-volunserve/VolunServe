"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source=fs.readFileSync("lib/firebase.ts","utf8");
const js=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const mocks={
  "firebase/app":{getApp:()=>{throw Error("Unexpected preexisting app");},getApps:()=>[],
    initializeApp:(config)=>({options:config})},
  "firebase/auth":{getAuth:app=>({app}),connectAuthEmulator:()=>{}},
  "firebase/firestore":{getFirestore:app=>({app}),connectFirestoreEmulator:()=>{}},
  "firebase/functions":{getFunctions:(app,region)=>({app,region}),connectFunctionsEmulator:()=>{}},
  "firebase/storage":{getStorage:app=>({app})},
};
function load(env={},hostname) {
  const module={exports:{}};
  new Function("require","module","exports","process","window","console",js)(
    name=>{if(!(name in mocks))throw Error("Unexpected module "+name);return mocks[name];},
    module,module.exports,{env},hostname?{location:{hostname}}:undefined,{log:()=>{}}
  );
  return module.exports;
}
function stageEnv(overrides={}) {
  return {
    EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY:"AIzaSyDedicatedStagingWebKeyNotProduction",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN:"volunserve-staging-test.firebaseapp.com",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-staging-test",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET:"volunserve-staging-test.firebasestorage.app",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_MESSAGING_SENDER_ID:"999999999999",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_APP_ID:"1:999999999999:web:staging",
    ...overrides,
  };
}
test("normal app config remains the existing production Firebase, untouched",()=>{
  const config=load().firebaseConfig;
  assert.equal(config.projectId,"volunserve-3aa5b");
  assert.equal(config.authDomain,"volunserve-3aa5b.firebaseapp.com");
});
test("staging target never falls back to production when variables are missing",()=>{
  assert.throws(()=>load({EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging"}),
    /STAGING FIREBASE CONFIG REQUIRED/);
  for(const key of Object.keys(stageEnv()).filter(k=>k.startsWith("EXPO_PUBLIC_VOLUNSERVE_STAGING_"))) {
    const env=stageEnv();
    delete env[key];
    assert.throws(()=>load(env),/STAGING FIREBASE CONFIG REQUIRED/,key);
  }
});
test("staging cannot accidentally use production Firebase project/API credentials",()=>{
  for(const [key,value] of [
    ["EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID","volunserve-3aa5b"],
    ["EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY","AIzaSyAPPi-UxUxyMvoNeaBLUOPOls63dEDLUmI"],
    ["EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN","volunserve-3aa5b.firebaseapp.com"],
    ["EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET","volunserve-3aa5b.firebasestorage.app"],
    ["EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID","volunserve-prod-staging"],
  ]) assert.throws(()=>load(stageEnv({[key]:value})),/STAGING FIREBASE CONFIG REQUIRED/);
  assert.throws(()=>load({EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"stagng"}),
    /Invalid Firebase target/);
});
test("complete distinct staging config stays isolated from production Auth and Firestore",()=>{
  const x=load(stageEnv());
  assert.equal(x.firebaseConfig.projectId,"volunserve-staging-test");
  assert.equal(x.firebaseConfig.storageBucket,"volunserve-staging-test.firebasestorage.app");
  assert.equal(x.auth.app.options.projectId,"volunserve-staging-test");
  assert.equal(x.db.app.options.projectId,"volunserve-staging-test");
  assert.equal(x.functions.app.options.projectId,"volunserve-staging-test");
  assert.notEqual(x.firebaseConfig.projectId,x.productionConfig.projectId);
});

test("staging signup cannot run on live VolunServe hostname",()=>{
  for(const host of ["volunserve.com","www.volunserve.com","volunserve-3aa5b.web.app"]) {
    assert.throws(()=>load(stageEnv(),host),/Firebase target does not match website host/);
  }
});
test("live Firebase cannot run on full staging Hosting hostname",()=>{
  for(const host of ["volunserve-full-staging.web.app","volunserve-full-staging.firebaseapp.com"]) {
    assert.throws(()=>load({},host),/Firebase target does not match website host/);
  }
});
test("staging signup still permits the registered full staging hostname with isolated configuration",()=>{
  const stage=stageEnv({
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-full-staging",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN:"volunserve-full-staging.firebaseapp.com",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET:"volunserve-full-staging.firebasestorage.app",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_MESSAGING_SENDER_ID:"429213950126",
    EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_APP_ID:"1:429213950126:web:955dbf575697826b674d3f",
  });
  const x=load(stage,"volunserve-full-staging.web.app");
  assert.equal(x.auth.app.options.projectId,"volunserve-full-staging");
  assert.equal(x.db.app.options.projectId,"volunserve-full-staging");
  assert.equal(x.functions.app.options.projectId,"volunserve-full-staging");
});
