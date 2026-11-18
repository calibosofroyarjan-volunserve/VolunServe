"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {verifyStaging002BulkAcceptance}=require("./staging002BulkAcceptanceVerifier");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const ID=E2E_CASE_ID;
function fixture({missingLock=false,mixed=false}={}){
  const docs=new Map();
  const put=(c,id,data)=>docs.set(c+"/"+id,data);
  put("disasterCases",ID,{
    title:E2E_CASE_TITLE,testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",status:"assigned",
    verificationStatus:"validated",reporterUid:"fakeResident002",
  });
  put("emergencyAutoDispatchBatches",ID,{
    status:"waiting",testOnly:true,origin:"staging_bulk_all_eligible_002",wave:1
  });
  for(let n=1;n<=3;n++){
    const uid="staging002_qa_volunteer_0"+n;
    const aid=ID+"_"+uid;
    put("responseAssignments",aid,{
      caseId:ID,volunteerId:uid,status:n===1?"accepted":"offered",
      offerMode:mixed&&n===3?"manual":"staging_bulk_all_eligible",wave:1,
    });
    put("autoVolunteerReservations",uid,{
      caseId:ID,assignmentId:aid,uid
    });
    put("notifications","auto_response_"+aid,{
      caseId:ID,assignmentId:aid,userId:uid
    });
    if(n===1){
      if(!missingLock)put("responderLocks",uid,{
        caseId:ID,responderUid:uid,assignmentId:aid,status:"accepted"
      });
      put("notifications","auto_batch_accepted_"+aid,{
        caseId:ID,assignmentId:aid,responderId:uid,userId:"fakeResident002"
      });
      put("adminActivityLogs","auto_batch_decision_"+aid,{
        caseId:ID,volunteerUid:uid,action:"Synthetic Bulk Volunteer Accepted"
      });
    }
  }
  let writes=0;
  const db={collection(name){
    return {
      doc(id){return {async get(){
        const value=docs.get(name+"/"+id);
        return {exists:value!==undefined,data:()=>value};
      }};},
      where(field,op,value){
        const rows=[...docs.entries()]
          .filter(([key])=>key.startsWith(name+"/"))
          .map(([,row])=>row)
          .filter(row=>op==="=="?row[field]===value:false);
        return {limit(max){return {async get(){
          const selected=rows.slice(0,max);
          return {size:selected.length,docs:selected.map(x=>({data:()=>x}))};
        }}}};
      }
    };
  }};
  return {db,docs,put,get writes(){return writes}};
}
test("accepted bulk offer has exactly one correct lock, reservation, notification and audit",async()=>{
  const f=fixture();
  const before=JSON.stringify([...f.docs]);
  const d=await verifyStaging002BulkAcceptance(f.db);
  assert.equal(d.status,"verified");
  assert.equal(d.offerCount,3);
  assert.equal(d.accepted,1);
  assert.equal(d.pending,2);
  assert.equal(d.correctResponderLocks,1);
  assert.equal(d.correctReservations,1);
  assert.equal(d.originalOfferNotifications,1);
  assert.equal(d.acceptanceResidentNotifications,1);
  assert.equal(d.acceptanceAudits,1);
  assert.equal(d.unexpectedPendingResponderLocks,0);
  assert.equal(d.fullAcceptanceEvidenceVerified,true);
  assert.equal(d.batchSessionStatus,"waiting");
  assert.equal(d.furtherWaveEscalationVerified,false);
  assert.equal(d.readOnly,true);
  assert.equal(d.noPersonalDetails,true);
  const raw=JSON.stringify(d);
  assert.ok(!raw.includes("staging002_qa_volunteer"));
  assert.ok(!raw.includes("fakeResident"));
  assert.equal(JSON.stringify([...f.docs]),before,"No Firestore changes");
});
test("missing accepted lock fails verification without repairing anything",async()=>{
  const f=fixture({missingLock:true});
  const before=JSON.stringify([...f.docs]);
  const d=await verifyStaging002BulkAcceptance(f.db);
  assert.equal(d.status,"needs_review");
  assert.equal(d.accepted,1);
  assert.equal(d.correctResponderLocks,0);
  assert.equal(d.fullAcceptanceEvidenceVerified,false);
  assert.equal(JSON.stringify([...f.docs]),before);
});
test("mixed assignment models are blocked",async()=>{
  const f=fixture({mixed:true});
  const d=await verifyStaging002BulkAcceptance(f.db);
  assert.equal(d.status,"blocked");
  assert.equal(d.reason,"mixed_or_missing_bulk_assignments");
});
test("cannot claim a bulk acceptance when only single-task records exist",async()=>{
  const f=fixture();
  f.docs.delete("emergencyAutoDispatchBatches/"+ID);
  const d=await verifyStaging002BulkAcceptance(f.db);
  assert.equal(d.status,"blocked");
});
test("new Admin endpoint is authenticated, read-only and independent of legacy checker",()=>{
  const server=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
  assert.match(server,/app\.get\("\/api\/admin\/emergency-auto\/e2e-002\/bulk-verify-acceptance",\s*requireStagingAdmin/);
  assert.match(server,/verifyStaging002BulkAcceptance\(firestore\)/);
  const html=fs.readFileSync(__dirname+"/stagingAdminLogin.html","utf8");
  assert.ok(html.includes('id="bulk-verify-002"'));
  assert.ok(html.includes("/api/admin/emergency-auto/e2e-002/bulk-verify-acceptance"));
  const parts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(parts.length,1);
  assert.doesNotThrow(()=>new Function(parts[0][1].replace(/^\s*import .*?;\s*$/gm,"")));
});
