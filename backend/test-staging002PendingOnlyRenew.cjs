"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {renewExpiredPending002,QA_TTL_MS}=require("./staging002PendingOnlyRenew");
const {respondBatchOffer,getBatchOffer,batchStatus}=require("./stagingBulkVolunteerOffers");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const CASE=E2E_CASE_ID,now=Date.UTC(2026,10,23,2,0,0);
class Snapshot{
  constructor(db,path){this.ref=db.doc(path);this.exists=db.docs.has(path);this.value=db.docs.get(path)}
  data(){return this.value}
}
class Ref{
  constructor(db,path){this.db=db;this.path=path;this.id=path.split("/").at(-1)}
  async get(){return new Snapshot(this.db,this.path)}
}
class DB{
  constructor(){this.docs=new Map()}
  collection(name){
    return {doc:id=>this.doc(name+"/"+id),
      where:(field,op,value)=>{
        assert.equal(op,"==");
        return {limit:()=>({get:async()=>{
          const docs=[...this.docs.entries()]
            .filter(([p,d])=>p.startsWith(name+"/")&&d[field]===value)
            .map(([p])=>new Snapshot(this,p));
          return {docs,size:docs.length,empty:docs.length===0};
        }})};
      }};
  }
  doc(p){return new Ref(this,p)}
  put(p,data){this.docs.set(p,data)}
  get(p){return this.docs.get(p)}
  async runTransaction(fn){
    const writes=[];
    const tx={get:r=>r.get(),update:(r,v)=>writes.push(["update",r.path,v]),
      create:(r,v)=>writes.push(["create",r.path,v]),
      delete:r=>writes.push(["delete",r.path])};
    const result=await fn(tx);
    const staged=new Map(this.docs);
    for(const [op,p,v] of writes){
      if(op==="create")assert.equal(staged.has(p),false,"no duplicate creates");
      if(op==="update")assert.equal(staged.has(p),true,"update only existing");
      if(op==="delete")staged.delete(p);
      else staged.set(p,op==="update"?{...staged.get(p),...v}:v);
    }
    this.docs=staged;
    return result;
  }
}
function prepare(){
  const db=new DB();
  db.put("disasterCases/"+CASE,{title:E2E_CASE_TITLE,
    testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",reporterUid:"resident",
    validatedBy:"qaAdmin",status:"assigned",verificationStatus:"validated",
    dispatchBlocked:false});
  db.put("emergencyAutoDispatchBatches/"+CASE,{
    status:"waiting",wave:1,volunteerCount:3,
    testOnly:true,origin:"staging_bulk_all_eligible_002"});
  for(let slot=1;slot<=3;slot++){
    const uid="staging002_qa_volunteer_0"+slot;
    db.put("users/"+uid,{testOnly:true,testFixture:CASE,
      testFixtureSlot:slot,role:"volunteer",status:"approved",
      volunteerStatus:"approved",volunteerAccess:true,identityVerified:true});
    db.put("volunteerApplications/"+uid,{testOnly:true,
      testFixture:CASE,uid,status:"approved"});
    db.put("responseAssignments/"+CASE+"_"+uid,{
      caseId:CASE,volunteerId:uid,createdBy:"automatic_matching_engine",
      offerMode:"staging_bulk_all_eligible",wave:1,
      expiresAtMs:now-1000,status:slot===1?"accepted":"offered"});
    db.put("autoVolunteerReservations/"+uid,{
      caseId:CASE,assignmentId:CASE+"_"+uid,expiresAt:{seconds:0}});
  }
  const acceptedUid="staging002_qa_volunteer_01";
  db.put("responderLocks/"+acceptedUid,{responderUid:acceptedUid,
    caseId:CASE,assignmentId:CASE+"_"+acceptedUid,status:"accepted"});
  return db;
}
test("only expired pending slot 2 is renewed, all accepted task and lock content remains unchanged",async()=>{
  const db=prepare(), acceptedId=CASE+"_staging002_qa_volunteer_01";
  const accepted={...db.get("responseAssignments/"+acceptedId)};
  const locked={...db.get("responderLocks/staging002_qa_volunteer_01")};
  const result=await renewExpiredPending002(db,"qaAdmin",2,now);
  assert.equal(result.status,"renewed");
  assert.equal(result.acceptedFixturesPreserved,true);
  assert.equal(db.get("responseAssignments/"+CASE+"_staging002_qa_volunteer_02").qaPendingRenewals,1);
  assert.equal(db.get("responseAssignments/"+CASE+"_staging002_qa_volunteer_02").expiresAtMs,now+QA_TTL_MS);
  assert.deepEqual(db.get("responseAssignments/"+acceptedId),accepted);
  assert.deepEqual(db.get("responderLocks/staging002_qa_volunteer_01"),locked);
  assert.equal(db.get("responseAssignments/"+CASE+"_staging002_qa_volunteer_03").status,"offered");
  assert.equal(db.get("emergencyAutoDispatchBatches/"+CASE).status,"waiting");
  assert.equal(db.get("notifications/qa_pending_only_renew_"+CASE+"_staging002_qa_volunteer_02_1").testOnly,true);
});
test("accepted slot and still-active pending cannot be renewed; max two renewals",async()=>{
  const db=prepare();
  assert.equal((await renewExpiredPending002(db,"qaAdmin",1,now)).reason,"target_not_pending");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now)).status,"renewed");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now+1000)).reason,"target_not_expired");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now+QA_TTL_MS+1)).status,"renewed");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now+2*QA_TTL_MS+2)).reason,"qa_renewal_limit");
});
test("only the exact fictional case and approved fixture is eligible",async()=>{
  const db=prepare();
  db.get("disasterCases/"+CASE).testOnly=false;
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now)).status,"blocked");
  db.get("disasterCases/"+CASE).testOnly=true;
  db.get("users/staging002_qa_volunteer_02").volunteerAccess=false;
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now)).reason,"fictional_volunteer_no_longer_approved");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",4,now)).reason,"only_fixed_fictional_slots");
});
test("real staging Accept/Decline backend works after separate pending-only renewals: two accepted, one declined",async()=>{
  const db=prepare();
  assert.equal((await renewExpiredPending002(db,"qaAdmin",2,now)).status,"renewed");
  assert.equal((await renewExpiredPending002(db,"qaAdmin",3,now)).status,"renewed");
  assert.equal((await getBatchOffer(db,"staging002_qa_volunteer_02",now+1)).canRespond,true);
  assert.equal((await respondBatchOffer(db,"staging002_qa_volunteer_02","accepted",now+1000)).status,"accepted");
  assert.equal((await respondBatchOffer(db,"staging002_qa_volunteer_03","declined",now+2000)).status,"declined");
  const status=await batchStatus(db);
  assert.deepEqual({offered:status.offered,accepted:status.accepted,declined:status.declined,pending:status.pending},
    {offered:3,accepted:2,declined:1,pending:0});
  assert.ok(db.get("responderLocks/staging002_qa_volunteer_01"));
  assert.ok(db.get("responderLocks/staging002_qa_volunteer_02"));
  assert.equal(db.get("autoVolunteerReservations/staging002_qa_volunteer_03"),undefined);
});
