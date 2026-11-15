"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {parseCutoff,renderWorkerConfig,createRenderAutoDispatchWorker}=
  require("./emergencyAutoDispatchWorker");

const validEnvironment = {
  VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED:"true",
  VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED:"true",
  VOLUNSERVE_AUTO_VOLUNTEER_CUTOFF_UTC:"2026-01-01T00:00:00Z",
};
function fakeFirestore(cases){
  let reads=0;
  return {
    get reads(){return reads;},
    collection(name){
      assert.equal(name,"disasterCases");
      return {
        orderBy(field,direction){
          assert.equal(field,"validatedAt");
          assert.equal(direction,"desc");
          return {limit(n){
            assert.equal(n,80);
            return {get:async()=>{
              reads++;
              return {docs:cases.map(c=>({id:c.id,data:()=>c.data}))};
            }};
          }};
        },
      };
    },
  };
}

test("No unexpected paid activation: missing, partial and invalid environment is disabled",()=>{
  assert.equal(renderWorkerConfig({}).ready,false);
  assert.equal(renderWorkerConfig({
    VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED:"true",
  }).ready,false);
  assert.equal(renderWorkerConfig({
    ...validEnvironment,VOLUNSERVE_AUTO_VOLUNTEER_CUTOFF_UTC:"not-an-iso-time",
  }).ready,false);
  assert.equal(parseCutoff("2026-01-01T00:00:00Z"),Date.parse("2026-01-01T00:00:00Z"));
  assert.equal(parseCutoff("2020-01-01"),null);
  assert.equal(renderWorkerConfig(validEnvironment).ready,true);
});
test("Free or unconfirmed Render never queries Firestore or starts matching",async()=>{
  const db=fakeFirestore([]);
  const worker=createRenderAutoDispatchWorker({db,env:{
    VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED:"true",
  },engineFactory:()=>({
    sweep:()=>{throw Error("Never run");},
    advanceCase:()=>{throw Error("Never offer");},
  }),logger:{warn(){}}});
  assert.equal((await worker.runOnce()).status,"disabled");
  assert.equal(worker.start().enabled,false);
  assert.equal(db.reads,0);
  await assert.rejects(worker.requestStart("case1"),/always-on/);
});
test("Only new validated cases after reviewed UTC cutoff enter automatic matching",async()=>{
  const calls=[];
  const cutoff=Date.parse("2026-01-01T00:00:00Z");
  const cases=[
    {id:"current",data:{validatedAt:{toMillis:()=>cutoff+3600000},status:"validated",
      verificationStatus:"validated",incidentBarangay:"Bagong Buhay I"}},
    {id:"historic",data:{validatedAt:{toMillis:()=>cutoff-1},status:"validated",
      verificationStatus:"validated",incidentBarangay:"Bagong Buhay I"}},
    {id:"not-reviewed",data:{validatedAt:{toMillis:()=>cutoff+1},status:"reported",
      verificationStatus:"pending_verification",incidentBarangay:"Bagong Buhay I"}},
    {id:"no-gps-barangay",data:{validatedAt:{toMillis:()=>cutoff+1},
      status:"validated",verificationStatus:"validated"}},
    {id:"manual-assignment",data:{validatedAt:{toMillis:()=>cutoff+1},
      status:"validated",verificationStatus:"validated",incidentBarangay:"Bagong Buhay I",
      activeVolunteerSupportAssignmentId:"manual_1"}},
    {id:"session-already-started",data:{validatedAt:{toMillis:()=>cutoff+1},
      status:"validated",verificationStatus:"validated",incidentBarangay:"Bagong Buhay I",
      autoVolunteerDispatch:{state:"waiting"}}},
  ];
  const db=fakeFirestore(cases);
  const worker=createRenderAutoDispatchWorker({db,env:validEnvironment,logger:{error(){},warn(){}},
    engineFactory:()=>{
      return {
        sweep: async(options)=>{calls.push(["sweep",options]);return {due:0};},
        advanceCase:async(id)=>{calls.push(["offer",id]);return {action:"offered"};},
        requestAdminStart:async(id)=>({action:"offered",caseId:id}),
        disableCase:async(id)=>({action:"disabled",caseId:id}),
      };
    }});
  const result=await worker.runOnce();
  assert.equal(result.status,"ok");
  assert.deepEqual(calls,[["sweep",{pollPending:true}],["offer","current"]]);
  assert.equal(result.scanned,1);
  assert.equal(result.eligible,1);
  assert.equal(db.reads,1);
  assert.deepEqual(await worker.requestStart("historic"),{action:"offered",caseId:"historic"});
  assert.deepEqual(await worker.requestDisable("historic"),{action:"disabled",caseId:"historic"});
});
test("Existing backend admin endpoints remain protected and feature gated",()=>{
  const server=fs.readFileSync("backend/server.js","utf8");
  const admin=fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
  for(const route of ['"/api/admin/emergency-auto/start"',
    '"/api/admin/emergency-auto/disable"',
    '"/api/admin/emergency-auto/status"']) {
    assert.ok(server.includes(route),"Missing protected route "+route);
  }
  assert.match(server,/requireFirebaseUser, requireOperationalAdmin, approvedAutomaticResponse/);
  assert.match(admin,/EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER/);
  assert.match(admin,/user\.getIdToken\(\)/);
  assert.match(server,/emergencyAutoWorker\.start\(\)/);
  assert.ok(!server.includes("VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED=true"),
    "Never hardcode always-on approval in code");
});
