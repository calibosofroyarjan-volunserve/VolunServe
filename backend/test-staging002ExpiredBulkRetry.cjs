"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {retryExpiredBatch002,MAX_RETRIES}=require("./staging002ExpiredBulkRetry");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const {FIXTURES}=require("./staging002TestVolunteerProvisioning");
const {getBatchOffer,batchStatus}=require("./stagingBulkVolunteerOffers");
const NOW=1800000000000;
class Db {
  constructor(){
    this.docs=new Map();
    this.add("disasterCases/"+E2E_CASE_ID,{
      title:E2E_CASE_TITLE,testOnly:true,
      testCategory:"staging_synthetic_volunteer_e2e_002",
      source:"staging_synthetic_e2e",
      status:"assigned",verificationStatus:"validated",
      dispatchBlocked:false,
      autoVolunteerDispatch:{state:"waiting",wave:1}
    });
    this.add("emergencyAutoDispatchBatches/"+E2E_CASE_ID,{
      status:"waiting",testOnly:true,origin:"staging_bulk_all_eligible_002",
      wave:1,volunteerCount:3,expiresAtMs:NOW-120000
    });
    this.add("disasterCases/STAGING_TEST_001",{
      status:"assigned",testOnly:true,
      autoVolunteerDispatch:{state:"accepted"}
    });
    this.add("responseAssignments/STAGING_TEST_001_devin",{
      caseId:"STAGING_TEST_001",volunteerId:"devin",status:"accepted"
    });
    this.add("responderLocks/devin",{caseId:"STAGING_TEST_001",status:"accepted"});
    for(const f of FIXTURES){
      this.add("responseAssignments/"+E2E_CASE_ID+"_"+f.uid,{
        volunteerId:f.uid,caseId:E2E_CASE_ID,status:"offered",
        offerMode:"staging_bulk_all_eligible",wave:1,expiresAtMs:NOW-1000
      });
      this.add("autoVolunteerReservations/"+f.uid,{
        caseId:E2E_CASE_ID,assignmentId:E2E_CASE_ID+"_"+f.uid
      });
      this.add("users/"+f.uid,{
        testOnly:true,testFixture:E2E_CASE_ID,role:"volunteer",status:"approved",
        volunteerAccess:true,volunteerStatus:"approved",
        identityVerified:true,barangay:"Bagong Buhay I",skills:["First Aid"]
      });
      this.add("volunteerApplications/"+f.uid,{
        testOnly:true,testFixture:E2E_CASE_ID,uid:f.uid,status:"approved"
      });
    }
  }
  add(key,value){this.docs.set(key,value)}
  snapshot(key){
    const data=this.docs.get(key);
    return {exists:data!==undefined,data:()=>data,ref:{key,id:key.split("/").at(-1)}};
  }
  collection(name){
    const self=this;
    return {
      doc(id){
        const key=name+"/"+id;
        return {key,id,async get(){return self.snapshot(key)}};
      },
      where(field,op,value){
        const found=[...self.docs.entries()]
          .filter(([key])=>key.startsWith(name+"/"))
          .filter(([,data])=>op==="=="?data[field]===value:
            op==="in"&&value.includes(data[field]));
        return {limit(max){
          return {async get(){
            const docs=found.slice(0,max).map(([key])=>self.snapshot(key));
            return {size:docs.length,docs,empty:docs.length===0};
          }};
        }};
      },
    };
  }
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:async ref=>this.snapshot(ref.key),
      update:(ref,data)=>writes.push({op:"update",key:ref.key,data}),
      create:(ref,data)=>writes.push({op:"create",key:ref.key,data}),
    };
    const result=await fn(tx);
    for(const {op,key} of writes){
      if(op==="create"&&this.docs.has(key))throw Error("duplicate_create");
      if(op==="update"&&!this.docs.has(key))throw Error("update_missing");
    }
    for(const {op,key,data} of writes){
      this.docs.set(key,op==="create"?data:{...this.docs.get(key),...data});
    }
    return result;
  }
}
const start=db=>JSON.stringify([
  db.docs.get("responseAssignments/STAGING_TEST_001_devin"),
  db.docs.get("responderLocks/devin"),
  db.docs.get("disasterCases/STAGING_TEST_001")
]);
test("expired three synthetic offers can be reissued once, authenticated Volunteer can view refreshed deadline",async()=>{
  const db=new Db();
  const old001=start(db);
  const result=await retryExpiredBatch002(db,"stagingApprovedAdmin",NOW);
  assert.equal(result.status,"reissued");
  assert.equal(result.offered,3);
  assert.equal(result.wave,1);
  assert.equal(result.retryNumber,1);
  assert.equal(result.retriesRemaining,MAX_RETRIES-1);
  assert.equal(result.expiresAtMs,NOW+180000);
  for(const f of FIXTURES){
    const offer=db.docs.get("responseAssignments/"+E2E_CASE_ID+"_"+f.uid);
    assert.equal(offer.status,"offered");
    assert.equal(offer.expiresAtMs,NOW+180000);
    const read=await getBatchOffer(db,f.uid,NOW+500);
    assert.equal(read.status,"offered");
    assert.equal(read.canRespond,true);
  }
  const summary=await batchStatus(db);
  assert.equal(summary.offered,3);
  assert.equal(summary.pending,3);
  assert.equal(summary.accepted,0);
  assert.equal(start(db),old001);
});
test("cannot reissue any non-expired member",async()=>{
  const db=new Db();
  db.docs.get("responseAssignments/"+E2E_CASE_ID+"_"+FIXTURES[0].uid)
    .expiresAtMs=NOW+180000;
  const result=await retryExpiredBatch002(db,"admin",NOW);
  assert.deepEqual(result,{status:"blocked",reason:"some_fictional_offers_still_active"});
  assert.equal(db.docs.get("emergencyAutoDispatchBatches/"+E2E_CASE_ID).retryCount,undefined);
});
test("cannot reset ANY accepted or declined assignment, even if other offers expired",async()=>{
  for(const status of ["accepted","declined"]){
    const db=new Db();
    db.docs.get("responseAssignments/"+E2E_CASE_ID+"_"+FIXTURES[1].uid).status=status;
    const result=await retryExpiredBatch002(db,"admin",NOW);
    assert.equal(result.status,"blocked");
    assert.equal(db.docs.get("responseAssignments/"+E2E_CASE_ID+"_"+FIXTURES[0].uid).expiresAtMs,NOW-1000);
  }
});
test("does not resend to non-fictional IDs or account with revoked staged approval",async()=>{
  for(const invalid of ["nonfixed","revoked"]){
    const db=new Db();
    if(invalid==="nonfixed"){
      const f=FIXTURES[0];
      db.docs.get("responseAssignments/"+E2E_CASE_ID+"_"+f.uid).volunteerId="someoneElse";
    }else{
      const f=FIXTURES[0];
      db.docs.get("users/"+f.uid).volunteerAccess=false;
    }
    const result=await retryExpiredBatch002(db,"admin",NOW);
    assert.equal(result.status,"blocked");
  }
});
test("cannot perform second retry until new 3-minute window expires",async()=>{
  const db=new Db();
  const first=await retryExpiredBatch002(db,"admin",NOW);
  assert.equal(first.status,"reissued");
  const second=await retryExpiredBatch002(db,"admin",NOW+1000);
  assert.equal(second.status,"blocked");
  assert.equal(db.docs.get("emergencyAutoDispatchBatches/"+E2E_CASE_ID).retryCount,1);
});
test("retry count capped to prevent indefinite cycling",async()=>{
  const db=new Db();
  db.docs.get("emergencyAutoDispatchBatches/"+E2E_CASE_ID).retryCount=MAX_RETRIES;
  const result=await retryExpiredBatch002(db,"admin",NOW);
  assert.equal(result.reason,"fictional_bulk_retry_limit_reached");
});
test("no retry if another assignment has a lock or test Volunteer is busy in another case",async()=>{
  for(const kind of ["lock","otherCase"]){
    const db=new Db(),uid=FIXTURES[0].uid;
    if(kind==="lock")db.add("responderLocks/"+uid,{caseId:E2E_CASE_ID});
    else db.add("responseAssignments/another_case_"+uid,{
      volunteerId:uid,caseId:"another_case",status:"accepted"
    });
    const r=await retryExpiredBatch002(db,"admin",NOW);
    assert.equal(r.status,"blocked");
  }
});
test("API remains explicitly Admin-only, only fictional 002 and never legacy route",()=>{
  const source=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
  const ui=fs.readFileSync(__dirname+"/stagingAdminLogin.html","utf8");
  assert.match(source,/app\.post\("\/api\/admin\/emergency-auto\/e2e-002\/bulk-reissue",\s*requireStagingAdmin,requireActivation/);
  assert.match(source,/request\.body\?\.confirmExpiredBulkRetry!==true/);
  assert.ok(ui.includes('id="bulk-reissue-002"'));
  assert.ok(ui.includes('confirmExpiredBulkRetry:true'));
  const code=[...ui.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(code.length,1);
  assert.doesNotThrow(()=>new Function(code[0][1].replace(/^\s*import .*?;\s*$/gm,"")));
});
