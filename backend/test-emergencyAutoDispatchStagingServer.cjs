"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {makeApp}=require("./emergencyAutoDispatchStagingServer");

async function withServer({admin=true,validToken=true,enabled=false}={},run) {
  const calls=[];
  const worker={
    config:{onDemandReady:enabled,ready:false},
    requestStart:async(caseId)=>{calls.push(["start",caseId]);return {action:"offered"};},
    requestDisable:async(caseId)=>{calls.push(["disable",caseId]);return {action:"disabled"};},
  };
  const authClient={verifyIdToken:async()=>validToken?{uid:"admin1"}:(()=>{
    throw Error("test-invalid-token");
  })()};
  const firestore={collection(name){
    if(name==="disasterCases")return {doc(id){
      assert.equal(id,"STAGING_TEST_001");
      return {get:async()=>({exists:true,data:()=>({
        title:"TEST ONLY - Dummy Emergency",status:"validated",
        verificationStatus:"validated",dispatchBlocked:false,
        reporterUid:"resident1",validatedBy:"admin1",requiredSkills:["First Aid"]
      })})};
    }};
    assert.equal(name,"users");
    return {doc(uid){
      assert.equal(uid,"admin1");
      return {get:async()=>({exists:true,
        data:()=>admin?{role:"admin",status:"approved"}:{role:"resident",status:"approved"}})};
    }};
  }};
  const app=makeApp({authClient,firestore,worker,env:{}});
  const server=app.listen(0,"127.0.0.1");
  try {
    await new Promise((resolve,reject)=>{if(server.listening)resolve();
      else {server.once("listening",resolve);server.once("error",reject);}
    });
    return await run({url:"http://127.0.0.1:"+server.address().port,calls});
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
test("isolated staging service reports disabled Free worker without starting jobs",()=>withServer({},async({url})=>{
  const r=await fetch(url+"/health");
  const data=await r.json();
  assert.equal(r.status,200);
  assert.equal(data.matchingEnabled,false);
  assert.equal(data.backgroundMatchingEnabled,false);
  assert.equal(data.officialEmergencyDispatch,false);
  assert.equal(data.stagingServiceAccountMatches,false);
  assert.equal(data.stagingFirestoreReadStatus,"not_configured");
}));
test("no token, invalid token and Resident cannot submit Volunteer offers",async()=>{
  await withServer({enabled:true},async({url,calls})=>{
    const r=await fetch(url+"/api/admin/emergency-auto/start",{method:"POST",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({caseId:"case1"})});
    assert.equal(r.status,401);assert.deepEqual(calls,[]);
  });
  await withServer({enabled:true,validToken:false},async({url,calls})=>{
    const r=await fetch(url+"/api/admin/emergency-auto/start",{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer invalid-token"},
      body:JSON.stringify({caseId:"case1"})});
    assert.equal(r.status,401);assert.deepEqual(calls,[]);
  });
  await withServer({enabled:true,admin:false},async({url,calls})=>{
    const r=await fetch(url+"/api/admin/emergency-auto/start",{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer demo-token"},
      body:JSON.stringify({caseId:"case1"})});
    assert.equal(r.status,403);assert.deepEqual(calls,[]);
  });
});
test("Free preview refuses any matching until separate staging project is approved",()=>withServer({},async({url,calls})=>{
  const r=await fetch(url+"/api/admin/emergency-auto/start",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer demo-token"},
    body:JSON.stringify({caseId:"case1"})});
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,"isolated_staging_not_configured");
  assert.deepEqual(calls,[]);
}));
test("approved Admin can explicitly start or disable only an eligible case ID",()=>withServer({enabled:true},async({url,calls})=>{
  const headers={"Content-Type":"application/json",Authorization:"Bearer demo-token"};
  const request=(method,body)=>fetch(url+"/api/admin/emergency-auto/"+method,
    {method:"POST",headers,body:JSON.stringify(body)});
  let r=await request("start",{caseId:"STAGING_TEST_001"});
  assert.equal(r.status,200);assert.equal((await r.json()).action,"offered");
  r=await request("disable",{caseId:"STAGING_TEST_001"});
  assert.equal(r.status,200);assert.equal((await r.json()).action,"disabled");
  r=await request("start",{caseId:"../../other"});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,"only_fixed_staging_test_case_allowed");
  assert.deepEqual(calls,[["start","STAGING_TEST_001"],["disable","STAGING_TEST_001"]]);
}));


test("synthetic demo uses the real eligibility planner without Firebase writes or production data",()=>withServer({},async({url,calls})=>{
  const page=await fetch(url+"/demo");assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/SYNTHETIC STAGING DEMO/);
  assert.match(html,/No real reports, Firestore writes/);
  const r=await fetch(url+"/demo-data");assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.mode,"synthetic");
  assert.equal(data.doesNotSendOffers,true);
  assert.equal(data.counts.reviewed,4);
  assert.equal(data.counts.wave1,2);
  assert.equal(data.counts.wave2,0);
  assert.equal(data.counts.wave3,1);
  assert.equal(data.counts.excluded,1);
  assert.deepEqual(calls,[]);
}));

