"use strict";
/**
 * Fail closed BEFORE Expo's static web export if public staging environment
 * points to prod Firebase/Render or if app code directly embeds prod endpoints.
 *
 * This is static source defense-in-depth, not proof of authenticated E2E.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");

const expected={
  EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",
  EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-full-staging",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN:"volunserve-full-staging.firebaseapp.com",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET:"volunserve-full-staging.firebasestorage.app",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_MESSAGING_SENDER_ID:"429213950126",
  EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_APP_ID:"1:429213950126:web:955dbf575697826b674d3f",
  EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL:"https://volunserve-backend-staging.onrender.com",
};
for(const [key,value] of Object.entries(expected)){
 if(process.env[key]!==value)
   throw Error("STAGING BLOCKED: invalid or missing public Expo staging env "+key);
}
const apiKey=String(process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY||"");
assert(apiKey.length>=20 && apiKey!=="AIzaSyAPPi-UxUxyMvoNeaBLUOPOls63dEDLUmI",
       "STAGING BLOCKED: missing or production Firebase Web API key");
if(process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.includes("volunserve.onrender.com"))
 throw Error("STAGING BLOCKED: identity API references production.");
const forbiddenFirebase=[
 "volunserve-3aa5b.firebaseapp.com","volunserve-3aa5b.web.app",
];
for(const value of Object.values(expected)){
 if(forbiddenFirebase.some(host=>value.includes(host)))
   throw Error("STAGING BLOCKED: production Firebase target");
}

const checks=[
 ["app/(tabs)/donation.tsx","PAYMONGO_BACKEND_URL = getSafeVolunServeBackendBaseUrl()"],
 ["app/(tabs)/resident.tsx","ASSISTANCE_BACKEND_URL = getSafeVolunServeBackendBaseUrl()"],
 ["app/(admin)/assistance-requests.tsx","SECURE_ASSISTANCE_BACKEND = getSafeVolunServeBackendBaseUrl()"],
 ["app/(admin)/donation-list.tsx","SECURE_DONATION_BACKEND = getSafeVolunServeBackendBaseUrl()"],
 ["app/(admin)/donation-list.tsx","blockProductionEvidenceUploadDuringStaging();"],
 ["app/(tabs)/donation.tsx","blockExternalCheckoutDuringStaging();"],
 ["lib/identityVerification.ts","assertIdentityMediaSubmissionAllowed(body)"],
 ["backend/server.js","STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false"],
];
for(const [file,marker] of checks){
 const text=fs.readFileSync(file,"utf8");
 if(!text.includes(marker))
   throw Error("STAGING BLOCKED: "+file+" lacks required guard "+marker);
}

function collect(dir,files=[]){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())collect(full,files);
  else if(/\.(ts|tsx|js|jsx)$/.test(entry.name))files.push(full);
 }
 return files;
}
const issues=[];
const guardedProductionFallbacks=[
 "lib/stagingExpoServiceIsolation.ts",
 "lib/identityVerification.ts",
 "lib/identityEnvironmentTarget.ts",
];
const guardedMediaUploads=[
 "app/(admin)/donation-list.tsx",
 "app/(tabs)/my-cases.tsx",
 "components/DisasterResponse.native.tsx",
 "components/DisasterResponse.web.tsx",
];
for(const file of ["app","lib","components","constants"].flatMap(dir=>collect(dir))){
 const normalized=file.split(path.sep).join("/");
 const source=fs.readFileSync(file,"utf8");
 if(source.includes("https://volunserve.onrender.com") &&
    !guardedProductionFallbacks.includes(normalized)){
   issues.push(normalized+": direct production API host");
 }
 if(source.includes("api.cloudinary.com") &&
    (!guardedMediaUploads.includes(normalized) ||
     !source.includes("blockProductionEvidenceUploadDuringStaging();"))){
   issues.push(normalized+": unguarded direct Cloudinary upload");
 }
}
// An exception for documented, environment-guarded production fallback is
// NOT an exception to allowing production network calls in staging.
for(const file of guardedProductionFallbacks.slice(1)){
 const code=fs.readFileSync(file,"utf8");
 if(!code.includes("identityEnvironmentTarget(")){
   issues.push(file+": environment routing guard missing");
 }
}
for(const file of guardedMediaUploads){
 const code=fs.readFileSync(file,"utf8");
 if(!code.includes("blockProductionEvidenceUploadDuringStaging();")){
   issues.push(file+": staging Cloudinary guard missing");
 }
}
if(issues.length)throw Error("STAGING BLOCKED: "+issues.join(" | "));
console.log("STAGING PASS: Full-staging Firebase, identity API, assistance/donation routes, Cloudinary and checkout guards audited.");
console.log("IMPORTANT: This does not validate PAD/ID authenticity, authentication, read/write rules or live browser behavior.");

 
// Isolated STAGING static service ONLY: package the official SHA-pinned
// OpenCV SFace model into public/ before Expo exports the static assets.
// This guard is not executed in CI, other Render services, or production.
if(process.env.RENDER==="true" &&
   process.env.RENDER_SERVICE_ID==="srv-dbrfe0dbedkc73df01jg"){
 if(process.env.RENDER_GIT_BRANCH!=="preview/expo-resident-full-staging-web-20261113" ||
    process.env.RENDER_EXTERNAL_HOSTNAME!=="volunserve-expo-resident-full-staging.onrender.com" ||
    process.env.RENDER_GIT_REPO_SLUG!=="calibosofroyarjan-volunserve/VolunServe")
   throw Error("STAGING BLOCKED: SFace static build is outside isolated staging target");
 const {stagePinnedSFaceStaticAssets}=require("./stage-staging-sface-model.cjs");
 stagePinnedSFaceStaticAssets().catch((error)=>{
   const stage=error?.message==="pinned_sface_download_or_integrity_failed" ? "model_download" :
     error?.message==="official_sface_license_bundled_invalid" ? "license_invalid" : "asset_write";
   console.error("STAGING BLOCKED: public pinned SFace asset stage "+stage+" failed; previous deployment retained");
   process.exitCode=1;
 });
}
