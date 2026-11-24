"use strict";
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,runTransaction,serverTimestamp,getDoc}=require("firebase/firestore");
(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator required");
 const env=await initializeTestEnvironment({projectId:"demo-volunserve",firestore:{rules:fs.readFileSync("firestore.rules","utf8")}});
 const uid="volunteer-test",eventId="event-test",adminId="admin-test";
 const ep="communityEvents/"+eventId,pp="communityEventParticipants/"+eventId+"_"+uid;
 try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await setDoc(doc(db,"users/"+uid),{role:"resident",status:"approved",email:"volunteer@gmail.com",activeMode:"volunteer",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved"});
 await setDoc(doc(db,"users/"+adminId),{role:"admin",status:"approved",email:"admin@gmail.com"});
 await setDoc(doc(db,ep),{status:"active",publicationStatus:"published",proposedBy:"other",capacity:20,participantsCount:0,coordinates:{latitude:14.81,longitude:121.04}});
 });
 const v=env.authenticatedContext(uid,{email:"volunteer@gmail.com",email_verified:true}).firestore();
 const a=env.authenticatedContext(adminId,{email:"admin@gmail.com",email_verified:true}).firestore();
 const p=doc(v,pp),e=doc(v,ep),stamp=serverTimestamp;
 await assertSucceeds(runTransaction(v,async tx=>{
 const es=await tx.get(e),ps=await tx.get(p);if(ps.exists())throw Error("fixture already exists");
 tx.set(p,{eventId,uid,fullName:"Example Volunteer",status:"joined",joinedAt:stamp(),declinedAt:null,checkedInAt:null,checkedOutAt:null,attendanceVerified:false,attendanceVerifiedAt:null,updatedAt:stamp()});
 tx.update(e,{participantsCount:es.data().participantsCount+1,updatedAt:stamp()});
 }));
 console.log("PASS existing RSVP");
 await assertFails(updateDoc(p,{checkedInAt:stamp(),updatedAt:stamp()}));
 await assertFails(updateDoc(p,{checkedInAt:stamp(),checkInGeofence:{distanceMeters:0},updatedAt:stamp()}));
 console.log("PASS direct Time In and forged evidence denied");
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),pp),{checkedInAt:stamp(),checkInGeofence:{radiusMeters:100,distanceMeters:10,accuracyMeters:5},updatedAt:stamp()}));
 await assertFails(updateDoc(p,{checkedOutAt:stamp(),updatedAt:stamp()}));
 await assertFails(updateDoc(p,{checkedOutAt:stamp(),checkOutGeofence:{distanceMeters:0},updatedAt:stamp()}));
 console.log("PASS direct Time Out and forged evidence denied");
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),pp),{checkedOutAt:stamp(),checkOutGeofence:{radiusMeters:100,distanceMeters:10,accuracyMeters:5},updatedAt:stamp()}));
 await assertFails(updateDoc(p,{attendanceVerified:true,attendanceVerifiedAt:stamp(),attendanceVerifiedBy:uid,updatedAt:stamp()}));
 await assertSucceeds(updateDoc(doc(a,pp),{attendanceVerified:true,attendanceVerifiedAt:stamp(),attendanceVerifiedBy:adminId,updatedAt:stamp()}));
 await assertSucceeds(getDoc(p));
 console.log("PASS Admin verification and volunteer history retained");
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
