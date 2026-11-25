"use strict";
// Synthetic offline verification of production manual-only Render auto-offer guard.
// This test never loads Firebase credentials, contacts Render or connects to Firestore.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("backend/renderEmergencyAutoInvites.js","utf8");
function moduleUnderTest(){
  const mod={exports:{}};
  vm.runInNewContext(source,{
    module:mod,exports:mod.exports,process:{env:{}},
    require:(name)=>{
      assert.equal(name,"../functions/emergencySimpleAutoInvite");
      return {volunteerAllowed:()=>false};
    },
    Date,Math,Number,Set,Map,Array,Object,JSON,RegExp,Error,Promise
  },{filename:"backend/renderEmergencyAutoInvites.js",timeout:3000});
  return mod.exports;
}
const api=moduleUnderTest();
const production={
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-3aa5b"}),
  VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-3aa5b",
  VOLUNSERVE_RENDER_AUTO_ENABLED:"true",
  VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED:"true"
};
test("Production new auto-offers are hard-disabled even when stale env approvals are all true",async()=>{
  const c=api.config(production);
  assert.equal(c.isProduction,true,"All old production flags are intentionally recognized");
  assert.equal(c.productionManualOnly,true);
  const db=new Proxy({}, {
    get(_obj,property){throw Error("Disabled production offer touched DB: "+String(property));}
  });
  const engine=api.makeEngine({db,
    FieldValue:{serverTimestamp:()=>({synthetic:true})},env:production});
  const result=await engine.submitted({
    uid:"qa-resident",caseId:"qa-emergency-case",
    profile:{role:"resident",status:"approved",residentAccess:true}
  });
  assert.equal(result.status,"disabled");
  assert.equal(result.reason,"production_manual_assignment_only");
});
test("Existing production auto-invites retain guarded Respond path to avoid stranding previous offers",async()=>{
  const engine=api.makeEngine({db:new Proxy({}, {
    get(){throw Error("Invalid request should never touch DB");}
  }),FieldValue:{serverTimestamp:()=>0},env:production});
  // The old respond path remains gated and validates before DB. Invalid user
  // returns blocked, not 'disabled', even though NEW auto offers cannot start.
  const res=await engine.respond({uid:"not a uid!",caseId:"qa-case",decision:"accepted"});
  assert.equal(res.status,"blocked");
  assert.equal(res.reason,"invalid_request");
});
test("Staging and emulator opt-in remain available, production partial/invalid env remains fail-closed",()=>{
  for(const env of [
    {},
    {...production,VOLUNSERVE_RENDER_AUTO_ENABLED:"false"},
    {...production,VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED:"false"},
    {...production,VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"wrong-project"},
    {...production,FIREBASE_SERVICE_ACCOUNT_JSON:"invalid-json"},
  ]){
    const c=api.config(env);
    assert.equal(c.enabled,false);
  }
  for(const env of [
    {...production,VOLUNSERVE_RENDER_AUTO_ENABLED:"false"},
    production,
  ])assert.equal(api.config(env).productionManualOnly,true);
  const stage={
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-volunteer-staging"}),
    VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-volunteer-staging",
    VOLUNSERVE_RENDER_AUTO_ENABLED:"true"
  };
  const emulator={
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"demo-volunserve-simple-invites"}),
    VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"demo-volunserve-simple-invites",
    VOLUNSERVE_RENDER_AUTO_ENABLED:"true",
    VOLUNSERVE_RENDER_AUTO_EMULATOR_APPROVED:"true",
    FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",
    FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099"
  };
  for(const env of [stage,emulator]){
    const c=api.config(env);
    assert.equal(c.enabled,true);
    assert.equal(c.productionManualOnly,false);
  }
});
