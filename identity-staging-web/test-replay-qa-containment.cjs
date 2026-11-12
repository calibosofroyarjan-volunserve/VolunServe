"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const camera = fs.readFileSync("identity-staging-web/camera.js", "utf8");
const html = fs.readFileSync("identity-staging-web/index.html", "utf8");

test("Preroll and replay-expiry do not imply PAD or liveness",()=>{
  assert.match(html,/Replay-attack finding \(staging\): a prerecorded face video completed/);
  assert.match(html,/Independent server-side PAD is not implemented or validated/);
  assert.match(camera,/UNVERIFIED QA ONLY — replay video may pass/);
  assert.match(camera,/browser expression challenge accepted a prerecorded/);
  assert.match(camera,/cannot be used for identity approval/);
  assert.doesNotMatch(camera,/Captured after local facial challenge — NOT certified liveness/);
});

test("Captured selfie never becomes a verification-form file, even if challenge completes",()=>{
  const fn = camera.slice(camera.indexOf("async function capture(){"),
                          camera.indexOf('$("scanClose").addEventListener'));
  assert.ok(fn.length>300,"Expected full capture function");
  const selfie = fn.indexOf('if(stage==="selfie"){');
  const dataTransfer = fn.indexOf("new DataTransfer()");
  assert.ok(selfie>0 && dataTransfer>selfie,"Selfie must be diverted before any file attachment");
  const branch = fn.slice(selfie,dataTransfer);
  assert.match(branch,/\$\("selfie"\)\.value=""/);
  assert.match(branch,/preview\("selfie",blob\)/);
  assert.match(branch,/stop\(\);\s*return;/);
  assert.doesNotMatch(branch,/\$\("selfie"\)\.files\s*=/);
  assert.doesNotMatch(branch,/new DataTransfer/);
  assert.doesNotMatch(branch,/dispatchEvent/);
  assert.equal((fn.match(/new DataTransfer\(\)/g)||[]).length,1);
  assert.match(fn,/if\(stage==="selfie"\)[\s\S]*?return;[\s\S]*?new DataTransfer\(\)/);
});

test("QA fallback file pick is cleared from the authenticated identity form",()=>{
  assert.match(camera,/const selected=input\.files\?\.\[0\]\|\|null/);
  assert.match(camera,/if\(stage==="selfie"\)input\.value=""/);
  assert.match(camera,/preview\(stage,selected\)/);
  assert.match(camera,/if\(previews\[stage\]\)URL\.revokeObjectURL\(previews\[stage\]\)/);
  assert.match(camera,/function clear\(stage\)\{\$\(stage\)\.value="";preview\(stage,null\)\}/);
});

test("Staging uploads remain fail-closed regardless of camera capture or login",()=>{
  assert.match(html,/const mediaSubmissionEnabled=false;/);
  assert.equal((html.match(/if\(!authIsolationReady\|\|!auth\|\|!mediaSubmissionEnabled\)/g)||[]).length,2);
  assert.match(html,/Government ID precheck and ID\/selfie submissions remain deliberately blocked/);
  assert.doesNotMatch(camera,/fetch\s*\(/);
  assert.doesNotMatch(camera,/navigator\.sendBeacon/);
  assert.doesNotMatch(camera,/volunserve\.com/);
});
