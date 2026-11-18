"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const {PROJECT,FIXTURES,fixtureSummary,provisionFixtures}=require("./staging002TestVolunteerProvisioning");

const ENV={
  VOLUNSERVE_STAGING_E2E_002_TEST_VOLUNTEERS:"enabled",
  VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:PROJECT,
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:PROJECT})
};
const PASSWORDS=["Qa9"+("A1aB2bC3cD4dE5eF6f"),"Qa9"+("G1gH2hJ3jK4kL5lM6m"),"Qa9"+("N1nP2pQ3qR4rS5sT6t")];
const CASE={
  title:E2E_CASE_TITLE,status:"validated",
  verificationStatus:"validated",dispatchBlocked:false,
  testOnly:true,testCategory:"staging_synthetic_volunteer_e2e_002",
  source:"staging_synthetic_e2e",reporterUid:"fakeResident"
};
class FakeDb {
  constructor(){
    this.docs=new Map([
      ["disasterCases/"+E2E_CASE_ID,CASE],
      ["responseAssignments/STAGING_TEST_001_devin",{status:"accepted",volunteerId:"devin"}],
      ["responderLocks/devin",{status:"accepted",responderUid:"devin"}]
    ]);
  }
  collection(col){
    return {doc:id=>{
      const key=col+"/"+id;
      return {key,
        get:async()=>this.read(key)
      };
    }};
  }
  read(key){
    const v=this.docs.get(key);
    return {exists:v!==undefined,data:()=>v};
  }
  async runTransaction(callback){
    const writes=[];
    const tx={
      get:async ref=>this.read(ref.key),
      create:(ref,data)=>writes.push([ref.key,data])
    };
    const result=await callback(tx);
    for(const [key] of writes)if(this.docs.has(key))throw Error("document_already_exists");
    for(const [key,value] of writes)this.docs.set(key,value);
    return result;
  }
}
class FakeAuth {
  constructor(){
    this.users=new Map();
    this.events=[];
  }
  async getUser(uid){
    if(!this.users.has(uid))throw Object.assign(new Error("not-found"),{code:"auth/user-not-found"});
    return this.users.get(uid);
  }
  async createUser(record){
    this.events.push({action:"create",uid:record.uid});
    if(this.users.has(record.uid))throw Error("uid-already-exists");
    this.users.set(record.uid,record);
    return {uid:record.uid};
  }
  async deleteUser(uid){
    this.events.push({action:"rollback",uid});
    this.users.delete(uid);
  }
}
test("only explicit separate staging Firebase project with an enabled gate can provision",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  for(const env of [{}, {...ENV,VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID:"volunserve-3aa5b"},
      {...ENV,FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-3aa5b"})}]){
    const r=await provisionFixtures({db,authClient,env,adminUid:"stagingAdmin",passwords:PASSWORDS});
    assert.equal(r.status,"blocked");
  }
  assert.equal(authClient.events.length,0);
});
test("no synthetic 002 or invalid state means absolutely zero accounts created",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  db.docs.delete("disasterCases/"+E2E_CASE_ID);
  assert.equal((await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:PASSWORDS})).status,"blocked");
  assert.equal(authClient.events.length,0);
});
test("invalid, weak, reused passwords always blocked before Auth or Firestore writes",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  for(const passwords of [["weak","weak","weak"],[PASSWORDS[0],PASSWORDS[0],PASSWORDS[1]],[]]){
    const result=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords});
    assert.equal(result.status,"blocked");
  }
  assert.equal(authClient.events.length,0);
});
test("exact three fixed FICTIONAL accounts created with First Aid Wave 1, never touch accepted 001",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  const before=JSON.stringify([
    db.docs.get("responseAssignments/STAGING_TEST_001_devin"),
    db.docs.get("responderLocks/devin")
  ]);
  const pre=await fixtureSummary({db,authClient,env:ENV});
  assert.deepEqual(pre.slots.map(s=>s.state),["available","available","available"]);
  const result=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:PASSWORDS});
  assert.equal(result.status,"ready");assert.equal(result.created,3);
  assert.equal(authClient.users.size,3);assert.equal(authClient.events.filter(e=>e.action==="create").length,3);
  for(const f of FIXTURES){
    const user=db.docs.get("users/"+f.uid);
    const application=db.docs.get("volunteerApplications/"+f.uid);
    assert.equal(user.testFixture,"STAGING_E2E_002");
    assert.equal(user.role,"volunteer");
    assert.equal(user.status,"approved");
    assert.equal(user.identityVerificationSource,"fictional_staging_fixture_not_real_id");
    assert.equal(user.barangay,"Bagong Buhay I");
    assert.deepEqual(user.skills,["First Aid"]);
    assert.equal(application.status,"approved");
    assert.equal(application.uid,f.uid);
  }
  assert.equal(JSON.stringify([
    db.docs.get("responseAssignments/STAGING_TEST_001_devin"),
    db.docs.get("responderLocks/devin")
  ]),before);
  const body=JSON.stringify(result);
  for(const p of PASSWORDS)assert.equal(body.includes(p),false,"No password in response");
  for(const val of db.docs.values())for(const p of PASSWORDS)assert.equal(JSON.stringify(val).includes(p),false,"No passwords in Firestore");
});
test("repeated request preserves old accounts and does not replace their passwords",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  const first=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:PASSWORDS});
  assert.equal(first.created,3);
  const other=["Qa9"+"c1H2J3K4L5M6N7O8P","Qa9"+"q1R2S3T4U5V6W7X8Y","Qa9"+"p1Q2R3S4T5U6V7W8X"];
  const again=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:other});
  assert.equal(again.created,0);
  assert.equal(again.alreadyExisting,3);
  assert.equal(authClient.events.filter(e=>e.action==="create").length,3);
  assert.equal(authClient.users.get(FIXTURES[0].uid).password,PASSWORDS[0]);
});
test("foreign existing Auth UID or Firestore document blocks ALL test accounts without overwriting",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  authClient.users.set(FIXTURES[1].uid,{uid:FIXTURES[1].uid,email:"foreign@example.com"});
  const result=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:PASSWORDS});
  assert.equal(result.status,"blocked");
  assert.equal(authClient.events.length,0);
  assert.equal(db.docs.has("users/"+FIXTURES[0].uid),false);
  assert.equal(authClient.users.get(FIXTURES[1].uid).email,"foreign@example.com");
});
test("partial Firestore error only rolls back Auth user newly created in same request",async()=>{
  const db=new FakeDb(),authClient=new FakeAuth();
  const transaction=db.runTransaction.bind(db);
  db.runTransaction=async callback=>{await callback({
    get:async ref=>db.read(ref.key),
    create:()=>{throw Error("write-failed");}
  });throw Error("write-failed");};
  const result=await provisionFixtures({db,authClient,env:ENV,adminUid:"admin",passwords:PASSWORDS});
  assert.equal(result.status,"blocked");
  assert.equal(authClient.users.size,0);
  assert.deepEqual(authClient.events.map(e=>e.action),["create","rollback"]);
  assert.equal(db.docs.has("responseAssignments/STAGING_TEST_001_devin"),true);
});