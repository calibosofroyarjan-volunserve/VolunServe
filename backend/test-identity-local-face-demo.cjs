"use strict";
/** No real faces, images, webcam, biometric logs, network or credentials. */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const web=fs.readFileSync("app/identity-face-demo.web.tsx","utf8");
const native=fs.readFileSync("app/identity-face-demo.tsx","utf8");
const identity=fs.readFileSync("backend/server.js","utf8");

test("safe demo is isolated to full-staging Firebase and requires signed-in consent",()=>{
  assert.match(web,/identityEnvironmentTarget\(/);
  assert.match(web,/projectId: auth\.app\.options\.projectId/);
  assert.match(web,/=== "staging"/);
  assert.match(web,/onAuthStateChanged\(auth, user => setSignedIn/);
  assert.match(web,/!allowed \|\| !signedIn \|\| !consented/);
  assert.match(web,/I consent to local webcam analysis/);
  assert.match(web,/!window\.isSecureContext/);
});

test("face detection stays in the browser without photo uploads or granted identity",()=>{
  assert.match(web,/FaceDetector\.createFromOptions/);
  assert.match(web,/detectForVideo\(videoRef\.current, now\)/);
  assert.match(web,/waitForCameraPreview\(video, stream\)/);
  assert.match(web,/modelAssetPath: MODEL_URL/);
  for(const forbidden of [
    "submitIdentityVerification(", "precheckIdentityDocument(", "FormData(",
    "fetch(", "XMLHttpRequest", "MediaRecorder", "toBlob(", "toDataURL(",
    "firebase/firestore", "identityVerified: true", "uploadBytes(",
    "cosineSimilarity", "livenessVerified: true", "getIdToken(",
  ]) {
    assert(!web.includes(forbidden),"Demo must not contain: "+forbidden);
  }
  assert.match(web,/does not recognize your/);
  assert.match(web,/No webcam image, biometric template/);
  assert.match(web,/does not recognize your\s+identity/i);
  assert.match(identity,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;/);
});

test("camera release and stale startup protection exist in demo",()=>{
  assert.match(web,/sessionRef\.current \+= 1/);
  assert.match(web,/streamRef\.current\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(web,/detectorRef\.current\?\.close\(\)/);
  assert.match(web,/cancelAnimationFrame\(frameRef\.current\)/);
  assert.match(web,/if \(session !== sessionRef\.current\)/);
  assert.match(web,/onPress=\{stop\}/);
});

test("native fallback never opens camera or identity verification",()=>{
  assert.match(native,/only in the[\s\S]*staging web build/);
  assert(!native.includes("CameraView"));
  assert(!native.includes("launchCameraAsync"));
  assert(!native.includes("fetch("));
});
