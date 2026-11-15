"use strict";
const assert = require("node:assert/strict");
const {createEngine, validAdjacencyConfig, INTERVAL_MS} =
  require("../functions/emergencyAutoDispatchCore");

class FakeSnap {
  constructor(id, ref, value) { this.id=id; this.ref=ref; this.value=value; this.exists=value!==undefined; }
  data() { return this.value; }
}
class FakeRef {
  constructor(db,collection,id){this.db=db;this.collection=collection;this.id=id;this.path=collection+"/"+id;}
  async get(){return new FakeSnap(this.id,this,this.db.data.get(this.path));}
}
class FakeQuery {
  constructor(db,collection,filters=[],take=Infinity){this.db=db;this.collection=collection;this.filters=filters;this.take=take;}
  where(field,op,value){return new FakeQuery(this.db,this.collection,[...this.filters,{field,op,value}],this.take);}
  limit(n){return new FakeQuery(this.db,this.collection,this.filters,n);}
  async get(){
    const docs=[...this.db.data.entries()].filter(([key])=>key.startsWith(this.collection+"/"))
      .map(([key,value])=>new FakeSnap(key.slice(this.collection.length+1),this.db.docPath(key),value))
      .filter(doc=>this.filters.every(f=>{
        const candidate=doc.data()?.[f.field];
        if(f.op==="==")return candidate===f.value;
        if(f.op==="in")return f.value.includes(candidate);
        throw Error("unsupported query "+f.op);
      })).slice(0,this.take);
    return {docs,size:docs.length,empty:docs.length===0};
  }
}
class FakeCollection extends FakeQuery {
  constructor(db,name){super(db,name);this.db=db;this.name=name;}
  doc(id){return new FakeRef(this.db,this.name,id);}
}
class FakeDb {
  constructor(){this.data=new Map();}
  collection(name){return new FakeCollection(this,name);}
  docPath(path){const slash=path.indexOf("/");return new FakeRef(this,path.slice(0,slash),path.slice(slash+1));}
  seed(path,data){this.data.set(path,data);}
  get(path){return this.data.get(path);}
  async runTransaction(fn) {
    const pending=[];
    const tx={
      get:(ref)=>ref.get(),
      set:(ref,data,options={})=>pending.push(["set",ref.path,data,options]),
      update:(ref,data)=>pending.push(["update",ref.path,data]),
      create:(ref,data)=>pending.push(["create",ref.path,data]),
      delete:(ref)=>pending.push(["delete",ref.path]),
    };
    const result=await fn(tx);
    for(const [op,key,data,opts] of pending){
      if(op==="create"&&this.data.has(key))throw Error("Fake duplicate "+key);
      if(op==="update"&&!this.data.has(key))throw Error("Fake update missing "+key);
      if(op==="delete"){this.data.delete(key);continue;}
      this.data.set(key,op==="update"||(op==="set"&&opts?.merge)?
        {...this.data.get(key),...data}:data);
    }
    return result;
  }
}
const barangays=require("../functions/sjdmBarangays.json");
function seedCase(db,id){
  db.seed("disasterCases/"+id,{
    status:"validated",verificationStatus:"validated",dispatchBlocked:false,incidentBarangay:"Bagong Buhay I",
    reporterUid:"resident-1",validatedBy:"admin-1",severity:"critical",title:"Test flood",
    requiredSkills:["First Aid"],
  });
}
function seedVolunteer(db,uid,barangay){
  db.seed("users/"+uid,{
    role:"volunteer",fullName:uid,barangay,volunteerAccess:true,volunteerStatus:"approved",
    identityVerified:true,status:"approved",skills:["First Aid"],
  });
  db.seed("volunteerApplications/"+uid,{uid,fullName:uid,status:"approved",skills:["First Aid"]});
}
function seedConfig(db,neighbors=true){
  if(neighbors)db.seed("systemSettings/emergencyVolunteerMatching",{
    enabled:true,approved:true,neighborsByBarangay:{"Bagong Buhay I":["Bagong Buhay II"]},
  });
}
async function testDeclineAndAccept() {
  const db=new FakeDb();let clock=100000;
  seedCase(db,"case1");seedConfig(db);
  seedVolunteer(db,"v1","Bagong Buhay I");
  seedVolunteer(db,"v2","Bagong Buhay II");
  seedVolunteer(db,"v3","Francisco Homes-Narra");
  const engine=createEngine({db,clock:()=>clock,log:{warn(){},error(){}}});
  const first=await engine.advanceCase("case1");
  assert.deepEqual(first,{action:"offered",wave:1,uid:"v1"});
  assert.equal(db.get("responseAssignments/case1_v1").status,"offered");
  assert.equal(db.get("emergencyAutoDispatch/case1").wave,1);
  assert.equal((await engine.advanceCase("case1")).action,"waiting");
  assert.equal([...db.data.keys()].filter(k=>k.startsWith("notifications/auto_response")).length,1);
  db.seed("responseAssignments/case1_v1",
    {...db.get("responseAssignments/case1_v1"),status:"declined"});
  await engine.onAssignmentChanged("case1_v1",{status:"offered"},{status:"declined",caseId:"case1"});
  assert.equal(db.get("emergencyAutoDispatch/case1").wave,2);
  assert.equal(db.get("responseAssignments/case1_v2").status,"offered");
  assert.equal(db.get("autoVolunteerReservations/v1"),undefined);
  db.seed("responseAssignments/case1_v2",
    {...db.get("responseAssignments/case1_v2"),status:"accepted"});
  await engine.onAssignmentChanged("case1_v2",{status:"offered"},{status:"accepted",caseId:"case1"});
  assert.equal(db.get("emergencyAutoDispatch/case1").status,"accepted");
  assert.equal(db.get("responseAssignments/case1_v3"),undefined);
  db.seed("responseAssignments/case1_v2",
    {...db.get("responseAssignments/case1_v2"),status:"completed"});
  await engine.onAssignmentChanged("case1_v2",{status:"accepted"},
    {status:"completed",caseId:"case1"});
  assert.equal(db.get("emergencyAutoDispatch/case1").status,"completed");
  assert.equal(db.get("autoVolunteerReservations/v2"),undefined);
  clock+=INTERVAL_MS*20;
  assert.equal((await engine.sweep()).due,0);
}
async function testTimedOutOffer() {
  const db=new FakeDb();let clock=200000;
  seedCase(db,"case2");seedConfig(db);
  seedVolunteer(db,"t1","Bagong Buhay I");seedVolunteer(db,"t2","Bagong Buhay II");
  const engine=createEngine({db,clock:()=>clock,log:{warn(){},error(){}}});
  await engine.advanceCase("case2");
  clock+=INTERVAL_MS+1;
  const sweep=await engine.sweep();
  assert.equal(sweep.due,1);
  assert.equal(db.get("responseAssignments/case2_t1").status,"cancelled");
  assert.equal(db.get("emergencyAutoDispatch/case2").wave,2);
  assert.equal(db.get("responseAssignments/case2_t2").status,"offered");
  assert.equal(db.get("autoVolunteerReservations/t1"),undefined);
  clock+=INTERVAL_MS+1;
  await engine.sweep();
  assert.equal(db.get("responseAssignments/case2_t2").status,"cancelled");
  assert.equal(db.get("emergencyAutoDispatch/case2").status,"needs_admin");
  assert.equal(db.get("notifications/auto_escalation_case2").userId,"admin-1");
}
async function testFullThreeWavesAndAdminOverride() {
  const db=new FakeDb();let now=100000;
  seedCase(db,"case7");seedConfig(db);
  seedVolunteer(db,"w1","Bagong Buhay I");
  seedVolunteer(db,"w2","Bagong Buhay II");
  seedVolunteer(db,"w3","Francisco Homes-Narra");
  const engine=createEngine({db,clock:()=>now,log:{warn(){},error(){}}});
  await engine.advanceCase("case7");
  for(const [id,nextWave] of [["w1",2],["w2",3]]) {
    const key="case7_"+id;
    db.seed("responseAssignments/"+key,{
      ...db.get("responseAssignments/"+key),status:"declined"});
    await engine.onAssignmentChanged(key,{status:"offered"},
      {status:"declined",caseId:"case7"});
    assert.equal(db.get("emergencyAutoDispatch/case7").wave,nextWave);
  }
  assert.equal(db.get("responseAssignments/case7_w3").status,"offered");
  const stop=await engine.disableCase("case7");
  assert.equal(stop.action,"disabled");
  assert.equal(db.get("responseAssignments/case7_w3").status,"cancelled");
  assert.equal(db.get("autoVolunteerReservations/w3"),undefined);
  assert.equal(db.get("disasterCases/case7").autoVolunteerDispatch.state,"disabled");
  assert.equal((await engine.advanceCase("case7")).reason,"disabled");
  assert.equal((await engine.requestAdminStart("case7")).action,"admin_review");
  assert.equal(db.get("emergencyAutoDispatch/case7").status,"needs_admin");
}
async function testMisconfigAndLocks() {
  const db=new FakeDb();
  seedCase(db,"case3");
  seedVolunteer(db,"n1","Francisco Homes-Narra");
  const engine=createEngine({db,clock:()=>100000,log:{warn(){},error(){}}});
  const result=await engine.advanceCase("case3");
  assert.deepEqual(result,{action:"offered",wave:3,uid:"n1"});
  assert.equal(db.get("emergencyAutoDispatch/case3").status,"waiting");
  assert.equal(db.get("responseAssignments/case3_n1").status,"offered");
  // No verified nearby-barangay list means NO Wave-2 claim, but eligible
  // citywide Volunteers are still reachable with explicit acceptance.
  const noVolunteer=new FakeDb();
  seedCase(noVolunteer,"case0");
  const emptyEngine=createEngine({db:noVolunteer,clock:()=>100000,log:{warn(){},error(){}}});
  assert.equal((await emptyEngine.advanceCase("case0")).action,"admin_review");
  assert.equal(noVolunteer.get("emergencyAutoDispatch/case0").status,"needs_admin");
  assert.equal(noVolunteer.get("notifications/auto_escalation_case0").userId,"admin-1");
  assert.equal(validAdjacencyConfig({approved:true,enabled:true,
    neighborsByBarangay:{"Bagong Buhay I":["Outside SJDM"]}},barangays),null);
  const blocked=new FakeDb();seedCase(blocked,"case4");seedConfig(blocked);
  seedVolunteer(blocked,"only","Bagong Buhay I");
  blocked.seed("responderLocks/only",{assignmentId:"busy_case",caseId:"busy"});
  const guarded=createEngine({db:blocked,clock:()=>100000,log:{warn(){},error(){}}});
  const step=await guarded.advanceCase("case4");
  assert.equal(step.action,"retry");
  assert.equal(blocked.get("responseAssignments/case4_only"),undefined);
  const unverified=new FakeDb();seedCase(unverified,"case5");seedConfig(unverified);
  unverified.seed("disasterCases/case5",{...unverified.get("disasterCases/case5"),
    verificationStatus:"pending_verification"});
  const stop=createEngine({db:unverified,clock:()=>100000});
  assert.equal((await stop.advanceCase("case5")).action,"stop");
  assert.equal(unverified.get("emergencyAutoDispatch/case5"),undefined);
  const acceptance=new FakeDb();seedCase(acceptance,"case6");seedConfig(acceptance);
  seedVolunteer(acceptance,"n1","Bagong Buhay I");
  const cancelEngine=createEngine({db:acceptance,clock:()=>100000,log:{warn(){},error(){}}});
  await cancelEngine.advanceCase("case6");
  acceptance.seed("responseAssignments/case6_n1",
    {...acceptance.get("responseAssignments/case6_n1"),status:"accepted"});
  await cancelEngine.onAssignmentChanged("case6_n1",{status:"offered"},
    {status:"accepted",caseId:"case6"});
  acceptance.seed("responseAssignments/case6_n1",
    {...acceptance.get("responseAssignments/case6_n1"),status:"cancelled"});
  await cancelEngine.onAssignmentChanged("case6_n1",{status:"accepted"},
    {status:"cancelled",caseId:"case6"});
  assert.equal(acceptance.get("emergencyAutoDispatch/case6").status,"needs_admin");
  assert.equal(acceptance.get("autoVolunteerReservations/n1"),undefined);
}
(async()=>{
  await testDeclineAndAccept();
  await testTimedOutOffer();
  await testFullThreeWavesAndAdminOverride();
  await testMisconfigAndLocks();
  console.log("PASS: automatic Wave 1→2, single offer, decline/timeout/accept, concurrency locks, no false-nearby or unverified dispatch");
})().catch(e=>{console.error(e);process.exitCode=1;});