test("staging frontend refuses production Firebase Auth in automatic match flow",()=>{
  const fs=require("node:fs");
  const source=fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
  assert.match(source,/EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_PROJECT_ID/);
  assert.ok(source.includes('selectedProject === "volunserve-3aa5b"'));
  assert.ok(source.includes("authProject !== selectedProject"));
  assert.ok(source.includes("volunserve-emergency-match-staging-free.onrender.com"));
});

test("matching stays disabled while staging Firestore credentials pass a single read-only probe",async()=>{
  const projectId="volunserve-isolated-test-project";
  let reads=0;
  const firestore={collection(collection){
    assert.equal(collection,"systemSettings");
    return {doc(document){
      assert.equal(document,"emergencyVolunteerMatching");
      return {get:async()=>{reads++;return {exists:false};}};
    }};
  }};
  const app=makeApp({
    firestore,worker:{config:{onDemandReady:false}},
    env:{VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:projectId,
      FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:projectId})},
  });
  const server=app.listen(0,"127.0.0.1");
  try {
    await new Promise((resolve,reject)=>{
      if(server.listening)resolve();
      else {server.once("listening",resolve);server.once("error",reject);}
    });
    await new Promise(resolve=>setImmediate(resolve));
    const base="http://127.0.0.1:"+server.address().port;
    const first=await (await fetch(base+"/health")).json();
    const second=await (await fetch(base+"/health")).json();
    assert.equal(first.stagingServiceAccountMatches,true);
    assert.equal(first.stagingFirestoreReadStatus,"verified");
    assert.equal(first.matchingEnabled,false);
    assert.equal(first.backgroundMatchingEnabled,false);
    assert.equal(second.stagingFirestoreReadStatus,"verified");
    assert.equal(reads,1,"health checks must not repeatedly query Firestore");
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});


test("isolated read-only preflight recognizes eligible synthetic case without writes",async()=>{
  const {inspectStagingTestCase}=require("./emergencyStagingReadiness");
  const incident={title:"TEST ONLY - Dummy Emergency",status:"validated",
    verificationStatus:"validated",validatedBy:"fakeAdmin",reporterUid:"fakeResident",
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],dispatchBlocked:false};
  const users={
    fakeAdmin:{role:"admin",status:"approved"},
    fakeResident:{role:"resident",status:"approved"},
    fakeVolunteer:{role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
      barangay:"Bagong Buhay I"}
  };
  const application={uid:"fakeVolunteer",status:"approved",skills:["First Aid"]};
  let reads=0;
  const db={
    collection(name){
      if(name==="volunteerApplications"){
        return {
          where(field,operator,value){
            assert.deepEqual([field,operator,value],["status","==","approved"]);
            return {
              limit(n){
                assert.equal(n,201);
                return {
                  async get(){
                    reads++;
                    return {size:1,docs:[{id:"fakeVolunteer",data:()=>application}]};
                  }
                };
              }
            };
          }
        };
      }
      return {
        doc(id){
          return {
            async get(){
              reads++;
              if(name==="disasterCases"){
                assert.equal(id,"STAGING_TEST_001");
                return {exists:true,data:()=>incident};
              }
              assert.equal(name,"users");
              return {exists:!!users[id],data:()=>users[id]};
            }
          };
        }
      };
    }
  };
  const result=await inspectStagingTestCase(db);
  assert.deepEqual(result,{status:"ready",reason:"eligible_synthetic_case_no_write",eligible:1,wave:1});
  assert.equal(reads,5);
});

test("read-only staging preflight refuses unrecognized real incident",async()=>{
  const {inspectStagingTestCase}=require("./emergencyStagingReadiness");
  const db={collection(name){
    assert.equal(name,"disasterCases");
    return {doc(id){
      assert.equal(id,"STAGING_TEST_001");
      return {get:async()=>({
        exists:true,data:()=>({title:"Real emergency",status:"validated"})
      })};
    }};
  }};
  const r=await inspectStagingTestCase(db);
  assert.equal(r.status,"blocked");
  assert.equal(r.reason,"not_a_recognized_dummy_case");
});


test("staging login requires explicit confirmation for isolated test-only offer",()=>withServer({},async({url,calls})=>{
  const response=await fetch(url+"/staging-login");
  assert.equal(response.status,200);
  assert.equal(response.headers.get("x-frame-options"),"DENY");
  const html=await response.text();
  assert.match(html,/Staging Admin Login Check/);
  assert.match(html,/signInWithEmailAndPassword/);
  assert.match(html,/inMemoryPersistence/);
  assert.match(html,/volunserve-volunteer-staging/);
  assert.match(html,/api\/admin\/emergency-auto\/status/);
  assert.ok(!html.includes("volunserve-3aa5b"));
  assert.ok(!html.includes("FIREBASE_SERVICE_ACCOUNT_JSON"));
  assert.ok(html.includes("api/admin/emergency-auto/start"));
  assert.ok(html.includes("STAGING_TEST_001"));
  assert.ok(html.includes("window.confirm"));
  assert.ok(html.includes("startTest.disabled"));
  assert.ok(!html.includes("volunserve.com/api"));
  assert.deepEqual(calls,[],"Loading login must not dispatch offers");
}));


