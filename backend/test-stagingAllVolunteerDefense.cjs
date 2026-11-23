"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {chooseDefenseAllVolunteers,validateDefenseVolunteer}=
  require("./stagingAllVolunteerDefensePlanner");
const {startBatchOffers,respondBatchOffer}=require("./stagingBulkVolunteerOffers");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");

class Snap{
  constructor(db,path,data){this.db=db;this.path=path;this.id=path.slice(path.indexOf("/")+1);
    this.ref=db.docPath(path);this.exists=data!==undefined;this.value=data}
  data(){return this.value}
}
class Ref{
  constructor(db,collection,id){this.db=db;this.path=collection+"/"+id;this.id=id}
  async get(){return this.db.snapshot(this.path)}
}
class Query{
  constructor(db,collection,filters=[],limitSize=Infinity){
    this.db=db;this.collection=collection;this.filters=filters;this.limitSize=limitSize;
  }
  where(field,op,value){
    assert.ok(["==","in"].includes(op));
    return new Query(this.db,this.collection,[...this.filters,{field,op,value}],this.limitSize);
  }
  limit(n){return new Query(this.db,this.collection,this.filters,n)}
  async get(){
    const docs=[...this.db.docs].filter(([p])=>p.startsWith(this.collection+"/"))
      .map(([p,d])=>new Snap(this.db,p,d))
      .filter(s=>this.filters.every(f=>f.op==="=="?
        s.data()?.[f.field]===f.value:f.value.includes(s.data()?.[f.field])))
      .slice(0,this.limitSize);
    return {docs,size:docs.length,empty:docs.length===0};
  }
}
class Coll extends Query{
  doc(id){return new Ref(this.db,this.collection,id)}
}
class FakeDb{
  constructor(){this.docs=new Map()}
  collection(name){return new Coll(this,name)}
  docPath(path){const n=path.indexOf("/");return new Ref(this,path.slice(0,n),path.slice(n+1))}
  snapshot(path){return new Snap(this,path,this.docs.get(path))}
  seed(path,body){this.docs.set(path,body)}
  get(path){return this.docs.get(path)}
  list(name){return [...this.docs].filter(([p])=>p.startsWith(name+"/"))}
  async runTransaction(callback){
    const writes=[];
    const tx={
      get:r=>r.get(),
      create:(r,d)=>writes.push(["create",r.path,d]),
      update:(r,d)=>writes.push(["update",r.path,d]),
      delete:r=>writes.push(["delete",r.path])
    };
    const result=await callback(tx);
    const next=new Map(this.docs);
    for(const [op,path,data] of writes){
      if(op==="create")assert.equal(next.has(path),false,"never create duplicate");
      if(op==="update")assert.equal(next.has(path),true,"must update existing");
      if(op==="delete"){next.delete(path);continue}
      next.set(path,op==="update"?{...next.get(path),...data}:data);
    }
    this.docs=next;
    return result;
  }
}
function incident(){
  return {id:E2E_CASE_ID,title:E2E_CASE_TITLE,testOnly:true,
    testCategory:"staging_synthetic_volunteer_e2e_002",
    source:"staging_synthetic_e2e",
    status:"validated",verificationStatus:"validated",
    dispatchBlocked:false,reporterUid:"reporter",validatedBy:"qaAdmin",
    incidentBarangay:"Bagong Buhay I",requiredSkills:["Advanced Rescue"]};
}
function approved(uid,{barangay,skills=["Cooking"],...overrides}={}){
  return {uid,application:{uid,status:"approved",skills},
    user:{role:"volunteer",status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityVerified:true,
      ...(barangay===undefined?{}:{barangay}),
      skills,fullName:"FICTIONAL "+uid,...overrides}};
}
const roster=[
  approved("v1",{barangay:"Citrus"}),
  approved("v2",{barangay:"Outside SJDM"}),
  approved("v3"), // completely missing barangay also allowed for defense
  approved("v4",{overrides:true,status:"suspended"}),
  approved("v5",{identityVerified:false}),
  approved("v6",{volunteerAccess:false}),
  approved("v7"),
  approved("reporter")
];
function seed(){
  const db=new FakeDb();
  db.seed("disasterCases/"+E2E_CASE_ID,incident());
  for(const row of roster){
    db.seed("users/"+row.uid,row.user);
    db.seed("volunteerApplications/"+row.uid,row.application);
  }
  db.seed("responseAssignments/OLD_v7",{
    caseId:"OLD",volunteerId:"v7",status:"accepted"
  });
  return db;
}
const active=[{caseId:"OLD",volunteerId:"v7",status:"accepted"}];
test("NO BARANGAY/NO SKILL filter: all approved AVAILABLE fictional Volunteers get offers",()=>{
  const plan=chooseDefenseAllVolunteers(incident(),roster,{activeAssignments:active});
  assert.equal(plan.action,"offer_all");
  assert.equal(plan.wave,1);
  assert.deepEqual(plan.volunteers,["v1","v2","v3"]);
  assert.equal(validateDefenseVolunteer(incident(),roster[2]).eligible,true);
  assert.equal(roster[2].user.barangay,undefined,"Never mutate the real Volunteer profile");
});
test("invalid or real incidents always fail closed",()=>{
  for(const bad of [
    {...incident(),id:"REAL_EMERGENCY_123"},
    {...incident(),testOnly:false},
    {...incident(),testCategory:"different"},
    {...incident(),status:"reported"},
    {...incident(),dispatchBlocked:true},
  ]){
    const out=chooseDefenseAllVolunteers(bad,roster);
    assert.notEqual(out.action,"offer_all");
  }
});
test("server transaction invites 3 across ALL barangays; each own Accept/Decline works; duplicates protected",async()=>{
  const db=seed(),at=Date.now();
  const first=await startBatchOffers(db,"qaAdmin",at,
    {allAvailableNoBarangay:true});
  assert.deepEqual({status:first.status,wave:first.wave,offered:first.offered},
    {status:"offered",wave:1,offered:3});
  assert.equal(first.scope,"all_approved_available_test_volunteers");
  const tasks=db.list("responseAssignments").filter(([p,d])=>d.caseId===E2E_CASE_ID);
  assert.deepEqual(tasks.map(([p,d])=>d.volunteerId).sort(),["v1","v2","v3"]);
  for(const uid of ["v1","v2","v3"]){
    assert.equal(db.get("notifications/auto_response_"+E2E_CASE_ID+"_"+uid).userId,uid);
    assert.equal(db.get("responseAssignments/"+E2E_CASE_ID+"_"+uid).status,"offered");
  }
  assert.equal((await respondBatchOffer(db,"v1","accepted",at+1000)).status,"accepted");
  assert.equal((await respondBatchOffer(db,"v2","declined",at+1000)).status,"declined");
  assert.equal((await respondBatchOffer(db,"v3","accepted",at+1000)).status,"accepted");
  assert.equal(db.get("responderLocks/v1").caseId,E2E_CASE_ID);
  assert.equal(db.get("responderLocks/v3").caseId,E2E_CASE_ID);
  assert.equal(db.get("responderLocks/v2"),undefined);
  assert.equal(db.get("notifications/auto_batch_accepted_"+E2E_CASE_ID+"_v1").userId,"reporter");
  assert.equal(db.get("notifications/auto_batch_declined_"+E2E_CASE_ID+"_v2").userId,"qaAdmin");
  assert.equal((await respondBatchOffer(db,"v1","accepted",at+1000)).status,"already_accepted");
  assert.equal((await startBatchOffers(db,"qaAdmin",at+5000,
    {allAvailableNoBarangay:true})).status,"already_started");
  assert.equal(db.list("notifications").filter(([p,d])=>d.type==="response_assignment").length,3);
  assert.equal(db.get("responseAssignments/OLD_v7").status,"accepted",
    "Never change an existing accepted task");
});
test("without explicit defense flag default geography-matched behavior is unchanged",async()=>{
  const db=seed();
  const out=await startBatchOffers(db,"qaAdmin",Date.now());
  assert.notEqual(out.status,"offered",
    "Existing default cannot silently auto-invite outside-barangay Volunteers");
  assert.equal(db.get("emergencyAutoDispatchBatches/"+E2E_CASE_ID),undefined);
});
