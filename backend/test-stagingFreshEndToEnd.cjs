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
async function serve(db,callback,additionalEnv={}){
  const engine=makeMatchingEngine(db);
  const worker={
    config:{onDemandReady:true,ready:false},
    requestStart:id=>engine.requestAdminStart(id),
    requestDisable:id=>engine.disableCase(id),
  };
  const authClient={verifyIdToken:async token=>{
    if(![ADMIN,VOL,"qaOtherVolunteer","qaSecond","qaThird",RESIDENT].includes(token))
      throw Error("invalid fake Firebase ID token");
    return {uid:token};
  }};
  const env={
    VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:PROJECT,
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:PROJECT}),
    ...additionalEnv,
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


test("staging-only 002: authenticated Admin creates and validates new fictional report, Volunteer accepts with original records",async()=>{
  const db=new FakeDb();
  seedAccounts(db);
  const previous={
    title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",reporterUid:RESIDENT,
    activeVolunteerSupportAssignmentId:FIXED_ID+"_previousVolunteer",
    autoVolunteerDispatch:{state:"accepted"}
  };
  db.seed("disasterCases/"+FIXED_ID,{...previous});
  await serve(db,async({req})=>{
    const url="/api/admin/emergency-auto/e2e-002/";
    let response=await req(url+"preflight",{who:ADMIN});
    assert.equal(response.body.status,"not_created");
    response=await req(url+"create",{method:"POST",
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(response.code,401);
    response=await req(url+"create",{method:"POST",who:RESIDENT,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(response.code,403);
    response=await req(url+"create",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID}});
    assert.equal(response.code,400);
    response=await req(url+"create",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(response.code,200);
    assert.equal(response.body.status,"created");
    assert.deepEqual(db.get("disasterCases/"+FIXED_ID),previous);
    assert.equal(db.get("disasterCases/"+FRESH_ID).status,"reported");
    assert.equal(db.get("disasterCases/"+FRESH_ID).dispatchBlocked,true);
    const createdAgain=await req(url+"create",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(createdAgain.body.status,"already_exists");
    response=await req(url+"preflight",{who:ADMIN});
    assert.equal(response.body.status,"reported");
    const beforeOffer=await req("/api/admin/emergency-auto/start",{method:"POST",
      who:ADMIN,body:{caseId:FRESH_ID}});
    assert.equal(beforeOffer.code,409);
    response=await req(url+"validate",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(response.code,200);
    assert.equal(response.body.status,"validated");
    assert.equal(db.get("disasterCases/"+FRESH_ID).verificationStatus,"validated");
    assert.equal(db.get("disasterCases/"+FRESH_ID).validatedBy,ADMIN);
    assert.equal(db.get("adminActivityLogs/auto_test_002_validated").action,
      "Synthetic Staging 002 Test Report Validated");
    response=await req(url+"preflight",{who:ADMIN});
    assert.equal(response.code,200);
    assert.equal(response.body.status,"ready");
    assert.equal(response.body.wave,1);
    const noOffer=await req("/api/staging/volunteer/task?caseId="+FRESH_ID,{who:VOL});
    assert.equal(noOffer.body.status,"not_offered");
    const offer=await req("/api/admin/emergency-auto/start",{method:"POST",
      who:ADMIN,body:{caseId:FRESH_ID}});
    assert.equal(offer.code,200);
    assert.equal(offer.body.action,"offered");
    const aid=FRESH_ID+"_"+VOL;
    assert.equal(db.get("responseAssignments/"+aid).status,"offered");
    assert.equal(db.get("notifications/auto_response_"+aid).userId,VOL);
    response=await req(url+"preflight",{who:ADMIN});
    assert.equal(response.body.status,"existing_assignment");
    const other=await req("/api/staging/volunteer/task?caseId="+FIXED_ID,{who:VOL});
    assert.equal(other.body.status,"not_offered");
    response=await req("/api/staging/volunteer/task?caseId="+FRESH_ID,{who:VOL});
    assert.equal(response.body.status,"offered");
    assert.equal(response.body.canRespond,true);
    const invalidCase=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{caseId:"UNRECOGNIZED_CASE",decision:"accepted"}
    });
    assert.equal(invalidCase.code,403);
    const accept=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{caseId:FRESH_ID,decision:"accepted"}
    });
    assert.equal(accept.code,200);
    assert.equal(accept.body.status,"accepted");
    const review=await req("/api/admin/emergency-auto/verify-test?caseId="+FRESH_ID,
      {who:ADMIN});
    assert.equal(review.code,200);
    assert.equal(review.body.fullAcceptanceVerified,true);
    assert.equal(review.body.reconciliationRecorded,false);
    assert.equal(review.body.acceptedResponderLockCorrect,true);
    assert.equal(review.body.acceptedResidentNotificationPresent,true);
    assert.equal(review.body.adminAuditCorrect,true);
    assert.equal(db.get("notifications/auto_test_accepted_"+aid).userId,RESIDENT);
    assert.equal(db.get("adminActivityLogs/auto_test_decision_"+aid).action,
      "Synthetic Volunteer Accepted");
    const priorNoticeCount=db.list("notifications/").length;
    const replay=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{caseId:FRESH_ID,decision:"accepted"}
    });
    assert.equal(replay.body.status,"already_accepted");
    assert.equal(db.list("notifications/").length,priorNoticeCount);
    const refuseReissue=await req("/api/admin/emergency-auto/e2e-002/reissue",{
      method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmReissue:true}
    });
    assert.equal(refuseReissue.code,409);
    assert.equal(refuseReissue.body.error,"cannot_reset_accepted_task");
    assert.deepEqual(db.get("disasterCases/"+FIXED_ID),previous);
  });
});

