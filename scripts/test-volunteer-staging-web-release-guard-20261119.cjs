"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const {verify,PROJECT}=require("./guard-volunteer-staging-web-release-20261119.cjs");
const valid={
  EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",
  EXPO_PUBLIC_FIREBASE_API_KEY:"fake-public-stage-key-for-static-test",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:PROJECT+".firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID:PROJECT,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:PROJECT+".firebasestorage.app",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:"123456789",
  EXPO_PUBLIC_FIREBASE_APP_ID:"1:123456789:web:fake",
  EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER:"render",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_PROJECT_ID:PROJECT
};
test("isolated QA configuration and code contracts pass without credentials",()=>{
  assert.deepEqual(verify(valid),[]);
});
test("production Firebase/project cannot pass even with staging feature flags",()=>{
  const modified={...valid,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID:"volunserve-3aa5b",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:"volunserve-3aa5b.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:"volunserve-3aa5b.firebasestorage.app"};
  assert.ok(verify(modified).includes("EXPO_PUBLIC_FIREBASE_PROJECT_ID_invalid"));
  assert.ok(verify(modified).includes("STAGING_AUTH_DOMAIN_INVALID"));
});
test("default and partial builds fail closed",()=>{
  assert.ok(verify({}).length>=6);
  assert.ok(verify({...valid,EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY:"false"}).length);
  assert.ok(verify({...valid,EXPO_PUBLIC_VOLUNSERVE_ENV:"production"}).length);
});
test("staging source contract changes block the release gate",()=>{
  const errors=verify(valid,()=> "removed and no longer integrated");
  assert.ok(errors.some(x=>x.includes("SOURCE_CONTRACT_CHANGED")));
});
test("CLI masks all configured Firebase public values and cannot deploy",()=>{
  const runner=path.join(__dirname,"guard-volunteer-staging-web-release-20261119.cjs");
  const child=spawnSync(process.execPath,[runner],{
    env:{...process.env,...valid,EXPO_PUBLIC_FIREBASE_PROJECT_ID:"volunserve-3aa5b"},
    encoding:"utf8",timeout:10000});
  assert.equal(child.status,1);
  assert.match(child.stderr,/BLOCKED/);
  assert.doesNotMatch(child.stderr,/fake-public-stage-key-for-static-test/);
  assert.doesNotMatch(child.stderr,/1:123456789:web:fake/);
});
