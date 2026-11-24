"use strict";
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const path=require("node:path");
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!/^127\.0\.0\.1:\d+$/.test(authHost||"")||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"")||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_SERVICE_ACCOUNT_JSON)throw Error("Local emulators only");
const app=initializeApp({projectId:"demo-volunserve"});
const auth=getAuth(app),db=getFirestore(app),port=18081;
const endpoint="http://127.0.0.1:"+port+"/api/community-events/attendance/record";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let child;
 try{
 const suffix=Date.now(),uid="http-volunteer-"+suffix,otherUid="http-other-"+suffix,eventId="http-event-"+suffix;
 const password="QA-only-password-2026";
 const create=async(uid,email,verified)=>{
 await auth.createUser({uid,email,password,emailVerified:verified});
 await db.collection("users").doc(uid).set({role:"resident",status:"approved",email,fullName:"QA Volunteer",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"});
 const res=await fetch("http://"+authHost+"/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})});
 const body=await res.json();assert.ok(res.ok,JSON.stringify(body.error||{}));return body.idToken;
 };
 const token=await create(uid,"http-volunteer-"+suffix+"@gmail.com",true);
 const other=await create(otherUid,"http-other-"+suffix+"@gmail.com",true);
 const unverified=await create("http-unverified-"+suffix,"http-unverified-"+suffix+"@gmail.com",false);
 const ref=db.collection("communityEventParticipants").doc(eventId+"_"+uid);
 await db.collection("communityEvents").doc(eventId).set({publicationStatus:"published",status:"active",proposedBy:"other",coordinates:{latitude:14.81,longitude:121.04}});
 await ref.set({uid,eventId,status:"joined",checkedInAt:null,checkedOutAt:null,attendanceVerified:false,joinedAt:FieldValue.serverTimestamp()});
 child=spawn(process.execPath,["--require",path.join(__dirname,"qa-geofence-http-preload.cjs"),path.join(__dirname,"server.js")],{env:{...process.env,PORT:String(port)},stdio:["ignore","inherit","inherit"]});
 let ready=false;
 for(let i=0;i<80;i++){try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(r.status===401){ready=true;break}}catch{}await sleep(250);}
 assert.ok(ready,"actual backend route not ready");
 const call=async(t,action,lat=14.81,extra={})=>{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({eventId,action,location:{latitude:lat,longitude:121.04,accuracy:10,timestamp:Date.now()},...extra})});return {status:r.status,body:await r.json()}};
 assert.equal((await call(null,"check-in")).status,401);
 assert.equal((await call("invalid","check-in")).status,401);
 assert.equal((await call(unverified,"check-in")).status,403);
 assert.equal((await call(other,"check-in",14.81,{uid})).status,404);
 assert.equal((await call(token,"check-in",14.812)).status,403);
 assert.equal((await ref.get()).data().checkedInAt,null);
 assert.equal((await call(token,"check-in")).status,200);
 assert.ok((await ref.get()).data().checkedInAt.toMillis()>0);
 assert.equal((await call(token,"check-in")).status,409);
 assert.equal((await call(token,"check-out",14.812)).status,403);
 assert.equal((await ref.get()).data().checkedOutAt,null);
 assert.equal((await call(token,"check-out")).status,200);
 assert.ok((await ref.get()).data().checkedOutAt.toMillis()>0);
 assert.equal((await call(token,"check-out")).status,409);
 console.log("PASS actual Render Express route + real synthetic Firebase Auth tokens + Firestore emulator; anonymous, invalid, unverified, wrong owner, outside radius and duplicate requests denied.");
 }finally{if(child)child.kill();await db.terminate();await deleteApp(app);}
})().catch(e=>{console.error(e);process.exitCode=1});