test("staging 002: busy accepted 001 responder excluded from readiness; no invented test accounts",async()=>{
  const db=new FakeDb();
  seedAccounts(db);
  db.seed("disasterCases/"+FIXED_ID,{
    title:"TEST ONLY - Dummy Emergency",reporterUid:RESIDENT,
    status:"assigned",verificationStatus:"validated"
  });
  db.seed("responseAssignments/"+FIXED_ID+"_"+VOL,{
    caseId:FIXED_ID,volunteerId:VOL,status:"accepted"
  });
  await serve(db,async({req})=>{
    await req("/api/admin/emergency-auto/e2e-002/create",{
      method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}
    });
    await req("/api/admin/emergency-auto/e2e-002/validate",{
      method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}
    });
    const readiness=await req("/api/admin/emergency-auto/e2e-002/preflight",
      {who:ADMIN});
    assert.equal(readiness.body.status,"blocked");
    assert.equal(readiness.body.reason,"no_free_approved_test_volunteer");
    assert.equal(db.list("responseAssignments/"+FRESH_ID+"_").length,0);
    assert.equal(db.get("responseAssignments/"+FIXED_ID+"_"+VOL).status,"accepted");
  });
});

test("staging 002: decline allows controlled new offer while 001 remains independent",async()=>{
  const db=new FakeDb();seedAccounts(db);
  db.seed("disasterCases/"+FIXED_ID,{
    title:"TEST ONLY - Dummy Emergency",reporterUid:RESIDENT,
    status:"assigned",verificationStatus:"validated"
  });
  await serve(db,async({req})=>{
    for(const method of ["create","validate"]){
      const response=await req("/api/admin/emergency-auto/e2e-002/"+method,{
        method:"POST",who:ADMIN,
        body:{caseId:FRESH_ID,confirmFictionalTest:true}
      });
      assert.equal(response.code,200);
    }
    await req("/api/admin/emergency-auto/start",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID}
    });
    const aid=FRESH_ID+"_"+VOL;
    const decline=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{caseId:FRESH_ID,decision:"declined"}
    });
    assert.equal(decline.code,200);
    assert.equal(db.get("notifications/auto_test_declined_"+aid).userId,ADMIN);
    assert.equal(db.get("responderLocks/"+VOL),undefined);
    const noConsent=await req("/api/admin/emergency-auto/e2e-002/reissue",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID}
    });
    assert.equal(noConsent.code,400);
    const reissue=await req("/api/admin/emergency-auto/e2e-002/reissue",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID,confirmReissue:true}
    });
    assert.equal(reissue.code,200);
    assert.equal(reissue.body.action,"offered");
    assert.equal(db.get("responseAssignments/"+aid).status,"offered");
    assert.equal(db.get("notifications/auto_test_declined_"+aid),undefined);
    assert.equal(db.get("disasterCases/"+FIXED_ID).status,"assigned");
  });
});


