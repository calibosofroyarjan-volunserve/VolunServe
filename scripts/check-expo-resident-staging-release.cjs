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
for(const file of ["app","lib","components","constants"].flatMap(dir=>collect(dir))){
 const normalized=file.split(path.sep).join("/");
 const source=fs.readFileSync(file,"utf8");
 // Production fallback is allowed ONLY in the central guarded helper or the
 // legacy identity client, whose environment target is separately checked.
 if(source.includes("https://volunserve.onrender.com") &&
    !["lib/stagingExpoServiceIsolation.ts","lib/identityVerification.ts"].includes(normalized)){
   issues.push(normalized+": direct production API host");
 }
 if(source.includes("api.cloudinary.com") &&
    normalized!=="app/(admin)/donation-list.tsx"){
   issues.push(normalized+": unreviewed direct Cloudinary endpoint");
 }
}
if(issues.length)throw Error("STAGING BLOCKED: "+issues.join(" | "));
console.log("STAGING PASS: Full-staging Firebase, identity API, assistance/donation routes, Cloudinary and checkout guards audited.");
console.log("IMPORTANT: This does not validate PAD/ID authenticity, authentication, read/write rules or live browser behavior.");