test("browser same-origin POST is allowed while foreign origins are denied",()=>withServer({enabled:true},async({url,calls})=>{
  const ownOrigin="https://volunserve-emergency-match-staging-free.onrender.com";
  const headers={"Content-Type":"application/json","Authorization":"Bearer test-token","Origin":ownOrigin};
  let r=await fetch(url+"/api/admin/emergency-auto/start",{
    method:"POST",headers,body:JSON.stringify({caseId:"STAGING_TEST_001"})
  });
  assert.equal(r.status,200);
  assert.equal(r.headers.get("access-control-allow-origin"),ownOrigin);
  assert.equal((await r.json()).action,"offered");
  r=await fetch(url+"/api/admin/emergency-auto/start",{
    method:"POST",headers:{...headers,Origin:"https://other.example"},
    body:JSON.stringify({caseId:"STAGING_TEST_001"})
  });
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,"staging_request_blocked");
  assert.deepEqual(calls,[["start","STAGING_TEST_001"]]);
  // Only the dedicated, isolated staging UI is additionally allowed.
  const reviewOrigin="https://volunserve-auto-volunteer-ui-staging.onrender.com";
  r=await fetch(url+"/api/admin/emergency-auto/start",{
    method:"OPTIONS",headers:{Origin:reviewOrigin,
      "Access-Control-Request-Method":"POST",
      "Access-Control-Request-Headers":"authorization,content-type"}
  });
  assert.equal(r.status,204);
  assert.equal(r.headers.get("access-control-allow-origin"),reviewOrigin);
  // Production and unrelated origins MUST NOT be allowlisted.
  r=await fetch(url+"/api/admin/emergency-auto/start",{
    method:"OPTIONS",headers:{Origin:"https://volunserve.com",
      "Access-Control-Request-Method":"POST",
      "Access-Control-Request-Headers":"authorization,content-type"}
  });
  assert.notEqual(r.headers.get("access-control-allow-origin"),"https://volunserve.com");
  r=await fetch(url+"/api/admin/emergency-auto/start",{
    method:"OPTIONS",headers:{Origin:ownOrigin,
      "Access-Control-Request-Method":"POST",
      "Access-Control-Request-Headers":"authorization,content-type"}
  });
  assert.equal(r.status,204);
  assert.equal(r.headers.get("access-control-allow-origin"),ownOrigin);
}));