test("staging 002 protection: arbitrary case IDs and lookalike reports never send offers",async()=>{
  const {titleForCase}=require("./stagingVolunteerTask");
  assert.equal(titleForCase("constructor"),null);
  assert.equal(titleForCase("__proto__"),null);
  assert.equal(titleForCase("STAGING_E2E_003"),null);
  const db=new FakeDb();seedAccounts(db);
  db.seed("disasterCases/"+FIXED_ID,{
    title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",reporterUid:RESIDENT
  });
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",
    status:"validated",verificationStatus:"validated",dispatchBlocked:false,
    reporterUid:RESIDENT,validatedBy:ADMIN,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    testOnly:false,source:"staging_synthetic_e2e",
    testCategory:"staging_synthetic_volunteer_e2e_002"
  });
  await serve(db,async({req})=>{
    const spoof=await req("/api/admin/emergency-auto/start",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID}
    });
    assert.equal(spoof.code,409,"Lookalike report without testOnly flag is denied");
    const unknown=await req("/api/admin/emergency-auto/start",{
      method:"POST",who:ADMIN,body:{caseId:"constructor"}
    });
    assert.equal(unknown.code,403);
    const task=await req("/api/staging/volunteer/task?caseId=constructor",{who:VOL});
    assert.equal(task.code,403);
    const bogus=await req("/api/staging/volunteer/respond",{
      method:"POST",who:VOL,body:{caseId:"STAGING_E2E_003",decision:"accepted"}
    });
    assert.equal(bogus.code,403);
    assert.equal(db.list("responseAssignments/").length,0);
  });
});


test("isolated bulk preview returns all approved same-wave Volunteer counts, no Firestore writes",async()=>{
  const db=new FakeDb();
  seedAccounts(db);
  for(const uid of ["qaSecond","qaThird"]){
    db.seed("users/"+uid,{role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,barangay:"Bagong Buhay I",
      skills:["First Aid"]});
    db.seed("volunteerApplications/"+uid,{
      uid,status:"approved",skills:["First Aid"]
    });
  }
  const fixture={
    title:"TEST ONLY - Fresh Volunteer E2E 002",
    testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",
    status:"validated",verificationStatus:"validated",
    validatedBy:ADMIN,reporterUid:RESIDENT,dispatchBlocked:false,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"]
  };
  db.seed("disasterCases/"+FRESH_ID,fixture);
  await serve(db,async({req})=>{
    const uri="/api/admin/emergency-auto/e2e-002/bulk-preview";
    const unauthorized=await req(uri);
    assert.equal(unauthorized.code,401);
    const wrongRole=await req(uri,{who:RESIDENT});
    assert.equal(wrongRole.code,403);
    const before=JSON.stringify([...db.docs.entries()]);
    const preview=await req(uri,{who:ADMIN});
    assert.equal(preview.code,200);
    assert.equal(preview.body.status,"offer_all");
    assert.equal(preview.body.wave,1);
    assert.equal(preview.body.eligibleInSelectedWave,3);
    assert.equal(preview.body.willSendOffers,false);
    assert.equal(JSON.stringify([...db.docs.entries()]),before);
    assert.equal(db.list("responseAssignments/").length,0);
    assert.equal(db.list("notifications/").length,0);
  });
});


