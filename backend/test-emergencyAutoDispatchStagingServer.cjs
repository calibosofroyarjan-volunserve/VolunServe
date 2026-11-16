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
  let r=await request("start",{caseId:"case1"});
  assert.equal(r.status,200);assert.equal((await r.json()).action,"offered");
  r=await request("disable",{caseId:"case1"});
  assert.equal(r.status,200);assert.equal((await r.json()).action,"disabled");
  r=await request("start",{caseId:"../../other"});
  assert.equal(r.status,400);
  assert.deepEqual(calls,[["start","case1"],["disable","case1"]]);
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
