"use strict";
/* Synthetic only. No webcams, real IDs, Firebase, production, or photo uploads. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/localFaceQualityCheck.ts","utf8");
const compiled = ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
  reportDiagnostics:true,
});
assert.equal(compiled.diagnostics?.length||0,0);
const moduleObj={exports:{}};
vm.runInNewContext(compiled.outputText,{
  exports:moduleObj.exports,module:moduleObj,
  require:()=>{throw Error("Pure face check must have no runtime imports");},
});
const {evaluateLocalFaceQuality}=moduleObj.exports;
const good=[{boundingBox:{originX:265,originY:205,width:270,height:370}}];
const result=(detections=good,bright=130)=>
  evaluateLocalFaceQuality(detections,800,800,bright);

test("one centered well-lit face is green, not identity verification",()=>{
  assert.equal(result().ready,true);
  assert.equal(result().reason,"ready");
  assert.equal(Object.keys(result()).sort().join(","),"label,ready,reason");
});
test("no face and multiple faces stay red",()=>{
  assert.equal(result([]).reason,"no_face");
  assert.equal(result([good[0],good[0]]).reason,"multiple_faces");
});
test("face distance and centering remain red",()=>{
  assert.equal(result([{boundingBox:{originX:350,originY:350,width:100,height:100}}]).reason,"too_far");
  assert.equal(result([{boundingBox:{originX:80,originY:80,width:700,height:700}}]).reason,"too_close");
  assert.equal(result([{boundingBox:{originX:550,originY:200,width:240,height:350}}]).reason,"off_center");
});
test("low lighting and incomplete frames never trigger capture",()=>{
  assert.equal(result(good,20).reason,"dark");
  assert.equal(result(good,NaN).reason,"dark");
  assert.equal(evaluateLocalFaceQuality(good,0,800,100).ready,false);
  assert.equal(evaluateLocalFaceQuality([{boundingBox:null}],800,800,100).ready,false);
});
test("web auto-snapshot requires explicit consent, localhost, MediaPipe and stable green",()=>{
  const page=fs.readFileSync("app/public/local-face-capture-demo.web.tsx","utf8");
  assert.match(page,/__DEV__/);
  assert.match(page,/window\.location\.hostname/);
  assert.match(page,/!consent/);
  assert.match(page,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(page,/evaluateLocalFaceQuality/);
  assert.match(page,/if \(!quality\.ready\)/);
  assert.match(page,/heldMs >= 1500/);
  assert.match(page,/void capturePhoto\(token\)/);
  assert.match(page,/waitForCameraPreview/);
  assert.match(page,/URL\.revokeObjectURL/);
  assert.match(page,/getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  for(const forbidden of [
    "firebase/firestore","firebase/storage","uploadBytes(","setDoc(","updateDoc(",
    "getIdToken(","/api/identity/","volunserve.onrender.com","localStorage.",
    "sessionStorage.","navigator.sendBeacon",
  ]) assert(!page.includes(forbidden),"Forbidden data or identity action: "+forbidden);
});
test("retry and reject use fixed reasons, verify still needs independent notes",()=>{
  const page=fs.readFileSync("app/public/local-admin-review-demo.web.tsx","utf8");
  assert.match(page,/const PRESET_REASONS/);
  assert.match(page,/setPresetReason\(reason\)/);
  assert.match(page,/PRESET_REASONS\.some\(x => x === presetReason\)/);
  assert.match(page,/notes\.trim\(\)\.length >= 25/);
  assert.match(page,/confirmation === "verify"/);
  assert.match(page,/decision === "retry_required"/);
  assert.match(page,/local-face-capture-demo/);
  assert(!page.includes("fetch("));
  assert(!page.includes("updateDoc("));
});
test("native routes remain inert and separate from real Admin auth",()=>{
  const native=fs.readFileSync("app/public/local-face-capture-demo.tsx","utf8");
  assert(!native.includes("getUserMedia("));
  assert(!native.includes("fetch("));
  const layout=fs.readFileSync("app/_layout.tsx","utf8");
  assert(layout.includes('router.replace("/login")'));
  assert(!layout.includes("local-face-capture-demo"));
});
