"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  dispatchEnabled,approvedTransition,volunteerAllowed,
  makeApprovedCaseAutoInviteHandler,makeAutoVolunteerDecisionHandler
}=require("./emergencySimpleAutoInvite");

const ENV={GCLOUD_PROJECT:"demo-volunserve-simple-invites",
  VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"demo-volunserve-simple-invites",
  VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED:"true"};
const NOW=1795400000000;
const ADMIN="fictional_admin",REPORTER="fictional_reporter";
const CASE="demo_case_auto_001";
const stamp=()=>({serverStamp:true});
const FieldValue={serverTimestamp:stamp};
class Snap{
  constructor(db,path,data){this.ref=db.document(path);this.id=path.split("/").pop();this.exists=data!==undefined;this._data=data}
  data(){return this._data}
}
class Ref{
  constructor(db,path){this.db=db;this.path=path;this.id=path.split("/").pop()}
  get(){return Promise.resolve(this.db.snapshot(this.path))}
}
class Query{
  constructor(db,name,filters=[],take=Infinity){this.db=db;this.name=name;this.filters=filters;this.take=take}
  where(key,operator,value){return new Query(this.db,this.name,[...this.filters,{key,operator,value}],this.take)}
  limit(n){return new Query(this.db,this.name,this.filters,n)}
  get(){
    const docs=[...this.db.records].filter(([path])=>path.startsWith(this.name+"/"))
      .map(([path,data])=>new Snap(this.db,path,data))
      .filter(x=>this.filters.every(({key,operator,value})=>
        operator==="=="?x.data()?.[key]===value:value.includes(x.data()?.[key])))
      .slice(0,this.take);
    return Promise.resolve({docs,size:docs.length,empty:docs.length===0});
  }
}
class Collection extends Query{
  doc(id){return this.db.document(this.name+"/"+id)}
}
class FakeDb{
  constructor(){this.records=new Map()}
  collection(name){return new Collection(this,name)}
  document(path){return new Ref(this,path)}
  snapshot(path){return new Snap(this,path,this.records.get(path))}
  seed(path,data){this.records.set(path,data)}
  data(path){return this.records.get(path)}
  list(prefix){return [...this.records.entries()].filter(([key])=>key.startsWith(prefix+"/"))}
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:r=>r.get(),
      create:(r,data)=>writes.push(["create",r.path,data]),
      update:(r,data)=>writes.push(["update",r.path,data]),
      delete:r=>writes.push(["delete",r.path])
    };
    const outcome=await fn(tx);
    const copy=new Map(this.records);
    for(const [op,path,data] of writes){
      if(op==="create")assert.equal(copy.has(path),false,"Duplicate Firestore create");
      if(op==="update")assert.equal(copy.has(path),true,"Cannot update missing Firestore doc");
      if(op==="delete"){copy.delete(path);continue}
      const before=copy.get(path)||{};
      const next=op==="update"?{...before}:data;
      if(op==="update"){
        for(const [key,value] of Object.entries(data)){
          if(key.includes(".")){
            const [a,b]=key.split(".");
            next[a]={...(next[a]||{}),[b]:value};
          }else next[key]=value;
        }
      }
      copy.set(path,next);
    }
    this.records=copy;
    return outcome;
  }
}
const incident=()=>({
  title:"FAKE / NO REAL EMERGENCY",reporterUid:REPORTER,
  verificationStatus:"validated",status:"validated",dispatchBlocked:false,
  validatedBy:ADMIN,validatedAt:{toMillis:()=>NOW},
  incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
  reporterBarangay:"Bagong Buhay I"
});
function add(db,uid,options={}){
  db.seed("users/"+uid,{
    role:"volunteer",status:"approved",identityVerified:true,
    volunteerAccess:true,volunteerStatus:"approved",
    fullName:"FAKE "+uid,...options
  });
  db.seed("volunteerApplications/"+uid,{
    uid,status:"approved",skills:["Cooking"]
  });
}
function fixture(){
  const db=new FakeDb();
  db.seed("disasterCases/"+CASE,incident());
  db.seed("users/"+ADMIN,{role:"admin",status:"approved"});
  db.seed("users/"+REPORTER,{role:"resident",status:"approved"});
  add(db,"v_a",{barangay:"Citrus"});
  add(db,"v_b",{}); // no barangay
  add(db,"v_c",{barangay:"Bagong Buhay I"});
  add(db,"busy",{barangay:"Citrus"});
  add(db,"suspended",{status:"suspended"});
  add(db,"unverified",{identityVerified:false});
  add(db,REPORTER);
  db.seed("responseAssignments/different_busy",{caseId:"different",volunteerId:"busy",status:"accepted"});
  return db;
}
function event(){return {params:{caseId:CASE},data:{
  before:{data:()=>({status:"reported",verificationStatus:"pending_verification"})},
  after:{data:()=>incident()}
}}}
const approval=db=>makeApprovedCaseAutoInviteHandler({db,FieldValue,env:ENV,clock:()=>NOW});
const decide=db=>makeAutoVolunteerDecisionHandler({db,FieldValue,env:ENV});

