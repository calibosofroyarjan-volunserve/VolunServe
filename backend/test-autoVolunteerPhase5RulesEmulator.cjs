"use strict";
/**
 * FIRESTORE RULES Emulator ONLY: client SDK verifies that a Volunteer/Admin
 * cannot directly accept server-managed automatic offers, while existing
 * manual offers and selected post-accept lifecycle remain possible.
 *
 * Must run in demo project; never production credentials or production rules.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}
  =require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,runTransaction,serverTimestamp}
  =require("firebase/firestore");
const PROJECT="demo-volunserve-auto-phase4";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
   process.env.GCLOUD_PROJECT!==PROJECT ||
   (process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("LOCAL FIRESTORE RULES EMULATOR ONLY");
let env;
async function init(){
  env=await initializeTestEnvironment({
    projectId:PROJECT,
    firestore:{host:"127.0.0.1",port:8080,
      rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")}
  });
}
const userProfile=uid=>({
  uid,role:"volunteer",status:"approved",activeMode:"volunteer",
  volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
  residentAccess:true,barangay:"Bagong Buhay I"
});
async function seed(name,{status="offered",automatic=false,selected=true}={}){
 const caseId="phase5_rules_"+name,uid="rule_user_"+name,aid=caseId+"_"+uid;
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await Promise.all([
    setDoc(doc(db,"users",uid),userProfile(uid)),
    setDoc(doc(db,"disasterCases",caseId),{
      id:caseId,status:"assigned",verificationStatus:"validated",
      reporterUid:"fictional_reporter",
      activeVolunteerSupportUid:selected?uid:"other_volunteer",
      activeVolunteerSupportAssignmentId:selected?aid:"other_assignment",
      ...(automatic?{autoVolunteerAcceptedAssignmentId:
        selected?aid:"other_assignment"}:{})
    }),
    setDoc(doc(db,"responseAssignments",aid),{
      caseId,volunteerId:uid,status,
      volunteerName:"FICTIONAL QA ONLY",caseTitle:"Fictional report",
      createdAt:new Date(),updatedAt:new Date(),
      ...(automatic?{offerMode:"automatic_wave_proposed"}:{})
    })
  ]);
 });
 return {caseId,uid,aid};
}
test.before(init);
test("manual legacy Volunteer client can accept a normal offered assignment",async()=>{
 const {uid,aid}=await seed("manual_accept");
 const context=env.authenticatedContext(uid);
 await assertSucceeds(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"accepted",updatedAt:serverTimestamp()
 }));
});
test("automatic offered assignment blocks direct Volunteer client ACCEPT",async()=>{
 const {uid,aid}=await seed("auto_client_accept",{automatic:true});
 const context=env.authenticatedContext(uid);
 await assertFails(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"accepted",updatedAt:serverTimestamp()
 }));
});
test("automatic offered assignment blocks direct Volunteer client DECLINE",async()=>{
 const {uid,aid}=await seed("auto_client_decline",{automatic:true});
 const context=env.authenticatedContext(uid);
 await assertFails(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"declined",updatedAt:serverTimestamp()
 }));
});
test("selected, already-accepted automatic Volunteer can start response",async()=>{
 const {uid,aid}=await seed("auto_start",{automatic:true,status:"accepted"});
 const context=env.authenticatedContext(uid);
 await assertSucceeds(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"responding",responseStartedAt:serverTimestamp(),
   updatedAt:serverTimestamp()
 }));
});
test("non-winning automatic Volunteer cannot start a response even if status says accepted",async()=>{
 const {uid,aid}=await seed("auto_wrong_winner",{
   automatic:true,status:"accepted",selected:false
 });
 const context=env.authenticatedContext(uid);
 await assertFails(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"responding",responseStartedAt:serverTimestamp(),
   updatedAt:serverTimestamp()
 }));
});
test("legacy Admin cannot forge an automatic accepted status but can cancel an automatic offer",async()=>{
 const {aid}=await seed("admin_auto_change",{automatic:true});
 const admin="phase5_rules_admin";
 await env.withSecurityRulesDisabled(async context=>{
   await setDoc(doc(context.firestore(),"users",admin),{
     uid:admin,role:"admin",status:"approved",adminStatus:"active"
   });
 });
 const context=env.authenticatedContext(admin);
 await assertFails(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"accepted",updatedAt:serverTimestamp()
 }));
 await assertSucceeds(updateDoc(doc(context.firestore(),"responseAssignments",aid),{
   status:"cancelled",updatedAt:serverTimestamp()
 }));
});

test("outdated Admin client cannot overwrite the case pointer of an accepted automatic Volunteer",async()=>{
 const {caseId,aid}=await seed("admin_winner_protection",{
   automatic:true,status:"accepted",selected:true
 });
 const admin="phase5_rules_admin_pointer";
 await env.withSecurityRulesDisabled(async context=>{
   await setDoc(doc(context.firestore(),"users",admin),{
     uid:admin,role:"admin",status:"approved",adminStatus:"active"
   });
 });
 const context=env.authenticatedContext(admin);
 const ref=doc(context.firestore(),"disasterCases",caseId);
 await assertFails(updateDoc(ref,{
   activeVolunteerSupportAssignmentId:"other_manual_offer",
   activeVolunteerSupportUid:"other_manual_user",
   updatedAt:serverTimestamp()
 }));
 // The *old* case pointer cannot be hijacked after a successful auto accept.
 await assertSucceeds(updateDoc(ref,{adminNote:"Unrelated review note",
   updatedAt:serverTimestamp()}));
 assert.equal(typeof aid,"string");
});
test("outdated Admin client cannot forge auto winner marker on a manual case",async()=>{
 const {caseId,aid}=await seed("forged_auto_winner",{
   automatic:false,status:"offered",selected:true
 });
 const admin="phase5_rules_admin_forge";
 await env.withSecurityRulesDisabled(async context=>{
   await setDoc(doc(context.firestore(),"users",admin),{
     uid:admin,role:"admin",status:"approved",adminStatus:"active"
   });
 });
 const context=env.authenticatedContext(admin);
 await assertFails(updateDoc(doc(context.firestore(),"disasterCases",caseId),{
   autoVolunteerAcceptedAssignmentId:aid,
   updatedAt:serverTimestamp()
 }));
});
test("atomic Admin cancellation clears only its matching accepted automatic winner",async()=>{
 const {caseId,aid}=await seed("auto_cancel",{
   automatic:true,status:"accepted",selected:true
 });
 const admin="phase5_rules_admin_cancel";
 await env.withSecurityRulesDisabled(async context=>{
   await setDoc(doc(context.firestore(),"users",admin),{
     uid:admin,role:"admin",status:"approved",adminStatus:"active"
   });
 });
 const context=env.authenticatedContext(admin);
 const db=context.firestore();
 await assertSucceeds(runTransaction(db,async tx=>{
   const assignment=doc(db,"responseAssignments",aid);
   const incident=doc(db,"disasterCases",caseId);
   const [assignmentDoc,incidentDoc]=await Promise.all([
     tx.get(assignment),tx.get(incident)
   ]);
   assert.equal(assignmentDoc.exists(),true);
   assert.equal(incidentDoc.exists(),true);
   tx.update(assignment,{status:"cancelled",updatedAt:serverTimestamp()});
   tx.update(incident,{
     autoVolunteerAcceptedAssignmentId:"",
     activeVolunteerSupportAssignmentId:"",
     activeVolunteerSupportUid:"",
     updatedAt:serverTimestamp()
   });
 }));
});

test.after(async()=>{if(env)await env.cleanup()});
