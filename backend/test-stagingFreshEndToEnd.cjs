"use strict";

/**
 * Fully in-memory fresh end-to-end staging QA.
 *
 * IMPORTANT: no Firebase credentials, network, production, real volunteer
 * notification, or real Firestore mutations are used. A brand-new fake
 * Firestore is created for EVERY test. This verifies core + staging HTTP API
 * contracts; a real authenticated browser E2E remains a separate gate.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {makeApp}=require("./emergencyAutoDispatchStagingServer");
const {createEngine}=require("../functions/emergencyAutoDispatchCore");

const FIXED_ID="STAGING_TEST_001";
const FRESH_ID="STAGING_E2E_002";
const ADMIN="qaAdmin",RESIDENT="qaResident",VOL="qaVolunteer";
const PROJECT="volunserve-isolated-e2e-fake";
const fakeServerTimestamp=()=>({syntheticServerTime:true});
const syntheticFirestore={
  FieldValue:{serverTimestamp:fakeServerTimestamp},
  Timestamp:{fromMillis:ms=>({toMillis:()=>ms})},
};

class FakeSnap {
  constructor(db,key,data){
    this.db=db;this.id=key.slice(key.indexOf("/")+1);
    this.ref=db.docPath(key);this.exists=data!==undefined;this.value=data;
  }
  data(){return this.value;}
}
class FakeRef {
  constructor(db,name,id){this.db=db;this.path=name+"/"+id;this.id=id;}
  async get(){return this.db.snapshot(this.path);}
}
class FakeQuery {
  constructor(db,name,filters=[],take=Infinity){
    this.db=db;this.name=name;this.filters=filters;this.take=take;
  }
  where(field,op,value){
    assert.ok(["==","in"].includes(op),"Only supported synthetic Firestore filters");
    return new FakeQuery(this.db,this.name,[...this.filters,{field,op,value}],this.take);
  }
  limit(n){return new FakeQuery(this.db,this.name,this.filters,n);}
  async get(){
    const docs=[...this.db.docs.entries()]
      .filter(([key])=>key.startsWith(this.name+"/"))
      .map(([key,data])=>new FakeSnap(this.db,key,data))
      .filter(s=>this.filters.every(({field,op,value})=>{
        const actual=s.data()?.[field];
        return op==="=="?actual===value:value.includes(actual);
      })).slice(0,this.take);
    return {docs,size:docs.length,empty:docs.length===0};
  }
}
class FakeCollection extends FakeQuery {
  doc(id){return new FakeRef(this.db,this.name,id);}
}
class FakeDb {
  constructor(){this.docs=new Map();this.commits=0;}
  collection(name){return new FakeCollection(this,name);}
  docPath(path){
    const slash=path.indexOf("/");
    return new FakeRef(this,path.slice(0,slash),path.slice(slash+1));
  }
  snapshot(path){return new FakeSnap(this,path,this.docs.get(path));}
  seed(path,value){this.docs.set(path,value);}
  get(path){return this.docs.get(path);}
  list(prefix){return [...this.docs.keys()].filter(key=>key.startsWith(prefix));}
  async runTransaction(callback){
    const writes=[];
    const tx={
      get:ref=>ref.get(),
      set:(ref,data,options={})=>writes.push(["set",ref.path,data,options]),
      update:(ref,data)=>writes.push(["update",ref.path,data]),
      create:(ref,data)=>writes.push(["create",ref.path,data]),
      delete:ref=>writes.push(["delete",ref.path]),
    };
    const outcome=await callback(tx);
    // Apply to an isolated copy: a thrown assertion cannot partially mutate.
    const next=new Map(this.docs);
    for(const [op,key,value,options] of writes){
      if(op==="create")assert.ok(!next.has(key),"duplicate Firestore create refused");
      if(op==="update")assert.ok(next.has(key),"missing Firestore update refused");
      if(op==="delete"){next.delete(key);continue;}
      next.set(key,op==="update" || (op==="set"&&options?.merge)?
        {...next.get(key),...value}:value);
    }
    this.docs=next;
    this.commits+=Number(writes.length>0);
    return outcome;
  }
}
function seedAccounts(db,volunteerId=VOL){
  db.seed("users/"+ADMIN,{role:"admin",status:"approved"});
  db.seed("users/"+RESIDENT,{role:"resident",status:"approved"});
  db.seed("users/"+volunteerId,{
    role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    barangay:"Bagong Buhay I",skills:["First Aid"],fullName:"Synthetic QA Volunteer"
  });
  db.seed("volunteerApplications/"+volunteerId,{
    uid:volunteerId,status:"approved",skills:["First Aid"]
  });
}
function seedReported(db,id,title="TEST ONLY - Dummy Emergency"){
  db.seed("disasterCases/"+id,{
    title,status:"reported",verificationStatus:"pending_verification",
    reporterUid:RESIDENT,incidentBarangay:"Bagong Buhay I",
    severity:"medium",requiredSkills:["First Aid"],
    dispatchBlocked:false
  });
}
async function syntheticAdminValidate(db,id){
  // This models the Admin's validated Firestore state, NOT a live browser/UI
  // validation request. Do not call this a real authenticated Admin action.
  const ref=db.collection("disasterCases").doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    assert.ok(snap.exists);
    assert.equal(snap.data().status,"reported");
    tx.update(ref,{
      status:"validated",verificationStatus:"validated",
      validatedBy:ADMIN,validatedAt:fakeServerTimestamp(),
      dispatchBlocked:false,
    });
  });
}
function makeMatchingEngine(db,clock=Date.now){
  return createEngine({db,clock,firestore:syntheticFirestore,
    log:{info(){},warn(){},error(){}}});
}
async function serve(db,callback){
  const engine=makeMatchingEngine(db);
  const worker={
    config:{onDemandReady:true,ready:false},
    requestStart:id=>engine.requestAdminStart(id),
    requestDisable:id=>engine.disableCase(id),
  };
  const authClient={verifyIdToken:async token=>{
    if(![ADMIN,VOL,"qaOtherVolunteer",RESIDENT].includes(token))
      throw Error("invalid fake Firebase ID token");
    return {uid:token};
  }};
  const env={
    VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:PROJECT,
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:PROJECT}),
  };
  const app=makeApp({firestore:db,authClient,worker,env});
  const server=app.listen(0,"127.0.0.1");
  try{
    await new Promise((resolve,reject)=>{
      if(server.listening)resolve();
      else {server.once("listening",resolve);server.once("error",reject);}
    });
    const base="http://127.0.0.1:"+server.address().port;
    const req=async(path,{who,method="GET",body}={})=>{
      const headers={};
      if(who)headers.Authorization="Bearer "+who;
      if(body){headers["Content-Type"]="application/json";}
      const response=await fetch(base+path,{
        method,headers,body:body?JSON.stringify(body):undefined
      });
      return {code:response.status,body:await response.json()};
    };
    return await callback({req,db,engine,base});
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

test("fresh isolated staging HTTP Admin → offer → Volunteer Accept → notification + audit → verify",async()=>{
  const db=new FakeDb();
  seedAccounts(db);
  seedReported(db,FIXED_ID);
  db.seed("users/qaOtherVolunteer",{
    role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    barangay:"Bagong Buhay II",skills:["First Aid"]
  });
  db.seed("volunteerApplications/qaOtherVolunteer",{
    uid:"qaOtherVolunteer",status:"approved",skills:["First Aid"]
  });
  db.seed("systemSettings/emergencyVolunteerMatching",{
    enabled:true,approved:true,neighborsByBarangay:{"Bagong Buhay I":["Bagong Buhay II"]}
  });
  await serve(db,async({req})=>{
    const preAuth=await req("/api/admin/emergency-auto/preflight");
    assert.equal(preAuth.code,401);
    const initial=await req("/api/admin/emergency-auto/preflight",{who:ADMIN});
    assert.equal(initial.code,200);
    assert.equal(initial.body.status,"blocked");
    const blockedStart=await req("/api/admin/emergency-auto/start",{
      method:"POST",who:RESIDENT,body:{caseId:FIXED_ID}
    });
    assert.equal(blockedStart.code,403);
    await syntheticAdminValidate(db,FIXED_ID);
    const ready=await req("/api/admin/emergency-auto/preflight",{who:ADMIN});
    assert.equal(ready.body.status,"ready");
    assert.equal(ready.body.wave,1);
    assert.equal(db.list("responseAssignments/").length,0,
      "Read-only preflight must never dispatch");
    const before=await req("/api/staging/volunteer/task",{who:VOL});
    assert.equal(before.body.status,"not_offered");
    const start=await req("/api/admin/emergency-auto/start",{
      who:ADMIN,method:"POST",body:{caseId:FIXED_ID}
    });
    assert.equal(start.code,200);
    assert.equal(start.body.action,"offered");
    assert.equal(start.body.wave,1);
    const aid=FIXED_ID+"_"+VOL;
    assert.equal(db.get("responseAssignments/"+aid).status,"offered");
    assert.equal(db.get("disasterCases/"+FIXED_ID).status,"assigned");
    assert.equal(db.get("notifications/auto_response_"+aid).userId,VOL);
    assert.equal(db.get("adminActivityLogs/auto_offer_"+aid).action,
      "Automatic Volunteer Task Offered");
    const unauthorizedTask=await req("/api/staging/volunteer/task",{who:RESIDENT});
    assert.equal(unauthorizedTask.code,403);
    const otherTask=await req("/api/staging/volunteer/task",{who:"qaOtherVolunteer"});
    assert.equal(otherTask.body.status,"not_offered");
    const offered=await req("/api/staging/volunteer/task",{who:VOL});
    assert.equal(offered.body.status,"offered");
    assert.equal(offered.body.canRespond,true);
    const bogus=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{decision:"confirmed"}
    });
    assert.equal(bogus.code,400);
    const accepted=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{decision:"accepted"}
    });
    assert.equal(accepted.code,200);
    assert.equal(accepted.body.status,"accepted");
    const verified=await req("/api/admin/emergency-auto/verify-test",{who:ADMIN});
    assert.equal(verified.code,200);
    assert.equal(verified.body.fullAcceptanceVerified,true,
      "A fresh Volunteer acceptance must generate original records, no late QA");
    assert.equal(verified.body.reconciliationRecorded,false);
    assert.equal(verified.body.supportRecordsVerified,true);
    assert.equal(verified.body.acceptedResponderLockCorrect,true);
    assert.equal(verified.body.acceptedResidentNotificationPresent,true);
    assert.equal(verified.body.adminAuditCorrect,true);
    assert.equal(db.get("notifications/auto_test_accepted_"+aid).userId,RESIDENT);
    assert.equal(db.get("adminActivityLogs/auto_test_decision_"+aid).action,
      "Synthetic Volunteer Accepted");
    const countBefore=db.list("notifications/").length;
    const repeated=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{decision:"accepted"}
    });
    assert.equal(repeated.code,200);
    assert.equal(repeated.body.status,"already_accepted");
    assert.equal(db.list("notifications/").length,countBefore,
      "Repeated Accept must not create duplicate notifications");
    const reissue=await req("/api/admin/emergency-auto/reissue-test",{
      method:"POST",who:ADMIN,body:{caseId:FIXED_ID}
    });
    assert.equal(reissue.code,409);
    assert.equal(reissue.body.error,"cannot_reset_accepted_task");
    assert.equal(db.get("responseAssignments/"+aid).status,"accepted");
    assert.equal(db.get("responderLocks/"+VOL).assignmentId,aid);
  });
});

test("second independent fictional STAGING_E2E_002 matches only free approved volunteers, without touching existing accepted 001",async()=>{
  const db=new FakeDb();
  seedAccounts(db,"qaAvailableVolunteer");
  // Accepted historical 001 is never mutated, reissued, or reallocated.
  const prior={title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",activeVolunteerSupportAssignmentId:
      FIXED_ID+"_qaBusyVolunteer",autoVolunteerDispatch:{state:"accepted"}};
  db.seed("disasterCases/"+FIXED_ID,prior);
  db.seed("responseAssignments/"+FIXED_ID+"_qaBusyVolunteer",{
    caseId:FIXED_ID,volunteerId:"qaBusyVolunteer",status:"accepted",
    createdBy:"automatic_matching_engine"
  });
  db.seed("responderLocks/qaBusyVolunteer",{
    caseId:FIXED_ID,assignmentId:FIXED_ID+"_qaBusyVolunteer"});
  db.seed("users/qaBusyVolunteer",{
    role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    barangay:"Bagong Buhay I",skills:["First Aid"]
  });
  db.seed("volunteerApplications/qaBusyVolunteer",{
    uid:"qaBusyVolunteer",status:"approved",skills:["First Aid"]
  });
  seedReported(db,FRESH_ID,"TEST ONLY - Fresh Isolated E2E 002");
  await syntheticAdminValidate(db,FRESH_ID);
  const before=JSON.stringify(db.get("disasterCases/"+FIXED_ID));
  const engine=makeMatchingEngine(db);
  const offer=await engine.advanceCase(FRESH_ID);
  assert.equal(offer.action,"offered");
  assert.equal(offer.wave,1);
  assert.equal(offer.uid,"qaAvailableVolunteer");
  const assignmentId=FRESH_ID+"_qaAvailableVolunteer";
  assert.equal(db.get("responseAssignments/"+assignmentId).status,"offered");
  assert.ok(db.get("notifications/auto_response_"+assignmentId));
  assert.ok(db.get("adminActivityLogs/auto_offer_"+assignmentId));
  assert.equal(db.get("responseAssignments/"+FIXED_ID+"_qaBusyVolunteer").status,"accepted");
  assert.equal(JSON.stringify(db.get("disasterCases/"+FIXED_ID)),before);
  assert.equal(db.get("responderLocks/qaBusyVolunteer").caseId,FIXED_ID);
  const repeat=await engine.advanceCase(FRESH_ID);
  assert.equal(repeat.action,"waiting","No duplicate offers while waiting");
  assert.equal(db.list("responseAssignments/"+FRESH_ID+"_").length,1);
  // The general engine does not perform a Volunteer HTTP accept or create
  // acceptance notifications; that is separately verified in the first test.
  assert.equal(db.list("notifications/auto_test_accepted_"+FRESH_ID).length,0);
});

test("fresh in-memory Volunteer decline creates Admin alert and retains no responder lock",async()=>{
  const db=new FakeDb();
  seedAccounts(db);
  seedReported(db,FIXED_ID);
  await syntheticAdminValidate(db,FIXED_ID);
  await serve(db,async({req})=>{
    const offer=await req("/api/admin/emergency-auto/start",{
      method:"POST",who:ADMIN,body:{caseId:FIXED_ID}
    });
    assert.equal(offer.body.action,"offered");
    const response=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{decision:"declined"}
    });
    assert.equal(response.code,200);
    assert.equal(response.body.status,"declined");
    const aid=FIXED_ID+"_"+VOL;
    assert.equal(db.get("responseAssignments/"+aid).status,"declined");
    assert.equal(db.get("emergencyAutoDispatch/"+FIXED_ID).status,"needs_admin");
    assert.equal(db.get("responderLocks/"+VOL),undefined);
    assert.equal(db.get("autoVolunteerReservations/"+VOL),undefined);
    assert.equal(db.get("notifications/auto_test_declined_"+aid).userId,ADMIN);
    assert.equal(db.get("adminActivityLogs/auto_test_decision_"+aid).action,
      "Synthetic Volunteer Declined");
    assert.equal(db.get("notifications/auto_test_accepted_"+aid),undefined);
  });
});