test("dedicated Volunteer page is served without admin credentials or private keys",()=>withServer({},async({url})=>{
  const response=await fetch(url+"/staging-volunteer");
  assert.equal(response.status,200);
  assert.equal(response.headers.get("x-frame-options"),"DENY");
  const html=await response.text();
  assert.match(html,/Volunteer Task Acceptance/);
  assert.match(html,/signInWithEmailAndPassword/);
  assert.match(html,/inMemoryPersistence/);
  assert.match(html,/api\/staging\/volunteer\/task/);
  assert.match(html,/api\/staging\/volunteer\/respond/);
  assert.ok(!html.includes("volunserve-3aa5b"));
  assert.ok(!html.includes("FIREBASE_SERVICE_ACCOUNT_JSON"));
}));
test("staging Volunteer acceptance and decline are atomic, isolated, and expire safely",async()=>{
  const {getVolunteerOffer,respondToStagingOffer,resetExpiredFixture,
    inspectStagingAssignmentConsistency}=require("./stagingVolunteerTask");
  const uid="testVolunteer",id="STAGING_TEST_001_"+uid,caseId="STAGING_TEST_001";
  const now=Date.now();
  class FakeDoc {
    constructor(collection,id,data){this.collection=collection;this.id=id;this.value=data;this.exists=data!==undefined;}
    data(){return this.value;}
  }
  class FakeStore {
    constructor(){this.map=new Map();}
    collection(name){return {doc:id=>({path:name+"/"+id,get:async()=>this.snap(name+"/"+id)})};}
    snap(key){const value=this.map.get(key);const slash=key.indexOf("/");
      return new FakeDoc(key.slice(0,slash),key.slice(slash+1),value);
    }
    seed(key,value){this.map.set(key,value);}
    async runTransaction(callback){
      const operations=[],tx={
        get:ref=>ref.get(),
        update:(ref,value)=>operations.push(["update",ref.path,value]),
        set:(ref,value)=>operations.push(["set",ref.path,value]),
        create:(ref,value)=>operations.push(["create",ref.path,value]),
        delete:ref=>operations.push(["delete",ref.path])
      };
      const answer=await callback(tx);
      for(const [kind,key,value] of operations){
        if(kind==="delete"){this.map.delete(key);continue;}
        if(kind==="create")assert.equal(this.map.has(key),false,"duplicate create");
        if(kind==="update")assert.equal(this.map.has(key),true,"missing update");
        this.map.set(key,kind==="update"?{...this.map.get(key),...value}:value);
      }
      return answer;
    }
  }
  function fixture(store,expireAt){
    store.seed("disasterCases/"+caseId,{title:"TEST ONLY - Dummy Emergency",
      status:"assigned",verificationStatus:"validated",reporterUid:"testResident",
      validatedBy:"testAdmin",activeVolunteerSupportAssignmentId:id});
    store.seed("emergencyAutoDispatch/"+caseId,{
      status:"waiting",assignmentId:id,volunteerId:uid,expiresAtMs:expireAt,wave:1
    });
    store.seed("responseAssignments/"+id,{
      status:"offered",caseId,volunteerId:uid,createdBy:"automatic_matching_engine"
    });
    store.seed("autoVolunteerReservations/"+uid,{assignmentId:id,caseId,uid});
    store.seed("adminActivityLogs/auto_offer_"+id,{action:"Automatic Volunteer Task Offered"});
    store.seed("notifications/auto_response_"+id,{
      userId:uid,caseId,assignmentId:id,type:"response_assignment"
    });
  }
  const accepted=new FakeStore();fixture(accepted,now+100000);
  assert.equal((await getVolunteerOffer(accepted,uid,now)).canRespond,true);
  assert.equal((await respondToStagingOffer(accepted,"anotherVolunteer","accepted",now)).status,"not_offered");
  assert.equal((await respondToStagingOffer(accepted,uid,"accepted",now)).status,"accepted");
  assert.equal(accepted.map.get("responseAssignments/"+id).status,"accepted");
  assert.equal(accepted.map.get("emergencyAutoDispatch/"+caseId).status,"accepted");
  assert.equal(accepted.map.get("responderLocks/"+uid).assignmentId,id);
  assert.equal(accepted.map.get("notifications/auto_test_accepted_"+id).userId,"testResident");
  assert.equal(accepted.map.get("adminActivityLogs/auto_test_decision_"+id).action,
    "Synthetic Volunteer Accepted");
  const verified=await inspectStagingAssignmentConsistency(accepted);
  assert.equal(verified.status,"accepted");
  assert.equal(verified.fullAcceptanceVerified,true);
  assert.equal((await respondToStagingOffer(accepted,uid,"accepted",now)).status,"already_accepted");
  assert.equal((await resetExpiredFixture(accepted,now+500000)).status,"cannot_reset_accepted_task");
  const expired=new FakeStore();fixture(expired,now-1000);
  assert.equal((await getVolunteerOffer(expired,uid,now)).status,"expired");
  assert.equal((await respondToStagingOffer(expired,uid,"accepted",now)).status,"expired");
  assert.equal(expired.map.get("responseAssignments/"+id).status,"offered");
  assert.equal((await resetExpiredFixture(expired,now)).status,"reset");
  assert.equal(expired.map.has("responseAssignments/"+id),false);
  assert.equal(expired.map.has("autoVolunteerReservations/"+uid),false);
  assert.equal(expired.map.get("disasterCases/"+caseId).status,"validated");
  const declined=new FakeStore();fixture(declined,now+100000);
  assert.equal((await respondToStagingOffer(declined,uid,"declined",now)).status,"declined");
  assert.equal(declined.map.get("responseAssignments/"+id).status,"declined");
  assert.equal(declined.map.has("autoVolunteerReservations/"+uid),false);
  assert.equal(declined.map.get("emergencyAutoDispatch/"+caseId).status,"needs_admin");
  assert.equal(declined.map.get("notifications/auto_test_declined_"+id).userId,"testAdmin");
  assert.equal(declined.map.get("adminActivityLogs/auto_test_decision_"+id).action,
    "Synthetic Volunteer Declined");
  assert.equal((await resetExpiredFixture(declined,now)).status,"reset");
  assert.equal(declined.map.has("notifications/auto_test_declined_"+id),false);
});


