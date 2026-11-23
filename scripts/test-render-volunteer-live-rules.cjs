"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=
  require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc}=require("firebase/firestore");

const PROJECT="demo-volunserve-live-render-rules";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.GCLOUD_PROJECT!==PROJECT||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("Refusing any non-emulator connection");

test("Only exact Render-invited approved Volunteer may read their own pending incident",async()=>{
  const env=await initializeTestEnvironment({
    projectId:PROJECT,
    firestore:{
      host:"127.0.0.1",port:8080,
      rules:fs.readFileSync("firestore.rules","utf8")
    }
  });
  try{
    const id="fictional_render_case_001",a="fictional_vol_a",b="fictional_vol_b";
    const origin="render_resident_created_all_volunteers";
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(const uid of [a,b]){
        await setDoc(doc(db,"users",uid),{
          role:"volunteer",status:"approved",activeMode:"volunteer",
          volunteerAccess:true,volunteerStatus:"approved",identityVerified:true
        });
      }
      await setDoc(doc(db,"users","fictional_resident"),{
        role:"resident",status:"approved",residentAccess:true,activeMode:"resident"
      });
      await setDoc(doc(db,"disasterCases",id),{
        reporterUid:"fictional_resident",status:"reported",
        verificationStatus:"pending_verification",
        assignedVolunteerIds:[],autoVolunteerDispatch:{origin,state:"waiting"}
      });
      await setDoc(doc(db,"responseAssignments",id+"_"+a),{
        caseId:id,volunteerId:a,offerMode:origin,status:"offered"
      });
    });
    const invited=env.authenticatedContext(a).firestore();
    const notInvited=env.authenticatedContext(b).firestore();
    const resident=env.authenticatedContext("fictional_resident").firestore();
    assert.equal((await assertSucceeds(getDoc(doc(invited,"disasterCases",id)))).exists(),true);
    await assertFails(getDoc(doc(notInvited,"disasterCases",id)));
    assert.equal((await assertSucceeds(getDoc(doc(resident,"disasterCases",id)))).exists(),true);
    await env.withSecurityRulesDisabled(async context=>{
      await setDoc(doc(context.firestore(),"responseAssignments",id+"_"+a),{
        caseId:id,volunteerId:a,offerMode:origin,status:"declined"
      });
    });
    await assertFails(getDoc(doc(invited,"disasterCases",id)));
  }finally{
    await env.cleanup();
  }
});