test("fixed fictional 002 atomic wave offers EVERY eligible Volunteer, each may independently Accept or Decline",async()=>{
  const {startBatchOffers,getBatchOffer,respondBatchOffer,batchStatus}
    =require("./stagingBulkVolunteerOffers");
  const db=new FakeDb();seedAccounts(db);
  for(const uid of ["qaSecond","qaThird"]){
    db.seed("users/"+uid,{
      role:"volunteer",status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityVerified:true,
      barangay:"Bagong Buhay I",skills:["First Aid"]});
    db.seed("volunteerApplications/"+uid,{uid,status:"approved",skills:["First Aid"]});
  }
  db.seed("disasterCases/"+FIXED_ID,{title:"TEST ONLY - Dummy Emergency",
    status:"assigned",verificationStatus:"validated",
    activeVolunteerSupportAssignmentId:FIXED_ID+"_priorResponder"});
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",testOnly:true,
    testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",
    status:"validated",verificationStatus:"validated",
    validatedBy:ADMIN,reporterUid:RESIDENT,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    dispatchBlocked:false
  });
  const prior=JSON.stringify(db.get("disasterCases/"+FIXED_ID));
  const batch=await startBatchOffers(db,ADMIN,Date.now());
  assert.equal(batch.status,"offered");
  assert.equal(batch.offered,3);
  assert.equal(batch.wave,1);
  const offers=db.list("responseAssignments/");
  assert.equal(offers.length,3);
  assert.equal(db.list("notifications/").length,3);
  assert.equal(db.list("adminActivityLogs/").length,3);
  assert.equal(db.list("autoVolunteerReservations/").length,3);
  const repeat=await startBatchOffers(db,ADMIN);
  assert.equal(repeat.status,"already_started");
  assert.equal(db.list("responseAssignments/").length,3);
  assert.equal((await getBatchOffer(db,"qaVolunteer")).status,"offered");
  assert.equal((await getBatchOffer(db,"qaSecond")).status,"offered");
  assert.equal((await getBatchOffer(db,"differentUser")).status,"not_offered");
  const accept=await respondBatchOffer(db,"qaVolunteer","accepted");
  assert.equal(accept.status,"accepted");
  const second=await respondBatchOffer(db,"qaSecond","declined");
  assert.equal(second.status,"declined");
  assert.equal((await respondBatchOffer(db,"qaVolunteer","accepted")).status,"already_accepted");
  assert.equal((await respondBatchOffer(db,"qaVolunteer","declined")).status,"blocked");
  assert.equal(db.get("responderLocks/qaVolunteer").assignmentId,FRESH_ID+"_qaVolunteer");
  assert.equal(db.get("responderLocks/qaSecond"),undefined);
  assert.equal(db.get("autoVolunteerReservations/qaSecond"),undefined);
  assert.equal(db.get("notifications/auto_batch_accepted_"+FRESH_ID+"_qaVolunteer").userId,RESIDENT);
  assert.equal(db.get("notifications/auto_batch_declined_"+FRESH_ID+"_qaSecond").userId,ADMIN);
  const s=await batchStatus(db);
  assert.deepEqual({offered:s.offered,pending:s.pending,accepted:s.accepted,declined:s.declined},
    {offered:3,pending:1,accepted:1,declined:1});
  assert.equal(JSON.stringify(db.get("disasterCases/"+FIXED_ID)),prior);
});
test("bulk staging fails closed for non-002 reports, existing single offers and conflicting reservation",async()=>{
  const {startBatchOffers}=require("./stagingBulkVolunteerOffers");
  const db=new FakeDb();seedAccounts(db);
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",
    testOnly:false,status:"validated",verificationStatus:"validated",
    reporterUid:RESIDENT,validatedBy:ADMIN,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"]
  });
  assert.equal((await startBatchOffers(db,ADMIN)).status,"blocked");
  assert.equal(db.list("responseAssignments/").length,0);
  db.seed("disasterCases/"+FRESH_ID,{
    ...db.get("disasterCases/"+FRESH_ID),
    testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e"
  });
  db.seed("emergencyAutoDispatch/"+FRESH_ID,{status:"waiting"});
  assert.equal((await startBatchOffers(db,ADMIN)).reason,"existing_single_or_manual_offer");
  db.docs.delete("emergencyAutoDispatch/"+FRESH_ID);
  db.seed("autoVolunteerReservations/qaVolunteer",{assignmentId:"other_case"});
  const r=await startBatchOffers(db,ADMIN);
  assert.equal(r.status,"blocked");
  assert.equal(r.reason,"candidate_busy_or_conflicting_records");
  assert.equal(db.list("responseAssignments/").length,0);
  assert.equal(db.list("notifications/").length,0);
});