test("Volunteer API requires approved Volunteer Firebase role and never exposes other users",async()=>{
  const project="test-isolated-volunteer-firebase";
  let writes=0;
  const snap=data=>({exists:data!==undefined,data:()=>data});
  const firestore={collection(name){
    if(name==="users")return {doc(uid){return {get:async()=>snap({
      role:uid==="test-vol"?"volunteer":"admin",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",identityVerified:true
    })};}};
    if(name==="volunteerApplications")return {doc(uid){return {get:async()=>snap({
      uid,status:"approved"
    })};}};
    if(name==="disasterCases")return {doc(id){return {get:async()=>snap(id==="STAGING_TEST_001"?
      {title:"TEST ONLY - Dummy Emergency",verificationStatus:"validated"}:undefined)};}};
    if(name==="emergencyAutoDispatch")return {doc(){return {get:async()=>snap({
      status:"waiting",assignmentId:"STAGING_TEST_001_test-vol",
      volunteerId:"test-vol",expiresAtMs:Date.now()+300000,wave:1
    })};}};
    if(name==="responseAssignments")return {doc(id){return {get:async()=>snap(
      id==="STAGING_TEST_001_test-vol"?
      {caseId:"STAGING_TEST_001",volunteerId:"test-vol",createdBy:"automatic_matching_engine",status:"offered"}:undefined
    )};}};
    if(name==="systemSettings")return {doc(){return {get:async()=>snap(undefined)};}};
    if(name==="autoVolunteerReservations" || name==="responderLocks")
      return {doc(){return {get:async()=>snap(undefined)};}};
    throw Error("unexpected collection "+name);
  },runTransaction:async()=>{writes++;throw Error("no writes expected");}};
  const direct=await require("./stagingVolunteerTask").getVolunteerOffer(firestore,"test-vol");
  assert.equal(direct.status,"offered");
  const app=makeApp({
    env:{VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:project,
      FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project})},
    worker:{config:{onDemandReady:true,ready:false}},
    authClient:{verifyIdToken:async(token)=>({uid:token==="vol"?"test-vol":"test-admin"})},
    firestore
  });
  const server=app.listen(0,"127.0.0.1");
  try{
    await new Promise((resolve,reject)=>server.listening?resolve():
      (server.once("listening",resolve),server.once("error",reject)));
    const base="http://127.0.0.1:"+server.address().port;
    let r=await fetch(base+"/api/staging/volunteer/task");
    assert.equal(r.status,401);
    r=await fetch(base+"/api/staging/volunteer/task",{
      headers:{Authorization:"Bearer admin"}
    });
    assert.equal(r.status,403);
    r=await fetch(base+"/api/staging/volunteer/task",{
      headers:{Authorization:"Bearer vol"}
    });
    assert.equal(r.status,200);
    const task=await r.json();
    assert.equal(task.status,"offered");
    assert.equal(task.canRespond,true);
    assert.equal(task.caseId,"STAGING_TEST_001");
    r=await fetch(base+"/api/staging/volunteer/respond",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer admin"},
      body:JSON.stringify({decision:"accepted"})
    });
    assert.equal(r.status,403);
    r=await fetch(base+"/api/staging/volunteer/respond",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer vol"},
      body:JSON.stringify({decision:"invalid"})
    });
    assert.equal(r.status,400);
    assert.equal(writes,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});


test("Volunteer and Admin production-compatible staging integration remains fail-closed",()=>{
  const fs=require("node:fs");
  const rules=fs.readFileSync("firestore.rules","utf8");
  const engine=fs.readFileSync("functions/emergencyAutoDispatchCore.js","utf8");
  const stage=fs.readFileSync("backend/stagingVolunteerTask.js","utf8");
  const web=fs.readFileSync("app/(tabs)/volunteer.web.tsx","utf8");
  const android=fs.readFileSync("app/(tabs)/volunteer.tsx","utf8");
  assert.match(rules,/match \/responseAssignments\/\{assignmentId\}/);
  assert.match(rules,/validVolunteerResponseFields/);
  assert.match(rules,/match \/responderLocks\/\{uid\}/);
  assert.match(stage,/tx.update\(refs.assignmentRef,\{status:decision,updatedAt:stamp\}\)/);
  assert.ok(!stage.includes("acceptedAt:stamp"));
  assert.ok(!stage.includes("declinedAt:stamp"));
  assert.match(stage,/auto_test_accepted_/);
  assert.match(stage,/inspectStagingAssignmentConsistency/);
  assert.match(engine,/tx.create\(reserveRef/);
  assert.match(engine,/createdBy: "automatic_matching_engine"/);
  for(const code of [web,android]){
    assert.ok(code.includes('const responderLockRef = doc(db, "responderLocks", user.uid)'));
    assert.ok(code.includes('if (next === "accepted" && recordedLock)'));
    assert.ok(code.includes('transaction.set(responderLockRef,'));
  }
  const admin=fs.readFileSync("backend/stagingAdminLogin.html","utf8");
  assert.match(admin,/api\/admin\/emergency-auto\/verify-test/);
  assert.match(admin,/verifyTest.disabled/);
});


test("staging fixture diagnostic returns field names only, never identities or values",()=>{
  const {diagnoseSyntheticFixtureFields}=require("./emergencyStagingReadiness");
  const base={title:"TEST ONLY - Dummy Emergency",status:"validated",
    verificationStatus:"validated",dispatchBlocked:false,
    requiredSkills:["First Aid"],reporterUid:"private-resident-123"};
  assert.deepEqual(diagnoseSyntheticFixtureFields(base),[]);
  const invalid={...base,status:"draft",verificationStatus:"pending",
    dispatchBlocked:true,requiredSkills:"text"};
  const fields=diagnoseSyntheticFixtureFields(invalid);
  assert.deepEqual(fields,["status","verificationStatus","dispatchBlocked","requiredSkills"]);
  assert.ok(!JSON.stringify(fields).includes("private-resident"));
  assert.ok(!JSON.stringify(fields).includes("draft"));
  assert.deepEqual(diagnoseSyntheticFixtureFields({...invalid,title:"Actual emergency"}),[]);
});
test("fresh staging diagnostic requires approved Admin authentication and isolated project",async()=>{
  const path="/api/admin/emergency-auto/preflight";
  await withServer({},async({url,calls})=>{
    let response=await fetch(url+path);
    assert.equal(response.status,401);
    response=await fetch(url+path,{headers:{Authorization:"Bearer test-token"}});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,"isolated_staging_not_configured");
    assert.deepEqual(calls,[]);
  });
  await withServer({admin:false},async({url,calls})=>{
    const response=await fetch(url+path,{headers:{Authorization:"Bearer test-token"}});
    assert.equal(response.status,403);
    assert.deepEqual(calls,[]);
  });
});


