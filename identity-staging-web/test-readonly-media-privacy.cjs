"use strict";
// No Firebase creds, webcam, biometrics, network or real IDs.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("identity-staging-web/index.html","utf8");
const camera=fs.readFileSync("identity-staging-web/camera.js","utf8");

test("The legacy staging test lab clearly explains upload pause before file inputs",()=>{
  assert.match(html,/id="identityMediaPaused"/);
  assert.match(html,/Media submissions are paused/);
  assert.match(html,/A healthy AI endpoint does NOT authorize identity media uploads/);
  assert(html.indexOf('id="identityMediaPaused"')<html.indexOf('id="front"'));
  assert.match(html,/id="fullStagingGateNotice"/);
  assert.match(html,/const mediaSubmissionEnabled=false;/);
  assert.match(html,/config\.projectId==='volunserve-full-staging'/);
  assert.match(html,/volunserve-backend-staging\.onrender\.com/);
});

test("All sensitive ID/selfie file and consent controls stay disabled even before JS loads",()=>{
  for(const id of ["front","back","selfie"]){
    assert.match(html,new RegExp('id="'+id+'" disabled accept="image/'));
  }
  for(const id of ["precheckConsent","consent"]){
    assert.match(html,new RegExp('id="'+id+'" type="checkbox" disabled'));
  }
  assert.match(html,/for\(const id of \['front','back','selfie','precheckConsent','consent'\]\)el\(id\)\.disabled=!mediaSubmissionEnabled/);
  assert.match(html,/el\('readiness'\)\.disabled=!authIsolationReady\|\|!user\|\|busy/);
  assert.match(html,/el\('status'\)\.disabled=!authIsolationReady\|\|!user\|\|busy/);
  assert.match(html,/el\('precheck'\)\.disabled=!authIsolationReady\|\|!mediaSubmissionEnabled/);
  assert.match(html,/el\('submit'\)\.disabled=!authIsolationReady\|\|!mediaSubmissionEnabled/);
});

test("No ID camera can start while uploads are held; local face research remains isolated",()=>{
  assert.match(camera,/if\(stage!=="selfie"\)return; \/\/ No government-ID camera capture/);
  assert.match(camera,/if\(stage!=="selfie"\)\{\s*card\.querySelector\("\.scan-open"\)\.disabled=true/);
  assert.match(camera,/ID capture paused/);
  assert.match(camera,/QA-ONLY preview/);
  assert.match(camera,/if\(stage==="selfie"\)/);
  assert.doesNotMatch(camera,/new DataTransfer/);
  assert.doesNotMatch(camera,/\$\((?:stage|["']front["']|["']back["']|["']selfie["'])\)\.files\s*=/);
  assert.doesNotMatch(camera,/dispatchEvent\(new Event\("change"/);
  assert.match(camera,/\$\(stage\)\.value="";\s*preview\(stage,blob\)/);
  assert.match(camera,/window\.addEventListener\("pagehide",\(\)=>\{stop\(\);for\(const stage of Object\.keys\(TYPES\)\)clear\(stage\)\}\)/);
  for(const unsafe of [/fetch\s*\(/,/XMLHttpRequest/,/navigator\.sendBeacon/,/localStorage/,/https:\/\/volunserve\.com/]){
    assert.doesNotMatch(camera,unsafe);
  }
});

test("No private POST can be triggered through the paused readiness path",()=>{
  assert.equal((html.match(/if\(!authIsolationReady\|\|!auth\|\|!mediaSubmissionEnabled\)/g)||[]).length,2);
  assert.match(html,/Government ID precheck and ID\/selfie submissions remain deliberately blocked/);
  const readiness=html.slice(html.indexOf("el('readiness').addEventListener"),
                             html.indexOf("el('status').addEventListener"));
  assert.match(readiness,/get\('\/api\/identity\/engine-health'\)/);
  assert.doesNotMatch(readiness,/form\.set\(/);
  assert.doesNotMatch(readiness,/method:'POST'/);
});
