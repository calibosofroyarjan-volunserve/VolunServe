"use strict";
// Synthetic-only regression: no live Firebase calls or production credentials.
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  dispatchEnabled,
  makeApprovedCaseAutoInviteHandler,
  makeAutoVolunteerDecisionHandler
}=require("./emergencySimpleAutoInvite");
const base={
  GCLOUD_PROJECT:"volunserve-3aa5b",
  VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"volunserve-3aa5b",
  VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED:"true",
  VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED:"true"
};
const db=new Proxy({}, {get(_object,key){
  throw Error("MANUAL production offer attempted Firestore access: "+String(key));
}});
const FieldValue={serverTimestamp:()=>({fake:true})};
const event={
  params:{caseId:"synthetic_admin_case"},
  data:{before:{data:()=>({verificationStatus:"pending_verification"})},
    after:{data:()=>({
      verificationStatus:"validated",status:"validated",
      validatedBy:"synthetic_admin",dispatchBlocked:false
    })}}
};
test("hard-stop new automatic production Firestore-triggered offers even with ALL legacy approvals",async()=>{
  assert.equal(dispatchEnabled(base),true,"Old decision gate remains enabled for legacy invitations");
  for(const env of [
    base,
    {...base,GOOGLE_CLOUD_PROJECT:"volunserve-3aa5b",GCLOUD_PROJECT:""},
    {...base,VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED:"false"},
    {...base,VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED:"false"}
  ]){
    const handler=makeApprovedCaseAutoInviteHandler({db,FieldValue,env});
    const result=await handler(event);
    assert.equal(result.status,"disabled");
    assert.equal(result.reason,"production_manual_assignment_only");
  }
});
test("existing production auto-invitation decision remains guarded, not globally deleted",async()=>{
  const decide=makeAutoVolunteerDecisionHandler({db,FieldValue,env:base});
  const result=await decide({
    uid:"invalid uid!",caseId:"synthetic_admin_case",decision:"accepted"
  });
  // Old decision endpoint validates before DB and is NOT hard-disabled with
  // production offer creation; existing legitimate invites can still respond.
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,"invalid_volunteer_case_or_decision");
});
test("old staging/demo opt-in behavior remains available and incomplete production env stays OFF",()=>{
  const demo={
    GCLOUD_PROJECT:"demo-volunserve-simple-invites",
    VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"demo-volunserve-simple-invites",
    VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED:"true"
  };
  assert.equal(dispatchEnabled(demo),true);
  assert.equal(dispatchEnabled({...base,VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED:"false"}),false);
  assert.equal(dispatchEnabled({...base,VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"wrong"}),false);
  assert.equal(dispatchEnabled({}),false);
});
