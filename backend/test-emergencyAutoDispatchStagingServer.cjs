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
