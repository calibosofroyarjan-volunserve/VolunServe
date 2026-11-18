"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {summarizeStaging002Eligibility}=require("./staging002EligibilitySummary");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
function snapshot(v){
  return {exists:v!==undefined,data:()=>v};
}
function dbFor({caseData,users={},apps=[],assignments=[]}={}){
  return {collection(name){
    return {
      doc(id){return {async get(){
        return snapshot(name==="disasterCases"?id===E2E_CASE_ID?caseData:undefined:
          name==="users"?users[id]:undefined);
      }};},
      where(field,operator,value){
        let arr=name==="volunteerApplications"?apps:assignments;
        const check=row=>operator==="=="?row.data[field]===value:
          operator==="in"&&value.includes(row.data[field]);
        arr=arr.filter(check);
        return {limit(n){return {async get(){
          const docs=arr.slice(0,n).map(row=>({id:row.id,data:()=>row.data}));
          return {size:docs.length,docs};
        }}}};
      }
    };
  }};
}
const fictional={
  title:E2E_CASE_TITLE,testOnly:true,
  testCategory:"staging_synthetic_volunteer_e2e_002",
  source:"staging_synthetic_e2e",
  status:"validated",verificationStatus:"validated",dispatchBlocked:false,
  reporterUid:"syntheticResident",incidentBarangay:"Bagong Buhay I",
  requiredSkills:["First Aid"]
};
function person(barangay="Bagong Buhay I",overrides={}){
  return {role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    barangay,skills:["First Aid"],...overrides};
}
function app(id){return {id,data:{uid:id,status:"approved",skills:["First Aid"]}};}
test("no fictional 002 fixture is blocked without reading other accounts",async()=>{
  const r=await summarizeStaging002Eligibility(dbFor());
  assert.deepEqual(r,{status:"blocked",reason:"fictional_002_not_created",willSendOffers:false});
});
test("unvalidated fictional 002 is blocked, no offers or users read",async()=>{
  const r=await summarizeStaging002Eligibility(dbFor({
    caseData:{...fictional,status:"reported",verificationStatus:"pending_verification",dispatchBlocked:true}
  }));
  assert.equal(r.reason,"fictional_002_not_validated");
});
test("aggregate reason counts distinguish busy, skills, identity and available waves",async()=>{
  const users={
    available1:person(),available3:person("Minuyan I"),
    reserved001:person(),wrongSkill:person("Bagong Buhay I",{skills:[]}),
    notVerified:person("Bagong Buhay I",{identityVerified:false}),
    wrongBarangay:person("Outside",{barangay:"Unknown"}),
  };
  const apps=["available1","available3","reserved001","wrongSkill","notVerified","wrongBarangay"].map(app);
  // App-provided First Aid skills still count, so remove on the wrongSkill row.
  apps.find(x=>x.id==="wrongSkill").data.skills=[];
  const assignments=[{id:"old001",data:{
    caseId:"STAGING_TEST_001",volunteerId:"reserved001",status:"accepted"
  }}];
  const r=await summarizeStaging002Eligibility(dbFor({
    caseData:fictional,users,apps,assignments
  }));
  assert.equal(r.status,"ready");
  assert.equal(r.eligible,2);
  assert.equal(r.eligibleByWave.wave1,1);
  assert.equal(r.eligibleByWave.wave3,1);
  assert.equal(r.excludedByReason.busy,1);
  assert.equal(r.excludedByReason.skill_mismatch,1);
  assert.equal(r.excludedByReason.identity_rejected,1);
  assert.equal(r.excludedByReason.invalid_volunteer_barangay,1);
  assert.equal(r.approvedApplications,6);
  assert.equal(r.willSendOffers,false);
  assert.equal(r.noPersonalDetails,true);
  for(const id of Object.keys(users))assert.ok(!JSON.stringify(r).includes(id),"no user IDs");
});
test("zero approved applicants returns explanatory count, not made-up volunteers",async()=>{
  const r=await summarizeStaging002Eligibility(dbFor({caseData:fictional}));
  assert.equal(r.status,"no_eligible_volunteers");
  assert.equal(r.reason,"no_approved_volunteer_applications");
  assert.equal(r.eligible,0);
  assert.equal(r.approvedApplications,0);
});
test("one accepted old task excludes only its Volunteer without mutating records",async()=>{
  const users={devin:person()}, apps=[app("devin")],assignments=[{id:"accepted001",data:{
    status:"accepted",caseId:"STAGING_TEST_001",volunteerId:"devin"
  }}];
  const before=JSON.stringify({users,apps,assignments});
  const r=await summarizeStaging002Eligibility(dbFor({caseData:fictional,users,apps,assignments}));
  assert.equal(r.excludedByReason.busy,1);
  assert.equal(r.eligible,0);
  assert.equal(JSON.stringify({users,apps,assignments}),before);
});
