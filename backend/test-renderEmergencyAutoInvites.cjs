"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  config,isRecentSubmission,approvedRoster,makeEngine,ORIGIN
}=require("./renderEmergencyAutoInvites");

const ENV={
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-volunteer-staging"}),
  VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-volunteer-staging",
  VOLUNSERVE_RENDER_AUTO_ENABLED:"true"
};
const NOW=1795410000000;
const timestamp=()=>({toMillis:()=>NOW});
const stamp=()=>({toMillis:()=>NOW,stub:true});
const FieldValue={serverTimestamp:stamp};
const REPORTER="test_resident";
const CASE="test_render_resident_case_001";
const PROFILES=["test_vol_1","test_vol_2","test_vol_3"];

class FakeSnap{
  constructor(ref,value){this.ref=ref;this.id=ref.id;this.exists=value!==undefined;this.value=value;}
  data(){return this.value;}
}
class FakeRef{
  constructor(db,col,id){this.db=db;this.col=col;this.id=id;this.path=col+"/"+id;}
  async get(){return new FakeSnap(this,this.db.data.get(this.path));}
}
class Query{
  constructor(db,col,filter=[],limitN=Infinity,skip=null){
    this.db=db;this.col=col;this.filter=filter;this.limitN=limitN;this.skip=skip;
  }
  where(field,op,value){
    assert.equal(op,"==");
    return new Query(this.db,this.col,this.filter.concat([[field,value]]),this.limitN,this.skip);
  }
  orderBy(field){assert.equal(field,"__name__");return this;}
  limit(n){return new Query(this.db,this.col,this.filter,n,this.skip);}
  startAfter(snap){return new Query(this.db,this.col,this.filter,this.limitN,snap.id);}
  async get(){
    const docs=[...this.db.data.entries()]
      .filter(([key])=>key.startsWith(this.col+"/")&&!key.slice(this.col.length+1).includes("/"))
      .map(([key,value])=>new FakeSnap(
        new FakeRef(this.db,this.col,key.slice(this.col.length+1)),value))
      .sort((a,b)=>a.id.localeCompare(b.id))
      .filter(s=>!this.skip||s.id>this.skip)
      .filter(s=>this.filter.every(([f,v])=>s.data()?.[f]===v))
      .slice(0,this.limitN);
    return {docs,size:docs.length};
  }
}
class FakeDB{
  constructor(){this.data=new Map();}
  collection(c){const db=this;return {doc(id){return new FakeRef(db,c,id)},where(...q){return new Query(db,c).where(...q)},orderBy(...q){return new Query(db,c).orderBy(...q)}};}
  async runTransaction(callback){
    const staged=[];
    const tx={
      get:r=>r.get(),
      create:(r,v)=>staged.push(["create",r,v]),
      update:(r,v)=>staged.push(["update",r,v]),
      delete:r=>staged.push(["delete",r])
    };
    const result=await callback(tx);
    for(const [op,r,value] of staged){
      const old=this.data.get(r.path);
      if(op==="create"){
        assert.equal(old,undefined,"duplicate document "+r.path);
        this.data.set(r.path,value);
      } else if(op==="delete")this.data.delete(r.path);
      else {
        assert.notEqual(old,undefined,"update missing "+r.path);
        const updated={...old};
        for(const [key,val] of Object.entries(value)){
          if(key.includes(".")){
            const parts=key.split(".");
            let target=updated;
            for(const part of parts.slice(0,-1))target=target[part]||={};
            target[parts.at(-1)]=val;
          }else updated[key]=val;
        }
        this.data.set(r.path,updated);
      }
    }
    return result;
  }
}
function report(id=CASE){
  return {id,reporterUid:REPORTER,title:"TEST ONLY - emergency for demo",
    testOnly:true,source:"resident_emergency_assistance",
    requestKind:"emergency_assistance",status:"reported",
    verificationStatus:"pending_verification",severity:"low",
    attachments:[{type:"image",url:"https://example.invalid/evidence.jpg"}],
    latitude:14.817,longitude:121.045,createdAt:timestamp(),
    resolvedAt:null,closedAt:null};
}
function seed(){
  const db=new FakeDB();
  db.data.set("disasterCases/"+CASE,report());
  for(const uid of PROFILES){
    db.data.set("users/"+uid,{role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,fullName:"FICTIONAL "+uid});
    db.data.set("volunteerApplications/"+uid,{uid,status:"approved"});
  }
  return db;
}
test("render dispatch is FAIL CLOSED on production without explicit approval",()=>{
  assert.equal(config({}).enabled,false);
  assert.equal(config({...ENV,VOLUNSERVE_RENDER_AUTO_ENABLED:"false"}).enabled,false);
  const production={
    ...ENV,
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-3aa5b"}),
    VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-3aa5b"
  };
  assert.equal(config(production).enabled,false);
  assert.equal(config({...production,VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED:"true"}).enabled,true);
  assert.equal(config({...ENV,VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-3aa5b"}).enabled,false);
});
test("report owner, proof, geolocation, freshness, and stage-only TEST label required",()=>{
  const good=report();
  assert.equal(isRecentSubmission(good,REPORTER,NOW,{staging:true}),true);
  for(const bad of [
    {...good,reporterUid:"spoof"},
    {...good,attachments:[]},
    {...good,source:"other"},
    {...good,latitude:50},
    {...good,status:"validated"},
    {...good,createdAt:{toMillis:()=>NOW-11*60*1000}},
    {...good,testOnly:false},
    {...good,title:"Unmarked real emergency"}
  ])assert.equal(isRecentSubmission(bad,REPORTER,NOW,{staging:true}),false);
});
test("Resident SUBMIT -> 3 independently offered and notified; 2 Accept 1 Decline; replay idempotent",async()=>{
 const db=seed();
 const engine=makeEngine({db,FieldValue,env:ENV,clock:()=>NOW});
 const profile={role:"resident",status:"approved",residentAccess:true};
 const first=await engine.submitted({uid:REPORTER,caseId:CASE,profile});
 assert.deepEqual([first.status,first.offered,first.newlyCreated],["completed",3,3]);
 for(const uid of PROFILES){
   const a=db.data.get("responseAssignments/"+CASE+"_"+uid);
   const n=db.data.get("notifications/auto_response_"+CASE+"_"+uid);
   assert.equal(a.offerMode,ORIGIN);
   assert.equal(a.status,"offered");
   assert.equal(n.userId,uid);
 }
 const c=db.data.get("disasterCases/"+CASE);
 assert.equal(c.verificationStatus,"pending_verification");
 assert.equal(c.status,"reported","Never auto-validate or alter real emergency review");
 assert.equal(c.autoVolunteerDispatch.attemptedCount,3);
 const replay=await engine.submitted({uid:REPORTER,caseId:CASE,profile});
 assert.equal(replay.status,"already_completed");
 assert.equal(db.data.size,19);
 assert.equal((await engine.respond({uid:"spoof",caseId:CASE,decision:"accepted"})).status,"blocked");
 const decisions=["accepted","accepted","declined"];
 for(let i=0;i<3;i++){
   const decision=await engine.respond({uid:PROFILES[i],caseId:CASE,decision:decisions[i]});
   assert.equal(decision.status,decisions[i]);
 }
 const statuses=PROFILES.map(uid=>db.data.get("responseAssignments/"+CASE+"_"+uid).status);
 assert.deepEqual(statuses,decisions);
 assert.equal(db.data.get("responderLocks/"+PROFILES[0]).status,"accepted");
 assert.equal(db.data.get("responderLocks/"+PROFILES[1]).status,"accepted");
 assert.equal(db.data.get("responderLocks/"+PROFILES[2]),undefined);
 assert.equal(db.data.get("autoVolunteerReservations/"+PROFILES[2]),undefined);
 assert.equal((await engine.respond({uid:PROFILES[0],caseId:CASE,decision:"accepted"})).status,"already_accepted");
});
test("More than 40 Volunteer applications are visited in paginated 25-record pages",async()=>{
 const db=seed();
 const caseId="test_render_over40";
 db.data.set("disasterCases/"+caseId,report(caseId));
 for(let i=0;i<43;i++){
   const uid="test_extra_"+String(i).padStart(3,"0");
   db.data.set("users/"+uid,{role:"volunteer",status:"approved",
     volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,fullName:uid});
   db.data.set("volunteerApplications/"+uid,{uid,status:"approved"});
 }
 const roster=await approvedRoster(db);
 assert.equal(roster.length,46);
 const result=await makeEngine({db,FieldValue,env:ENV,clock:()=>NOW})
   .submitted({uid:REPORTER,caseId,profile:{role:"resident",status:"approved",residentAccess:true}});
 assert.equal(result.status,"completed");
 assert.equal(result.offered,46);
 for(const uid of roster)
   assert.equal(db.data.get("responseAssignments/"+caseId+"_"+uid)?.status,"offered");
});
test("Gate OFF does not fetch or write Firestore",async()=>{
 const db=seed();
 const oldSize=db.data.size;
 const outcome=await makeEngine({db,FieldValue,env:{},clock:()=>NOW})
   .submitted({uid:REPORTER,caseId:CASE,profile:{}});
 assert.equal(outcome.status,"disabled");
 assert.equal(db.data.size,oldSize);
});