test("approved staging Admin receives only fresh dummy case field names, with zero writes",async()=>{
  const tenant="volunserve-volunteer-staging";
  const original={title:"TEST ONLY - Dummy Emergency",status:"unverified",
    verificationStatus:"pending_verification",dispatchBlocked:true,
    requiredSkills:"First Aid",reporterUid:"synthetic-resident",
    validatedBy:"synthetic-admin",incidentBarangay:"Bagong Buhay I"};
  let readCount=0,writes=0;
  const firestore={collection(name){
    if(name==="disasterCases") return {doc(id){
      assert.equal(id,"STAGING_TEST_001");
      return {get:async()=>{readCount++;return {exists:true,data:()=>({...original})};}};
    }};
    if(name==="systemSettings") return {doc(){return {get:async()=>({exists:true})};}};
    if(name==="users") return {doc(uid){
      const records={
        "synthetic-admin":{role:"admin",status:"approved"},
        "synthetic-resident":{role:"resident",status:"approved"},
      };
      return {get:async()=>({exists:!!records[uid],data:()=>records[uid]})};
    }};
    throw Error("Unexpected Firestore collection "+name);
  },set:()=>{writes++;throw Error("No writes allowed");}};
  const app=makeApp({
    authClient:{verifyIdToken:async()=>({uid:"synthetic-admin"})},
    firestore,
    worker:{config:{onDemandReady:false,ready:false}},
    env:{VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:tenant,
      FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:tenant})}
  });
  const server=app.listen(0,"127.0.0.1");
  try {
    await new Promise((resolve,reject)=>{
      if(server.listening)resolve();
      else {server.once("listening",resolve);server.once("error",reject);}
    });
    const base="http://127.0.0.1:"+server.address().port;
    const response=await fetch(base+"/api/admin/emergency-auto/preflight",{
      headers:{Authorization:"Bearer synthetic-admin-token"}
    });
    assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.invalidFields,[
      "status","verificationStatus","dispatchBlocked","requiredSkills"]);
    assert.equal(result.status,"blocked");
    assert.equal(result.reason,"invalid_test_case_fields");
    assert.equal(result.eligible,0);
    assert.ok(readCount>=1);
    assert.equal(writes,0);
    assert.ok(!JSON.stringify(result).includes("synthetic-resident"));
    assert.ok(!JSON.stringify(result).includes("unverified"));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});


test("one-field synthetic status preparation is transactional, isolated and rejects unsafe states",async()=>{
  const {prepareSyntheticCaseForTest}=require("./stagingSyntheticCasePreparation");
  const valid={title:"TEST ONLY - Dummy Emergency",status:"reported",
    verificationStatus:"validated",dispatchBlocked:false,
    requiredSkills:["First Aid"],validatedBy:"test-admin",reporterUid:"test-resident",
    incidentBarangay:"Bagong Buhay I"};
  async function attempt(input,{hasSession=false,hasAssignment=false,missing=false}={}){
    let updated=[];
    const firestore={
      collection(name){
        assert.ok(["disasterCases","emergencyAutoDispatch","responseAssignments"].includes(name));
        if(name==="responseAssignments")return {
          where(key,op,id){
            assert.equal(key,"caseId");assert.equal(op,"==");assert.equal(id,"STAGING_TEST_001");
            return {limit(n){assert.equal(n,1);return {type:"assignment-query"};}};
          }
        };
        return {doc(id){assert.equal(id,"STAGING_TEST_001");return {type:name};}};
      },
      runTransaction:async fn=>fn({
        get:async ref=>ref.type==="disasterCases"?
          {exists:!missing,data:()=>input}:
          ref.type==="emergencyAutoDispatch"?{exists:hasSession}:
          {empty:!hasAssignment},
        update:(ref,patch)=>{assert.equal(ref.type,"disasterCases");updated.push(patch);}
      })
    };
    return {result:await prepareSyntheticCaseForTest(firestore),updated};
  }
  let a=await attempt(valid);
  assert.equal(a.result.status,"prepared");
  assert.equal(a.updated.length,1);
  assert.deepEqual(Object.keys(a.updated[0]).sort(),["status","updatedAt"]);
  assert.equal(a.updated[0].status,"validated");
  a=await attempt({...valid,status:"validated"});
  assert.equal(a.result.status,"already_validated");assert.equal(a.updated.length,0);
  for(const input of [
    {...valid,status:"assigned"},
    {...valid,status:"in_progress"},
    {...valid,verificationStatus:"pending_verification"},
    {...valid,title:"Actual resident incident"},
    {...valid,incidentBarangay:"Outside SJDM"},
    {...valid,activeVolunteerSupportAssignmentId:"existing-assignment"}
  ]){
    a=await attempt(input);
    assert.equal(a.result.status,"blocked");
    assert.equal(a.updated.length,0);
  }
  for(const opts of [{hasSession:true},{hasAssignment:true},{missing:true}]){
    a=await attempt(valid,opts);
    assert.equal(a.result.status,"blocked");
    assert.equal(a.updated.length,0);
  }
});
test("only approved staging Admin may repair the fixed fictional case status",async()=>{
  const tenant="volunserve-volunteer-staging";
  let writes=0;
  const firebase={collection(name){
    if(name==="users")return {doc:()=>({get:async()=>({exists:true,data:()=>({role:"admin",status:"approved"})})})};
    if(name==="systemSettings")return {doc:()=>({get:async()=>({exists:true})})};
    throw Error("Unexpected collection "+name);
  },runTransaction:async()=>{writes++;throw Error("Unexpected write");}};
  async function serve(env,ready){
    const app=makeApp({authClient:{verifyIdToken:async()=>({uid:"test-admin"})},
      firestore:firebase,worker:{config:{onDemandReady:ready,ready:false}},env});
    const server=app.listen(0,"127.0.0.1");
    await new Promise((resolve,reject)=>{
      if(server.listening)resolve();else{server.once("listening",resolve);server.once("error",reject);}
    });
    try{
      const base="http://127.0.0.1:"+server.address().port;
      let r=await fetch(base+"/api/admin/emergency-auto/prepare-test-status",{method:"POST"});
      assert.equal(r.status,401);
      r=await fetch(base+"/api/admin/emergency-auto/prepare-test-status",{
        method:"POST",headers:{Authorization:"Bearer fake-admin"}});
      assert.equal(r.status,503);
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
  await serve({},false);
  await serve({VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:tenant,
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:tenant})},false);
  assert.equal(writes,0);
});