test("HTTP staging-only bulk E2E offers all eligible, with independently authorized Volunteer Accept/Decline",async()=>{
  const db=new FakeDb();seedAccounts(db);
  db.seed("users/qaSecond",{role:"volunteer",status:"approved",
    volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
    barangay:"Bagong Buhay I",skills:["First Aid"]});
  db.seed("volunteerApplications/qaSecond",{uid:"qaSecond",status:"approved",skills:["First Aid"]});
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",
    testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",status:"validated",
    verificationStatus:"validated",validatedBy:ADMIN,reporterUid:RESIDENT,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    dispatchBlocked:false
  });
  const endpoint="/api/admin/emergency-auto/e2e-002/bulk-send";
  await serve(db,async({req})=>{
    const base={caseId:FRESH_ID,confirmAllEligibleTestOffers:true};
    assert.equal((await req(endpoint,{method:"POST",body:base})).code,401);
    assert.equal((await req(endpoint,{method:"POST",who:RESIDENT,body:base})).code,403);
    assert.equal((await req(endpoint,{method:"POST",who:ADMIN,body:{caseId:FRESH_ID}})).code,400);
    assert.equal(db.list("responseAssignments/").length,0);
    const sent=await req(endpoint,{method:"POST",who:ADMIN,body:base});
    assert.equal(sent.code,200);assert.equal(sent.body.offered,2);
    const attemptLegacy=await req("/api/admin/emergency-auto/start",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID}});
    assert.equal(attemptLegacy.code,409);
    const outsider=await req("/api/staging/volunteer/e2e-002/bulk-task",{who:RESIDENT});
    assert.equal(outsider.code,403);
    for(const who of [VOL,"qaSecond"]){
      const v=await req("/api/staging/volunteer/e2e-002/bulk-task",{who});
      assert.equal(v.code,200);assert.equal(v.body.status,"offered");
      assert.equal(v.body.canRespond,true);
    }
    const accept=await req("/api/staging/volunteer/e2e-002/bulk-respond",{
      method:"POST",who:VOL,body:{decision:"accepted"}});
    assert.equal(accept.code,200);
    const decline=await req("/api/staging/volunteer/e2e-002/bulk-respond",{
      method:"POST",who:"qaSecond",body:{decision:"declined"}});
    assert.equal(decline.code,200);
    const stats=await req("/api/admin/emergency-auto/e2e-002/bulk-status",{who:ADMIN});
    assert.equal(stats.code,200);
    assert.deepEqual([stats.body.offered,stats.body.accepted,stats.body.declined],
      [2,1,1]);
    const repeat=await req("/api/staging/volunteer/e2e-002/bulk-respond",{
      method:"POST",who:VOL,body:{decision:"accepted"}});
    assert.equal(repeat.body.status,"already_accepted");
  },{VOLUNSERVE_STAGING_E2E_002_BULK:"enabled"});
});
test("bulk test OFF by default, even for approved staging Admin",async()=>{
  const db=new FakeDb();seedAccounts(db);
  await serve(db,async({req})=>{
    const result=await req("/api/admin/emergency-auto/e2e-002/bulk-send",{
      method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmAllEligibleTestOffers:true}});
    assert.equal(result.code,503);
    assert.equal(result.body.error,"isolated_bulk_staging_disabled");
    assert.equal(db.list("responseAssignments/").length,0);
  });
});


