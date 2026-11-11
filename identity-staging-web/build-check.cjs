"use strict";
const fs=require("node:fs");
const html=fs.readFileSync("identity-staging-web/index.html","utf8");
for(const required of ["volunserve-auth-staging","volunserve-backend-staging.onrender.com","/api/identity/engine-health","idBackDocument","signInWithEmailAndPassword"]){
 if(!html.includes(required))throw Error("Missing staging integration: "+required);
}
for(const id of ['national_id','drivers_license','passport','umid','prc_id']){
 if(!html.includes('<option value="'+id+'">'))throw Error("Missing explicit government ID choice: "+id);
}
if(html.includes('<option value="other_government_id">')||html.includes('<option value="school_id">')){
 throw Error("Unsupported generic or school ID found in selected ID choices");
}
const choices=[...html.matchAll(/<option value="(national_id|drivers_license|passport|umid|prc_id)">/g)];
if(choices.length!==5)throw Error("Only five government ID options are allowed in staging");
if(!html.includes("camera may capture any card-shaped object"))throw Error("Must explain capture is not verification");
for(const forbidden of ["https://volunserve.onrender.com","volunserve-3aa5b","https://volunserve-identity-ai.onrender.com","https://volunserve.com"]){
 if(html.includes(forbidden))throw Error("Production endpoint in staging page: "+forbidden);
}
for(const f of ["identity-staging-web/camera.js","identity-staging-web/camera-metrics.mjs","identity-staging-web/face-challenge.mjs","identity-staging-web/camera-device.mjs","identity-staging-web/device-qa.js","identity-staging-web/device-quality.mjs","identity-staging-web/screening-result.mjs"]){
 if(!fs.existsSync(f))throw Error("Missing live camera module: "+f);
}
if(!html.includes('<script type="module" src="./camera.js"></script>'))throw Error("Staging camera module not loaded.");
if(!html.includes('<script type="module" src="./device-qa.js"></script>'))throw Error("Camera device QA not loaded.");
if(!html.includes('https://everify.gov.ph/check'))throw Error("Official PSA QR check guidance is missing.");
if(!html.includes("showDocumentVerdict(b)")||!html.includes("idVerdict"))throw Error("Server OCR rejection banner missing");
if(!html.includes('id="resetPassword"')||!html.includes("sendPasswordResetEmail(auth,email)")||!html.includes("auth/invalid-credential"))throw Error("Staging Firebase password recovery/error messaging missing");
if(!html.includes("auth.currentUser")||!html.includes("if(busy||auth.currentUser)return;"))throw Error("Password reset must be interactive and staging-only");
const inlineModule=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
if(!inlineModule)throw Error("Missing staging sign-in module");
const {execFileSync:checkInlineModule}=require("node:child_process");
checkInlineModule(process.execPath,["--check","--input-type=module"],{input:inlineModule,stdio:["pipe","inherit","inherit"]});
const camera=fs.readFileSync("identity-staging-web/camera.js","utf8");
if(/scanCapture|scanAuto|Capture now/.test(camera))throw Error("Manual shutter must be absent from staging camera");
for(const key of ["getUserMedia","detectForVideo","capture","showModal","MediaPipe".toLowerCase(),"FaceLandmarker","advanceChallenge","cameraErrorMessage","sourceSelect","assessDocumentFrame","mode===\"selfie\"?9:13"]){
 if(!camera.toLowerCase().includes(key.toLowerCase()))throw Error("Camera path missing: "+key);
}
for(const forbidden of ["https://volunserve.onrender.com","volunserve-3aa5b","https://volunserve-identity-ai.onrender.com","https://volunserve.com"]){
 if(camera.includes(forbidden))throw Error("Production connection found in camera module: "+forbidden);
}
const {execFileSync}=require("node:child_process");
execFileSync(process.execPath,["--check","--input-type=module"],{input:camera,stdio:["pipe","inherit","inherit"]});
const qa=fs.readFileSync("identity-staging-web/device-qa.js","utf8");
execFileSync(process.execPath,["--check","--input-type=module"],{input:qa,stdio:["pipe","inherit","inherit"]});
for(const forbidden of ["volunserve-3aa5b","https://volunserve.onrender.com","navigator.sendBeacon","https://volunserve.com"]){
 if(qa.includes(forbidden))throw Error("Unsafe camera QA reference: "+forbidden);
}
execFileSync(process.execPath,["--test","identity-staging-web/test-camera-metrics.mjs","identity-staging-web/test-device-quality.mjs","identity-staging-web/test-face-challenge.mjs","identity-staging-web/test-camera-device.mjs","identity-staging-web/test-screening-result.mjs"],{stdio:"inherit"});
// Certificate testing is a separate staging-only portal. Preserve identity tests.
execFileSync(process.execPath,["identity-staging-web/test-certificate-portal.cjs"],{stdio:"inherit"});
console.log("Staging-only camera and identity integration checks passed.");
