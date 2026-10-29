"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
const web=read("components/DisasterResponse.web.tsx");
const native=read("components/DisasterResponse.native.tsx");
const moduleTabs=read("app/(tabs)/disaster-response.tsx");
const quickActions=read("components/EmergencyResponseQuickActions.tsx");
const centers=read("components/VerifiedEvacuationCenters.web.tsx");

test("Top Emergency Reports form excludes 911/active case and evacuation center panels",()=>{
  for(const src of [web,native]){
    assert.doesNotMatch(src,/import\s+EmergencyResponseQuickActions\s+from/);
    assert.doesNotMatch(src,/import\s+VerifiedEvacuationCenters\s+from/);
    assert.doesNotMatch(src,/<EmergencyResponseQuickActions\b/);
    assert.doesNotMatch(src,/<VerifiedEvacuationCenters\b/);
  }
});
test("Resident emergency web report maintains form, identity, GPS, attachments, and case tracking",()=>{
  for(const item of ['className="workflow-strip"','className="resident-summary"','<form onSubmit={submit}','name="category"','setDoc(','className="success-actions"','Track response','<a href="/my-cases"']){
    assert.ok(web.includes(item),"Existing emergency report flow changed: "+item);
  }
});
test("Native emergency report still has form, evidence and valid submit",()=>{
  for(const item of ['<ScrollView','styles.sectionCard','What happened?','identityVerified','submitLock.current']){
    assert.ok(native.includes(item),"Native report flow changed: "+item);
  }
});
test("Top-level Emergency Reports retains Report Emergency and Live Response Map",()=>{
  assert.match(moduleTabs,/Report Emergency/);
  assert.match(moduleTabs,/Live Response Map/);
  assert.match(moduleTabs,/<MapTracking \/> : <DisasterResponse \/>/);
});
test("Quick actions, 911 dialer and verified centers are not deleted from reusable source code",()=>{
  assert.match(quickActions,/tel:911/);
  assert.match(quickActions,/Track response/);
  assert.match(centers,/VerifiedEvacuationCenters/);
});