test("explicit Admin validation automatically offers to EVERY eligible staging 002 Volunteer only with both safe flags",async()=>{
  const db=new FakeDb();seedAccounts(db);
  for(const uid of ["qaSecond","qaThird"]){
    db.seed("users/"+uid,{
      role:"volunteer",status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityVerified:true,
      barangay:"Bagong Buhay I",skills:["First Aid"],fullName:"Staging "+uid
    });
    db.seed("volunteerApplications/"+uid,{uid,status:"approved",skills:["First Aid"]});
  }
  const previous={
    title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",reporterUid:RESIDENT,
    activeVolunteerSupportAssignmentId:FIXED_ID+"_old",
    autoVolunteerDispatch:{state:"accepted"}
  };
  db.seed("disasterCases/"+FIXED_ID,previous);
  await serve(db,async({req})=>{
    const url="/api/admin/emergency-auto/e2e-002/";
    assert.equal((await req(url+"create",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID,confirmFictionalTest:true}
    })).body.status,"created");
    const attempted=await req(url+"validate",{
      method:"POST",who:RESIDENT,body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(attempted.code,403);
    assert.equal(db.list("responseAssignments/").length,0);
    const val=await req(url+"validate",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(val.code,200);
    assert.equal(val.body.status,"validated");
    assert.deepEqual(val.body.automaticOffers,{
      status:"offered",wave:1,offered:3,
      expiresAtMs:val.body.automaticOffers.expiresAtMs,fullWaveAtomic:true
    });
    assert.equal(db.list("responseAssignments/").length,3);
    assert.equal(db.list("notifications/auto_response_"+FRESH_ID+"_").length,3);
    assert.equal(db.list("adminActivityLogs/auto_offer_"+FRESH_ID+"_").length,3);
    assert.deepEqual(db.get("disasterCases/"+FIXED_ID),previous);
    const repeat=await req(url+"validate",{
      method:"POST",who:ADMIN,body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(repeat.code,409); // Existing assignment cannot be revalidated.
    assert.equal(db.list("responseAssignments/").length,3);
    const tasks=await req("/api/admin/emergency-auto/e2e-002/bulk-status",{who:ADMIN});
    assert.equal(tasks.body.offered,3);
    for(const who of [VOL,"qaSecond","qaThird"]){
      const item=await req("/api/staging/volunteer/e2e-002/bulk-task",{who});
      assert.equal(item.body.status,"offered");
    }
  },{
    VOLUNSERVE_STAGING_E2E_002_BULK:"enabled",
    VOLUNSERVE_STAGING_E2E_002_AUTO_AFTER_VALIDATION:"enabled"
  });
});
test("auto-on-validation is OFF by default even when bulk status test feature is enabled",async()=>{
  const db=new FakeDb();seedAccounts(db);
  db.seed("disasterCases/"+FIXED_ID,{
    title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",reporterUid:RESIDENT
  });
  await serve(db,async({req})=>{
    const url="/api/admin/emergency-auto/e2e-002/";
    await req(url+"create",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    const response=await req(url+"validate",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(response.body.status,"validated");
    assert.equal(response.body.automaticOffers.status,"disabled");
    assert.equal(db.list("responseAssignments/").length,0);
  },{VOLUNSERVE_STAGING_E2E_002_BULK:"enabled"});
});


test("validated fictional report remains validated, but reports blocked automatic matching when every Volunteer is busy",async()=>{
  const db=new FakeDb();seedAccounts(db);
  db.seed("disasterCases/"+FIXED_ID,{
    title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",reporterUid:RESIDENT
  });
  db.seed("responseAssignments/OTHER_BUSY_CASE_"+VOL,{
    caseId:"OTHER_BUSY_CASE",volunteerId:VOL,status:"accepted"
  });
  await serve(db,async({req})=>{
    const url="/api/admin/emergency-auto/e2e-002/";
    assert.equal((await req(url+"create",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}})).body.status,"created");
    const result=await req(url+"validate",{method:"POST",who:ADMIN,
      body:{caseId:FRESH_ID,confirmFictionalTest:true}});
    assert.equal(result.code,200);
    assert.equal(result.body.status,"validated");
    assert.equal(result.body.automaticOffers.status,"blocked");
    assert.equal(db.get("disasterCases/"+FRESH_ID).status,"validated");
    assert.equal(db.get("emergencyAutoDispatchBatches/"+FRESH_ID),undefined);
    assert.equal(db.list("responseAssignments/"+FRESH_ID+"_").length,0);
  },{
    VOLUNSERVE_STAGING_E2E_002_BULK:"enabled",
    VOLUNSERVE_STAGING_E2E_002_AUTO_AFTER_VALIDATION:"enabled"
  });
});


test("staging 002 auto progression offers ALL same wave candidates then Wave 2 after expiry, never reissues Wave 1",async()=>{
  const {startBatchOffers,respondBatchOffer,batchStatus}=require("./stagingBulkVolunteerOffers");
  const {advanceBatchWave}=require("./stagingBulkWaveAdvance");
  const db=new FakeDb();seedAccounts(db);
  for(const [uid,barangay] of [["qaSecond","Bagong Buhay I"],["qaThird","Bagong Buhay II"],["qaOtherVolunteer","San Manuel"]]){
    db.seed("users/"+uid,{role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
      barangay,skills:["First Aid"],fullName:"QA "+uid});
    db.seed("volunteerApplications/"+uid,{uid,status:"approved",skills:["First Aid"]});
  }
  db.seed("systemSettings/emergencyVolunteerMatching",{
    enabled:true,approved:true,neighborsByBarangay:{"Bagong Buhay I":["Bagong Buhay II"]}
  });
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",testOnly:true,
    testCategory:"staging_synthetic_volunteer_e2e_002",source:"staging_synthetic_e2e",
    status:"validated",verificationStatus:"validated",
    validatedBy:ADMIN,reporterUid:RESIDENT,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],dispatchBlocked:false
  });
  const startAt=Date.now();
  const created=await startBatchOffers(db,ADMIN,startAt);
  assert.equal(created.status,"offered");assert.equal(created.wave,1);
  assert.equal(created.offered,2);
  const waiting=await advanceBatchWave(db,startAt+10000);
  assert.equal(waiting.status,"waiting");
  assert.equal(db.list("responseAssignments/").length,2);
  const first=await respondBatchOffer(db,VOL,"declined",startAt+20000);
  assert.equal(first.status,"declined");
  const expired=await advanceBatchWave(db,startAt+180001);
  assert.equal(expired.status,"offered");
  assert.equal(expired.wave,2);assert.equal(expired.offered,1);
  assert.equal(db.get("responseAssignments/"+FRESH_ID+"_qaSecond").status,"expired");
  assert.equal(db.get("responseAssignments/"+FRESH_ID+"_qaThird").status,"offered");
  assert.equal(db.get("autoVolunteerReservations/qaSecond"),undefined);
  assert.equal(db.list("responseAssignments/").length,3);
  assert.equal((await advanceBatchWave(db,startAt+180010)).status,"waiting");
  const two=await respondBatchOffer(db,"qaThird","declined",startAt+181000);
  assert.equal(two.status,"declined");
  const city=await advanceBatchWave(db,startAt+182000);
  assert.equal(city.status,"offered");assert.equal(city.wave,3);
  assert.equal(city.offered,1);
  assert.equal(db.list("responseAssignments/").length,4);
  const end=await advanceBatchWave(db,startAt+182001);
  assert.equal(end.status,"waiting");
  const declined=await respondBatchOffer(db,"qaOtherVolunteer","declined",startAt+182050);
  assert.equal(declined.status,"declined");
  const exhausted=await advanceBatchWave(db,startAt+182060);
  assert.equal(exhausted.status,"exhausted");
  assert.equal(db.get("disasterCases/"+FRESH_ID).status,"validated");
  assert.equal(db.get("emergencyAutoDispatchBatches/"+FRESH_ID).status,"exhausted");
  assert.equal((await advanceBatchWave(db,startAt+182080)).status,"exhausted");
  assert.equal(db.list("responseAssignments/").length,4);
});
test("staging 002 does NOT advance any wave after acceptance, even if other offers expired",async()=>{
  const {startBatchOffers,respondBatchOffer}=require("./stagingBulkVolunteerOffers");
  const {advanceBatchWave}=require("./stagingBulkWaveAdvance");
  const db=new FakeDb();seedAccounts(db);
  db.seed("users/qaSecond",{role:"volunteer",status:"approved",
    volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
    barangay:"San Manuel",skills:["First Aid"]});
  db.seed("volunteerApplications/qaSecond",{uid:"qaSecond",status:"approved",skills:["First Aid"]});
  db.seed("disasterCases/"+FRESH_ID,{
    title:"TEST ONLY - Fresh Volunteer E2E 002",
    testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",status:"validated",verificationStatus:"validated",
    reporterUid:RESIDENT,validatedBy:ADMIN,
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"]
  });
  const now=Date.now();
  assert.equal((await startBatchOffers(db,ADMIN,now)).wave,1);
  assert.equal((await respondBatchOffer(db,VOL,"accepted",now+10000)).status,"accepted");
  const result=await advanceBatchWave(db,now+3600000);
  assert.equal(result.status,"supported");
  assert.equal(db.get("responseAssignments/"+FRESH_ID+"_qaSecond"),undefined);
  assert.equal(db.get("responderLocks/"+VOL).caseId,FRESH_ID);
  assert.equal(db.get("emergencyAutoDispatchBatches/"+FRESH_ID).wave,1);
});
test("staging wave advancement fails closed for missing or non-fictional 002 batch",async()=>{
  const {advanceBatchWave}=require("./stagingBulkWaveAdvance");
  const db=new FakeDb();
  const res=await advanceBatchWave(db);
  assert.equal(res.status,"blocked");assert.equal(res.reason,"not_isolated_batch_002");
  db.seed("disasterCases/"+FRESH_ID,{
    title:"Real emergency",status:"assigned",verificationStatus:"validated"
  });
  db.seed("emergencyAutoDispatchBatches/"+FRESH_ID,{status:"waiting",wave:1});
  assert.equal((await advanceBatchWave(db)).status,"blocked");
  assert.equal(db.list("notifications/").length,0);
});