test("off by default, strict project gate, and Admin transition only",()=>{
  assert.equal(dispatchEnabled({}),false);
  assert.equal(dispatchEnabled({...ENV,GCLOUD_PROJECT:"volunserve-3aa5b"}),false);
  assert.equal(dispatchEnabled({...ENV,GCLOUD_PROJECT:"volunserve-3aa5b",
    VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"volunserve-3aa5b"}),false);
  assert.equal(dispatchEnabled({...ENV,GCLOUD_PROJECT:"volunserve-3aa5b",
    VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:"volunserve-3aa5b",
    VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED:"true"}),true);
  assert.equal(approvedTransition({verificationStatus:"pending"},incident()),true);
  assert.equal(approvedTransition({verificationStatus:"validated"},incident()),false);
  assert.equal(approvedTransition({}, {...incident(),dispatchBlocked:true}),false);
});
test("all-area case eligibility excludes reporter, revoked identity, suspended and busy",()=>{
  const db=fixture(),c=incident();
  assert.equal(volunteerAllowed(c,"v_b",db.data("volunteerApplications/v_b"),
    db.data("users/v_b"),[]),true);
  assert.equal(volunteerAllowed(c,"v_a",db.data("volunteerApplications/v_a"),
    db.data("users/v_a"),[]),true);
  for(const uid of ["busy","suspended","unverified",REPORTER]){
    const active=uid==="busy"?[db.data("responseAssignments/different_busy")]:[];
    assert.equal(volunteerAllowed(c,uid,db.data("volunteerApplications/"+uid),
      db.data("users/"+uid),active),false,uid);
  }
});
test("REAL transactional-shaped approval creates exactly 3 task offers and inbox notifications without barangay check",async()=>{
  const db=fixture();
  const a=await approval(db)(event());
  assert.deepEqual({status:a.status,offered:a.offered},{status:"offered",offered:3});
  const offers=db.list("responseAssignments").map(([k,d])=>d)
    .filter(d=>d.caseId===CASE);
  assert.deepEqual(offers.map(d=>d.volunteerId).sort(),["v_a","v_b","v_c"]);
  assert.ok(offers.every(d=>d.status==="offered"&&
    d.offerMode==="automatic_all_volunteers_no_barangay"));
  for(const uid of ["v_a","v_b","v_c"]){
    assert.equal(db.data("notifications/auto_response_"+CASE+"_"+uid).userId,uid);
    assert.equal(db.data("autoVolunteerReservations/"+uid).caseId,CASE);
  }
  assert.equal(db.data("disasterCases/"+CASE).status,"assigned");
  assert.equal((await approval(db)(event())).status,"already_started");
  assert.equal(db.list("notifications").length,3,"no re-notification on retry");
  assert.equal(db.data("responseAssignments/different_busy").status,"accepted",
    "Unrelated existing assignment must remain unchanged");
});
test("2 Accept + 1 Decline use secure server transaction, locks and notices",async()=>{
  const db=fixture();
  await approval(db)(event());
  assert.equal((await decide(db)({uid:"v_a",caseId:CASE,decision:"accepted"})).status,"accepted");
  assert.equal((await decide(db)({uid:"v_b",caseId:CASE,decision:"declined"})).status,"declined");
  assert.equal((await decide(db)({uid:"v_c",caseId:CASE,decision:"accepted"})).status,"accepted");
  assert.equal(db.data("responderLocks/v_a").assignmentId,CASE+"_v_a");
  assert.equal(db.data("responderLocks/v_c").assignmentId,CASE+"_v_c");
  assert.equal(db.data("responderLocks/v_b"),undefined);
  assert.equal(db.data("autoVolunteerReservations/v_b"),undefined);
  assert.equal(db.data("notifications/auto_decision_"+CASE+"_v_a").userId,REPORTER);
  assert.equal(db.data("notifications/auto_decision_"+CASE+"_v_b").userId,ADMIN);
  assert.equal(db.data("emergencyAutoDispatchBatches/"+CASE).status,"supported");
  assert.equal((await decide(db)({uid:"v_a",caseId:CASE,decision:"accepted"})).status,"already_accepted");
  assert.equal((await decide(db)({uid:"v_a",caseId:CASE,decision:"declined"})).status,"blocked");
  assert.equal(db.list("notifications").length,6);
});
test("Cannot impersonate, send to unknown case, disable guard or reassign an existing case",async()=>{
  const db=fixture();
  await approval(db)(event());
  assert.equal((await decide(db)({uid:"outsider",caseId:CASE,decision:"accepted"})).status,"blocked");
  assert.equal((await decide(db)({uid:"v_a",caseId:"real_case_other",decision:"accepted"})).status,"blocked");
  assert.equal((await makeAutoVolunteerDecisionHandler({db,FieldValue,env:{}})(
    {uid:"v_a",caseId:CASE,decision:"accepted"})).status,"disabled");
  const wrong=fixture();
  wrong.seed("responseAssignments/"+CASE+"_other",{
    caseId:CASE,volunteerId:"other",status:"accepted"
  });
  assert.equal((await approval(wrong)(event())).status,"already_started");
  assert.equal(wrong.data("notifications/auto_response_"+CASE+"_v_a"),undefined);
});
test("Do not silently omit eligible Volunteers when safe one-batch limit exceeded",async()=>{
  const db=fixture();
  for(let i=0;i<41;i++)add(db,"extra_"+i);
  const r=await approval(db)(event());
  assert.equal(r.status,"blocked");
  assert.equal(r.reason,"over_40_eligible_volunteers");
  assert.equal(db.data("emergencyAutoDispatchBatches/"+CASE),undefined);
  assert.equal(db.data("disasterCases/"+CASE).status,"validated");
});
