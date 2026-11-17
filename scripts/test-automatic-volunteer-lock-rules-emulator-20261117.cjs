#!/usr/bin/env node
"use strict";
/**
 * Firebase Rules runtime checks for draft automatic Volunteer lock hardening.
 * Runs only against demo Firestore Emulator; no live project/credentials.
 */
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {initializeTestEnvironment,assertFails,assertSucceeds}=
  require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,deleteDoc,getDoc,runTransaction,Timestamp,serverTimestamp}=
  require("firebase/firestore");

async function main(){
  if(!process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.GCLOUD_PROJECT?.startsWith("volunserve-") ||
      process.env.GOOGLE_CLOUD_PROJECT?.startsWith("volunserve-"))
    throw Error("BLOCKED: only isolated demo Firestore Emulator allowed");
  const projectId="demo-volunserve-auto-volunteer-lock-review";
  const env=await initializeTestEnvironment({
    projectId,firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
  });
  let checks=0;
  const succeeds=async(p,label)=>{try{await assertSucceeds(p);checks++;}catch(e){throw Error(label+": "+e.message)}};
  const fails=async(p,label)=>{try{await assertFails(p);checks++;}catch(e){throw Error(label+": "+e.message)}};
  try{
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      for(const [uid,role,mode] of [
        ["vol-a","volunteer","volunteer"],
        ["vol-b","volunteer","volunteer"],
        ["resident","resident","resident"],
        ["admin","admin","admin"]
      ]){
        await setDoc(doc(db,"users",uid),{
          uid,role,activeMode:mode,status:"approved",adminStatus:"active",
          email:uid+"@example.com",identityVerified:true,
          volunteerAccess:role==="volunteer",
          volunteerStatus:role==="volunteer"?"approved":"none",
          residentAccess:role==="resident",
        });
      }
      for(const caseId of ["case-auto-one","case-auto-two","case-legacy"]){
        await setDoc(doc(db,"disasterCases",caseId),{
          reporterUid:"resident",status:"validated",title:"Fictional staging QA only"
        });
      }
      for(const [id,caseId,owner,creator] of [
        ["auto-one","case-auto-one","vol-a","automatic_matching_engine"],
        ["auto-two","case-auto-two","vol-a","automatic_matching_engine"],
        ["legacy","case-legacy","vol-b","admin"]
      ]){
        await setDoc(doc(db,"responseAssignments",id),{
          caseId,volunteerId:owner,volunteerName:owner,caseTitle:"Fictional test",
          status:"offered",createdBy:creator,createdAt:Timestamp.now(),
          updatedAt:Timestamp.now()
        });
      }
    });
    const user=uid=>env.authenticatedContext(uid,{
      email:uid+"@example.com",email_verified:true
    }).firestore();
    const a=user("vol-a"),b=user("vol-b"),r=user("resident");
    const autoOne=doc(a,"responseAssignments","auto-one");
    const lockA=doc(a,"responderLocks","vol-a");
    await fails(updateDoc(autoOne,{status:"accepted",updatedAt:serverTimestamp()}),
      "automatic Volunteer cannot accept without responder lock");
    await fails(updateDoc(doc(r,"responseAssignments","auto-one"),{
      status:"accepted",updatedAt:serverTimestamp()
    }),"Resident cannot take Volunteer task");
    await succeeds(runTransaction(a,async tx=>{
      const assignment=await tx.get(autoOne),existing=await tx.get(lockA);
      assert.equal(assignment.data().status,"offered");
      assert.equal(existing.exists(),false);
      tx.update(autoOne,{status:"accepted",updatedAt:serverTimestamp()});
      tx.set(lockA,{responderUid:"vol-a",assignmentId:"auto-one",
        caseId:"case-auto-one",status:"accepted",updatedAt:serverTimestamp()});
    }),"correct automatic acceptance and lock must commit atomically");
    await succeeds(getDoc(lockA),"owner can view responder lock");
    await fails(getDoc(doc(b,"responderLocks","vol-a")),"other Volunteer cannot read lock");
    await fails(deleteDoc(lockA),"cannot delete active lock before completion");
    await fails(runTransaction(a,async tx=>{
      const next=doc(a,"responseAssignments","auto-two");
      await tx.get(next);await tx.get(lockA);
      tx.update(next,{status:"accepted",updatedAt:serverTimestamp()});
      tx.set(lockA,{responderUid:"vol-a",assignmentId:"auto-two",
        caseId:"case-auto-two",status:"accepted",updatedAt:serverTimestamp()});
    }),"same Volunteer cannot claim second auto assignment");
    await succeeds(updateDoc(doc(b,"responseAssignments","legacy"),{
      status:"accepted",updatedAt:serverTimestamp()
    }),"legacy manual offer without lock stays compatible");
    await fails(updateDoc(doc(b,"responseAssignments","auto-one"),{
      status:"accepted",updatedAt:serverTimestamp()
    }),"other Volunteer cannot change someone else's task");
    // Verify actual allowed lock-release condition when task is marked completed
    // in the same transaction, preserving the existing field-report payload.
    const terminal={
      contributionType:"First aid",
      contributionSummary:"Assisted the fictional test resident safely.",
      peopleHelped:1,
      completionNotes:"Fictional staging exercise",
      completedAt:serverTimestamp(),
      residentConfirmationStatus:"pending",
      updatedAt:serverTimestamp(),status:"completed"
    };
    for(const [from,to,key] of [
      ["accepted","responding","responseStartedAt"],
      ["responding","on_site","arrivedAt"]
    ]){
      await succeeds(runTransaction(a,async tx=>{
        const [assignment,lock]=await Promise.all([tx.get(autoOne),tx.get(lockA)]);
        assert.equal(assignment.data().status,from);
        assert.equal(lock.data().status,from);
        tx.update(autoOne,{status:to,updatedAt:serverTimestamp(),
          [key]:serverTimestamp()});
        tx.update(lockA,{status:to,updatedAt:serverTimestamp()});
      }),"authorized "+from+" → "+to+" transaction");
    }
    await succeeds(runTransaction(a,async tx=>{
      const [assignment,lock]=await Promise.all([tx.get(autoOne),tx.get(lockA)]);
      assert.equal(assignment.data().status,"on_site");
      assert.equal(lock.data().status,"on_site");
      tx.update(autoOne,terminal);
      tx.delete(lockA);
    }),"same-transaction completion releases matching lock");
    await fails(updateDoc(autoOne,{status:"offered",updatedAt:serverTimestamp()}),
      "Volunteer cannot roll back completed task");
    assert.ok(checks>=11);
    console.log("PASS: "+checks+" authenticated Firestore Emulator assertions: automatic locking, double-assignment denial, foreign-account denial, legacy compatibility, lifecycle and safe release.");
  }finally{await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
