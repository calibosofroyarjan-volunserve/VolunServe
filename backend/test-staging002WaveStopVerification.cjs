"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {verifyStaging002WaveStop}=require("./staging002WaveStopVerification");
const {advanceBatchWave}=require("./stagingBulkWaveAdvance");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const ID=E2E_CASE_ID;
const now=Date.UTC(2026,10,19,5,15,0);
function fixture({accepted=true,lock=true,later=false,pendingExpired=true}={}){
 const docs=new Map(),created=[];
 const put=(col,id,data)=>docs.set(col+"/"+id,data);
 put("disasterCases",ID,{title:E2E_CASE_TITLE,testOnly:true,
   testCategory:"staging_synthetic_volunteer_e2e_002",
   source:"staging_synthetic_e2e",reporterUid:"testResident002",
   status:"assigned",verificationStatus:"validated",dispatchBlocked:false});
 put("emergencyAutoDispatchBatches",ID,{status:"waiting",testOnly:true,
   origin:"staging_bulk_all_eligible_002",wave:1,volunteerCount:3});
 for(let n=1;n<=3;n++){
   const uid="staging002_qa_volunteer_0"+n,aid=ID+"_"+uid;
   put("responseAssignments",aid,{
     caseId:ID,volunteerId:uid,status:n===1&&accepted?"accepted":"offered",
     offerMode:"staging_bulk_all_eligible",wave:later&&n===3?2:1,
     expiresAtMs:pendingExpired?now-10000:now+180000
   });
   put("autoVolunteerReservations",uid,{caseId:ID,uid,assignmentId:aid});
   put("notifications","auto_response_"+aid,{caseId:ID,assignmentId:aid,userId:uid});
   if(n===1&&accepted){
     if(lock)put("responderLocks",uid,{
       caseId:ID,assignmentId:aid,responderUid:uid,status:"accepted"
     });
     put("notifications","auto_batch_accepted_"+aid,{
       caseId:ID,assignmentId:aid,responderId:uid,userId:"testResident002"
     });
     put("adminActivityLogs","auto_batch_decision_"+aid,{
       caseId:ID,volunteerUid:uid,action:"Synthetic Bulk Volunteer Accepted"
     });
   }
 }
 const db={collection(name){
   return {
     doc(id){return {id,key:name+"/"+id,
       async get(){const v=docs.get(name+"/"+id);return{exists:v!==undefined,data:()=>v}}};
     },
     where(field,operator,value){
       const selected=[...docs.entries()].filter(([key])=>key.startsWith(name+"/"))
         .map(([key,row])=>({id:key.split("/").at(-1),ref:{id:key.split("/").at(-1),key},
           data:()=>row})).filter(d=>{
             const v=d.data()[field];
             return operator==="=="?v===value:operator==="in"&&value.includes(v);
           });
       return {limit(max){return {async get(){
         const chosen=selected.slice(0,max);
         return {size:chosen.length,docs:chosen,empty:chosen.length===0};
       }}}};
     }
   };
 },async runTransaction(fn){created.push("transaction_called");throw Error("Wave stop must never write");}};
 return {db,docs,created};
}
test("accepted fictional 002 plus expired other offers: no further wave; guard confirmed without writes",async()=>{
 const f=fixture();
 const before=JSON.stringify([...f.docs]);
 const result=await verifyStaging002WaveStop(f.db,{timerConfigured:false,now});
 assert.equal(result.status,"wave_stop_guard_confirmed");
 assert.equal(result.accepted,1);
 assert.equal(result.correctResponderLocks,1);
 assert.equal(result.otherPendingOffers,2);
 assert.equal(result.expiredOtherOffers,2);
 assert.equal(result.laterWaveOffers,0);
 assert.equal(result.waveStopGuardConfirmed,true);
 assert.equal(result.observedAfterOtherOffersExpired,true);
 assert.equal(result.automaticWaveTimerConfigured,false);
 assert.equal(result.timerExecutionObserved,false);
 assert.equal(result.actualTimerExecutionNotProven,true);
 assert.equal(result.readOnly,true);
 assert.equal(result.noPersonalDetails,true);
 const str=JSON.stringify(result);
 assert.ok(!str.includes("staging002_qa_volunteer"));
 assert.ok(!str.includes("testResident"));
 assert.equal(JSON.stringify([...f.docs]),before);
 assert.equal(f.created.length,0);
});
test("wave engine itself returns supported with zero transaction calls when accepted offer exists",async()=>{
 const f=fixture();
 const before=JSON.stringify([...f.docs]);
 const outcome=await advanceBatchWave(f.db,now);
 assert.equal(outcome.status,"supported");
 assert.equal(outcome.accepted,1);
 assert.equal(f.created.length,0,"must not open Firestore write transaction");
 assert.equal(JSON.stringify([...f.docs]),before);
});
test("without acceptance, stop guard cannot be confirmed",async()=>{
 const f=fixture({accepted:false});
 const result=await verifyStaging002WaveStop(f.db,{timerConfigured:true,now});
 assert.equal(result.status,"no_accepted_responder");
 assert.equal(result.waveStopGuardConfirmed,false);
 assert.equal(result.timerExecutionObserved,false);
});
test("missing accepted responder lock prevents successful wave-stop verification",async()=>{
 const f=fixture({lock:false});
 const result=await verifyStaging002WaveStop(f.db,{now});
 assert.equal(result.status,"needs_review");
 assert.equal(result.acceptanceEvidenceVerified,false);
 assert.equal(result.correctResponderLocks,0);
});
test("a later wave is visible and blocks a clean stop claim",async()=>{
 const f=fixture({later:true});
 const result=await verifyStaging002WaveStop(f.db,{now});
 assert.equal(result.status,"needs_review");
 assert.equal(result.laterWaveOffers,1);
 assert.equal(result.noLaterWaveObserved,false);
});
test("before other offers expire, accepted responder guard is confirmed but not post-expiry observation",async()=>{
 const f=fixture({pendingExpired:false});
 const result=await verifyStaging002WaveStop(f.db,{now});
 assert.equal(result.status,"wave_stop_guard_confirmed");
 assert.equal(result.observedAfterOtherOffersExpired,false);
 assert.equal(result.expiredOtherOffers,0);
});
test("only authorized staging Admin can access read-only endpoint; UI uses separate control",()=>{
 const server=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
 assert.match(server,/app\.get\("\/api\/admin\/emergency-auto\/e2e-002\/bulk-wave-stop",\s*requireStagingAdmin/);
 assert.match(server,/verifyStaging002WaveStop\(firestore,/);
 assert.match(server,/if\(!stagingServiceAccountMatches\|\|!bulk002Enabled\)/);
 const html=fs.readFileSync(__dirname+"/stagingAdminLogin.html","utf8");
 assert.ok(html.includes('id="wave-stop-002"'));
 assert.ok(html.includes("/api/admin/emergency-auto/e2e-002/bulk-wave-stop"));
 const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1].replace(/^\s*import .*?;\s*$/gm,"")));
});
