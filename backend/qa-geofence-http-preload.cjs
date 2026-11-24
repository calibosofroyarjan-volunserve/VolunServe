"use strict";
const {initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"") ||
 !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||"") ||
 process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
 throw Error("QA requires local Auth and Firestore emulators and no service credentials");
const app=initializeApp({projectId:"demo-volunserve"});
const firebasePath=require.resolve("./firebaseAdmin");
require.cache[firebasePath]={id:firebasePath,filename:firebasePath,loaded:true,exports:{app,auth:getAuth(app),db:getFirestore(app),FieldValue}};
// Prevent unrelated background tasks; all geofence routes and authentication remain real.
const syncPath=require.resolve("./communityCertificateAutoSync");
require.cache[syncPath]={id:syncPath,filename:syncPath,loaded:true,exports:{startCommunityCertificateAutoSync:()=>({stop(){}})}};
const evidencePath=require.resolve("./identityPrivateEvidence");
const evidence=require(evidencePath);
evidence.purgeExpiredIdentityEvidence=async()=>{};
