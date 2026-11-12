"use strict";
const fs=require("node:fs");
const html=fs.readFileSync("identity-staging-web/index.html","utf8");
for(const required of ["volunserve-full-staging","volunserve-backend-staging.onrender.com","/api/identity/engine-health","idBackDocument","signInWithEmailAndPassword"]){
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
if(!html.includes("warmingErrors=new Set")||!html.includes("attempts=4")||!html.includes("e.httpStatus===503")||!html.includes("setTimeout(resolve")||!html.includes("No identity attempt was used")){
 throw Error("Cold start readiness retry must be bounded to transient HTTP 503 with no identity attempts");
}
if((html.match(/fetch\(backend\+'\/api\/identity\/verify'/g)||[]).length!==1){
 throw Error("Verification POST must never be replayed by a readiness retry");
}
for(const required of [
 'id="precheck"', 'id="precheckConsent"', 'id="precheckResult"',
 '/api/identity/document/precheck', 'X-VolunServe-Document-Precheck-Consent',
 'No selfie, biometrics, DOB, user name or profile fields in this request',
 'documentOcrReady:d.documentOcrReady===true',
 'profileComparisonReady:d.profileComparisonReady===true',
 'birthdayVsSavedProfile:screening.profileBirthDateCheck',
 'barangayVsSavedProfile:screening.profileAddressCheck',
]){
 if(!html.includes(required))throw Error("Missing no-selfie staging OCR precheck safeguard: "+required);
}
const precheckOnly=html.slice(html.indexOf("el('precheck').addEventListener"),html.indexOf("el('verify').addEventListener"));
if(precheckOnly.includes("form.set('selfie'")||precheckOnly.includes("form.append('selfie'"))throw Error("Precheck must never upload selfie media");
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
// Camera/PAD field observations are manual, local-only, and NEVER certificate of liveness.
for(const qaPath of ["identity-staging-web/pad-qa.js","identity-staging-web/pad-qa-report.mjs","identity-staging-web/test-pad-qa-report.mjs"]){
 if(!fs.existsSync(qaPath))throw Error("Missing staging face QA file: "+qaPath);
}
if(!html.includes('<script type="module" src="./pad-qa.js"></script>'))throw Error("Staging pad QA report is not loaded.");
const padQa=fs.readFileSync("identity-staging-web/pad-qa.js","utf8");
if(!padQa.includes('location.hostname!=="volunserve-identity-test-staging.onrender.com"'))throw Error("Staging QA host restriction missing");
for(const sensitive of ["fetch(", "XMLHttpRequest", "navigator.sendBeacon", "localStorage", "sessionStorage",
  "https://volunserve.onrender.com", "https://volunserve.com", "volunserve-3aa5b"]){
 if(padQa.includes(sensitive))throw Error("Potential PII/transmission or production link in local QA: "+sensitive);
}
checkInlineModule(process.execPath,["--check","--input-type=module"],{input:padQa,stdio:["pipe","inherit","inherit"]});
execFileSync(process.execPath,["--test","identity-staging-web/test-pad-qa-report.mjs"],{stdio:"inherit"});
// Similarity observations are manual. Scores must NEVER be stored, networked,
// used to modify production thresholds or interpreted as PAD certification.
for (const qaPath of ["identity-staging-web/match-pad-metrics.mjs",
                      "identity-staging-web/match-pad-qa.js",
                      "identity-staging-web/test-match-pad-metrics.mjs"]) {
 if (!fs.existsSync(qaPath)) throw Error("Missing local-only similarity QA: "+qaPath);
}
if (!html.includes('<script type="module" src="./match-pad-qa.js"></script>')) {
 throw Error("Similarity and challenge calculator missing from staging lab");
}
const matchPadQa=fs.readFileSync("identity-staging-web/match-pad-qa.js","utf8");
const scoreMetrics=fs.readFileSync("identity-staging-web/match-pad-metrics.mjs","utf8");
if (!matchPadQa.includes('location.hostname!=="volunserve-identity-test-staging.onrender.com"')) {
 throw Error("Face-match QA is not restricted to isolated test website");
}
for (const [name,contents] of [["face match form",matchPadQa],["score metrics",scoreMetrics]]) {
 for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon(", "localStorage",
  "sessionStorage", "IndexedDB", "https://volunserve.com", "https://volunserve.onrender.com",
  "volunserve-3aa5b", "firebase"]) {
  if (contents.includes(forbidden)) throw Error("Potential production access or data persistence in "+name+": "+forbidden);
 }
}
checkInlineModule(process.execPath,["--check","--input-type=module"],{
  input:matchPadQa,stdio:["pipe","inherit","inherit"]
});
execFileSync(process.execPath,["--test","identity-staging-web/test-match-pad-metrics.mjs"],{stdio:"inherit"});
// Firebase login is now configured for the exact dedicated full-staging
// Web App, but biometrics stay blocked until separate authenticated QA signoff.
for(const bad of ["volunserve-auth-staging","916160317396","volunserve-3aa5b"]){
  if(html.includes(bad))throw Error("Legacy or production Firebase config leaked into staging lab: "+bad);
}
if(!html.includes("const mediaSubmissionEnabled=false;") ||
   !html.includes("if(!authIsolationReady||!auth||!mediaSubmissionEnabled)")) {
  throw Error("No ID/selfie-upload unlock allowed with an untested staging account");
}
if (!html.includes("const authIsolationReady=location.hostname==='volunserve-identity-test-staging.onrender.com'") ||
    !html.includes("&&config.projectId==='volunserve-full-staging'") ||
    !html.includes("const auth=authIsolationReady?getAuth(initializeApp(config)):null")) {
  throw Error("Identity staging lab may be using obsolete Firebase authentication.");
}
execFileSync(process.execPath,["--test","identity-staging-web/test-auth-isolation-gate.cjs"],{stdio:"inherit"});
console.log("Staging-only camera and identity integration checks passed.");