test("already assigned fictional case is not misclassified as invalid or re-offerable",async()=>{
  const {inspectStagingTestCase}=require("./emergencyStagingReadiness");
  const base={title:"TEST ONLY - Dummy Emergency",status:"assigned",
    verificationStatus:"validated",dispatchBlocked:false,
    requiredSkills:["First Aid"],validatedBy:"dummy-admin",
    reporterUid:"dummy-reporter",
    activeVolunteerSupportAssignmentId:"STAGING_TEST_001_dummy-volunteer",
    autoVolunteerDispatch:{state:"accepted"}};
  const db={collection(name){
    assert.equal(name,"disasterCases");
    return {doc(id){
      assert.equal(id,"STAGING_TEST_001");
      return {get:async()=>({exists:true,data:()=>base})};
    }};
  }};
  const result=await inspectStagingTestCase(db);
  assert.deepEqual(result,{status:"existing_assignment",reason:"verify_existing_test_offer",
    eligible:0,wave:0});
  delete base.activeVolunteerSupportAssignmentId;
  delete base.autoVolunteerDispatch;
  const noMarker=await inspectStagingTestCase(db);
  assert.equal(noMarker.status,"blocked");
  assert.equal(noMarker.reason,"invalid_test_case_fields");
});


test("Admin-only late staging reconciliation creates accurate evidence, never backdates acceptance",async()=>{
  const {reconcileAcceptedStagingSupport,ORIGIN}
    =require("./stagingAcceptedSupportReconciliation");
  const {inspectStagingAssignmentConsistency}=require("./stagingVolunteerTask");
  const caseId="STAGING_TEST_001",uid="fakeVolunteer";
  const aid=caseId+"_"+uid,adminUid="fakeAdmin";
  class FakeStore {
    constructor(){this.data=new Map();this.writes=0;}
    collection(name){return {doc:id=>({path:name+"/"+id,get:async()=>this.snap(name+"/"+id)})};}
    snap(key){const value=this.data.get(key);return {exists:value!==undefined,data:()=>value};}
    seed(key,value){this.data.set(key,value);}
    async runTransaction(callback){
      const mutations=[],tx={
        get:ref=>ref.get(),
        create:(ref,data)=>mutations.push(["create",ref.path,data])
      };
      const result=await callback(tx);
      for(const [mode,path,data] of mutations){
        assert.equal(mode,"create");
        assert.equal(this.data.has(path),false,"must never overwrite original records");
        this.data.set(path,data);this.writes++;
      }
      return result;
    }
  }
  function fixture(){
    const db=new FakeStore();
    db.seed("disasterCases/"+caseId,{title:"TEST ONLY - Dummy Emergency",
      status:"assigned",verificationStatus:"validated",
      validatedBy:adminUid,reporterUid:"fakeResident",
      activeVolunteerSupportAssignmentId:aid,
      autoVolunteerDispatch:{state:"accepted"}});
    db.seed("emergencyAutoDispatch/"+caseId,{
      status:"accepted",volunteerId:uid,assignmentId:aid,wave:1});
    db.seed("responseAssignments/"+aid,{
      status:"accepted",volunteerId:uid,caseId,createdBy:"automatic_matching_engine"});
    db.seed("responderLocks/"+uid,{assignmentId:aid,responderUid:uid,caseId});
    db.seed("autoVolunteerReservations/"+uid,{assignmentId:aid,caseId,uid});
    db.seed("notifications/auto_response_"+aid,{userId:uid,caseId,assignmentId:aid});
    return db;
  }
  const db=fixture();
  const before=await inspectStagingAssignmentConsistency(db);
  assert.equal(before.status,"accepted");
  assert.equal(before.fullAcceptanceVerified,false);
  assert.equal(before.acceptedResidentNotificationPresent,false);
  assert.equal(before.adminAuditPresent,false);
  const first=await reconcileAcceptedStagingSupport(db,adminUid);
  assert.deepEqual(first,{status:"reconciled",createdNotification:true,
    createdAudit:true,historicalOriginalAcceptanceVerified:false});
  assert.equal(db.writes,2);
  const n=db.data.get("notifications/auto_test_accepted_"+aid);
  const a=db.data.get("adminActivityLogs/auto_test_decision_"+aid);
  assert.equal(n.userId,"fakeResident");
  assert.equal(n.recordOrigin,ORIGIN);
  assert.equal(n.isLateNotification,true);
  assert.match(n.message,/created later/);
  assert.equal(a.recordOrigin,ORIGIN);
  assert.equal(a.originalAcceptanceTimeUnknown,true);
  assert.match(a.action,/Reconciled/);
  assert.ok(a.timestamp,"Only server-supplied CURRENT reconciliation timestamp");
  const check=await inspectStagingAssignmentConsistency(db);
  assert.equal(check.acceptedResidentNotificationPresent,true);
  assert.equal(check.adminAuditPresent,true);
  assert.equal(check.supportRecordsVerified,true);
  assert.equal(check.reconciliationRecorded,true);
  assert.equal(check.historicalOriginalAcceptanceVerified,false);
  assert.equal(check.fullAcceptanceVerified,false);
  const again=await reconcileAcceptedStagingSupport(db,adminUid);
  assert.equal(again.status,"already_present");
  assert.equal(again.createdAudit,false);
  assert.equal(again.createdNotification,false);
  assert.equal(db.writes,2,"idempotent: no duplicate notifications or audit");

  for(const mutation of [
    store=>store.data.get("disasterCases/"+caseId).title="Actual emergency report",
    store=>store.data.get("responseAssignments/"+aid).status="declined",
    store=>store.data.get("emergencyAutoDispatch/"+caseId).status="waiting",
    store=>store.data.get("responderLocks/"+uid).assignmentId="other_task",
    store=>store.data.get("autoVolunteerReservations/"+uid).assignmentId="other_task",
    store=>store.data.delete("notifications/auto_response_"+aid),
    store=>store.data.get("disasterCases/"+caseId).reporterUid=uid
  ]){
    const unsafe=fixture();
    mutation(unsafe);
    const outcome=await reconcileAcceptedStagingSupport(unsafe,adminUid);
    assert.equal(outcome.status,"blocked");
    assert.equal(unsafe.writes,0);
  }
  const partial=fixture();
  partial.seed("notifications/auto_test_accepted_"+aid,{
    userId:"fakeResident",caseId,assignmentId:aid,status:"accepted",recordOrigin:ORIGIN});
  const one=await reconcileAcceptedStagingSupport(partial,adminUid);
  assert.equal(one.createdNotification,false);
  assert.equal(one.createdAudit,true);
  assert.equal(partial.writes,1);
  const tampered=fixture();
  tampered.seed("notifications/auto_test_accepted_"+aid,{
    userId:"differentResident",caseId,assignmentId:aid});
  assert.equal((await reconcileAcceptedStagingSupport(tampered,adminUid)).status,"blocked");
  assert.equal(tampered.writes,0);
});

