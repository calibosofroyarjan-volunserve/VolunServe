"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {installCommunityPresence,publicKey}=require("./communityPresence");
const records={};
const profiles={
  alice:{status:"approved",role:"resident",residentAccess:true,activeMode:"resident",
    fullName:"Sample Basic",email:"private@example.com",address:"private location",phoneNumber:"09111111111"},
  beth:{status:"approved",role:"resident",residentAccess:true,identityVerified:true,
    volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",fullName:"Sample Volunteer"},
  admin:{status:"approved",role:"admin",residentAccess:false},
};
const db={
  collection(name){
    assert.equal(name,"communityPresence");
    return {
      doc(id){
        return {
          async get(){return {exists:Boolean(records[id]),data:()=>records[id]};},
          async set(value,options){assert.deepEqual(options,{merge:true});records[id]={...records[id],...value};},
        };
      },
      where(field,op,date){assert.equal(field,"updatedAt");assert.equal(op,">=");
        return {limit(n){assert.equal(n,72);return {async get(){
          const docs=Object.entries(records).filter(([,p])=>p.updatedAt >= date)
            .map(([id,p])=>({id,data:()=>p}));
          return {docs};
        }};}};
      },
    };
  },
};
const handlers={};
installCommunityPresence({
  app:{
    get(path,auth,handler){handlers["GET "+path]=handler;},
    post(path,auth,handler){handlers["POST "+path]=handler;},
  },
  db,requireFirebaseUser(){},
  async loadUserProfile(id){return profiles[id];},
  isApprovedAccount:p=>p?.status==="approved",
});
async function call(method,path,uid,body={},params={}){
  let status=200,json;
  const req={firebaseUser:{uid},body,params};
  const res={status(n){status=n;return this;},set(){return this;},json(x){json=x;return this;}};
  const handler=handlers[method+" "+path];
  assert(handler,path+" not installed");
  await handler(req,res);
  return {status,json};
}
const vis="/api/community/presence/visibility",hb="/api/community/presence/heartbeat",
  list="/api/community/presence",member="/api/community/members/:memberKey";
test("opt-in defaults OFF and never exposes an unconsented account",async()=>{
  assert.equal((await call("POST",hb,"alice")).json.visible,false);
  assert.deepEqual((await call("GET",list,"alice")).json.members,[]);
});
test("Basic Resident and approved Volunteer are listed in their canonical mode",async()=>{
  assert.equal((await call("POST",vis,"alice",{visible:true})).status,200);
  assert.equal((await call("POST",vis,"beth",{visible:true})).status,200);
  const a=await call("GET",list,"alice");
  assert.equal(a.status,200);
  assert.equal(a.json.counts.residents,1);
  assert.equal(a.json.counts.volunteers,1);
  assert(a.json.members.some(x=>x.badge==="Basic Resident"));
  assert(a.json.members.some(x=>x.badge==="Volunteer"));
  assert(a.json.members.every(x=>x.online===true && /^[a-f0-9]{24}$/.test(x.key)));
  const output=JSON.stringify(a.json);
  for(const secret of ["alice","beth","private@example.com","private location","09111111111"]){
    assert(!output.includes(secret),"Private identifier leaked: "+secret);
  }
});
test("profile link opens only for online, opted-in and authorized viewers",async()=>{
  const x=await call("GET",member,"alice",{}, {memberKey:publicKey("beth")});
  assert.equal(x.json.member.name,"Sample Volunteer");
  assert.equal((await call("GET",member,"admin",{}, {memberKey:publicKey("beth")})).status,403);
  assert.equal((await call("GET",member,"alice",{}, {memberKey:"bogus"})).status,400);
});
test("switching verified volunteer to Resident removes volunteer classification after heartbeat",async()=>{
  profiles.beth.activeMode="resident";
  const r=await call("POST",hb,"beth");assert.equal(r.json.mode,"resident");
  const a=await call("GET",list,"alice");
  assert.equal(a.json.counts.volunteers,0);
  assert.equal(a.json.counts.residents,2);
  assert(a.json.members.some(x=>x.name==="Sample Volunteer"&&x.badge==="Verified Resident"));
});
test("opt-out hides profile without affecting resident/volunteer access",async()=>{
  const r=await call("POST",vis,"beth",{visible:false});assert.equal(r.json.visible,false);
  assert.equal((await call("GET",member,"alice",{}, {memberKey:publicKey("beth")})).status,404);
  assert.equal((await call("GET",list,"alice")).json.members.length,1);
  assert.equal(profiles.beth.volunteerAccess,true);
});
test("invalid visibility is rejected, unapproved accounts are blocked",async()=>{
  assert.equal((await call("POST",vis,"alice",{visible:"true"})).status,400);
  assert.equal((await call("POST",vis,"admin",{visible:true})).status,403);
});
test("stale heartbeat expires and does not falsely report online",async()=>{
  records.alice.updatedAt=new Date(Date.now()-300000);
  const a=await call("GET",list,"alice");
  assert.equal(a.json.members.length,0);
});