test("staging reconciliation endpoint denies anonymous, wrong case and missing explicit confirmation",async()=>{
  const tenant="volunserve-volunteer-staging";
  let writes=0;
  const firestore={
    collection(name){
      if(name==="users")return {doc:()=>({get:async()=>({
        exists:true,data:()=>({role:"admin",status:"approved"})})})};
      if(name==="systemSettings")return {doc:()=>({get:async()=>({exists:true})})};
      throw Error("Unexpected write/data collection "+name);
    },
    runTransaction:async()=>{writes++;throw Error("No writes expected");}
  };
  const app=makeApp({
    authClient:{verifyIdToken:async()=>({uid:"testAdmin"})},firestore,
    worker:{config:{onDemandReady:true,ready:false}},
    env:{VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:tenant,
      FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:tenant})},
  });
  const server=app.listen(0,"127.0.0.1");
  try{
    await new Promise((resolve,reject)=>{
      if(server.listening)resolve();
      else {server.once("listening",resolve);server.once("error",reject);}
    });
    const endpoint="http://127.0.0.1:"+server.address().port+
      "/api/admin/emergency-auto/reconcile-accepted-test";
    let response=await fetch(endpoint,{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({caseId:"STAGING_TEST_001",confirmLateReconciliation:true})});
    assert.equal(response.status,401);
    const headers={"Content-Type":"application/json",Authorization:"Bearer fake-admin"};
    for(const data of [
      {caseId:"DIFFERENT_CASE",confirmLateReconciliation:true},
      {caseId:"STAGING_TEST_001",confirmLateReconciliation:false},
      {caseId:"STAGING_TEST_001"}
    ]){
      response=await fetch(endpoint,{method:"POST",
        headers,body:JSON.stringify(data)});
      assert.equal(response.status,400);
    }
    assert.equal(writes,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
