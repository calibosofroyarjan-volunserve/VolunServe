"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Writable } = require("node:stream");
const express = require("express");
const { installLguCredentialRoutes, imageMime } = require("../lguCredentialRoutes");

const JPEG = Buffer.from([0xff,0xd8,0xff,0xe1,0x00,0x01,0x45,0x58,0x49,0x46,0x00,0x00,0x00,0xff,0xd9]);
const APPLICANT = "applicant-credential-01";
const REJECTED = "applicant-rejected-02";
const SUPERADMIN = "programmer-superadmin-01";
const ORDINARY_ADMIN = "ordinary-lgu-admin-01";
const PROOF_TYPES = ["staff-id", "appointment-letter"];
function createFakeDb(){
  const data=new Map(), audit=[];
  let sequence=0;
  function ref(path) {
    return {
      path,
      async get(){return {exists:data.has(path),data:()=>data.get(path)}},
    };
  }
  function collection(name){
    return { doc(id){return ref(name+"/"+(id||"generated-"+(++sequence))) } };
  }
  const db={collection,
    async runTransaction(callback){
      const writes=[];
      const tx={
        async get(r){return r.get()},
        set(r,value){writes.push(()=>data.set(r.path,{...value}))},
        create(r,value){if(data.has(r.path))throw Error("Existing document");writes.push(()=>data.set(r.path,{...value}))},
        update(r,value){writes.push(()=>data.set(r.path,{...data.get(r.path),...value}))},
        delete(r){writes.push(()=>data.delete(r.path))},
      };
      const result=await callback(tx);
      for(const write of writes)write();
      return result;
    },
  };
  return {db,data,audit};
}
function mockCloudinary(){
  const uploads=[];
  return {
    uploads,
    uploader: {
      upload_stream(opts, callback){
        const chunks=[];
        return new Writable({
          write(chunk,_enc,next){chunks.push(chunk);next()},
          final(next){
            uploads.push({opts,bytes:Buffer.concat(chunks)});
            callback(null,{
              asset_id:"asset-"+uploads.length,
              public_id:opts.public_id,format:"jpg",resource_type:"image",type:"authenticated",
            });
            next();
          },
        });
      },
      async destroy(){return {result:"ok"}},
    },
    utils:{
      private_download_url(id,format,params){
        assert.equal(params.type,"authenticated");
        assert.equal(params.resource_type,"image");
        assert(params.expires_at > Date.now()/1000);
        assert(format==="jpg");
        return "https://res.cloudinary.com/test/image/authenticated/"+id+".jpg?private_token=temporary";
      },
    },
  };
}
async function serve(t) {
  const store=createFakeDb(), cloudinary=mockCloudinary();
  store.data.set("users/"+SUPERADMIN,{role:"superadmin",status:"approved",fullName:"Programmer Super Admin"});
  store.data.set("users/"+ORDINARY_ADMIN,{role:"admin",status:"approved"});
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{
    const token=(req.headers.authorization||"").replace(/^Bearer /,"");
    if(!token)return res.status(401).json({ok:false});
    const people={
      applicant:{uid:APPLICANT,email:"staff@city.gov.ph"},
      rejected:{uid:REJECTED,email:"rejected@city.gov.ph"},
      super:{uid:SUPERADMIN,email:"super@city.gov.ph"},
      admin:{uid:ORDINARY_ADMIN,email:"ordinary@city.gov.ph"},
    };
    if(!people[token])return res.status(401).json({ok:false});
    req.firebaseUser=people[token];next();
  });
  installLguCredentialRoutes({
    app, db:store.db, FieldValue:{serverTimestamp:()=>new Date(2026,10,6)},
    requireFirebaseUser:(_req,_res,next)=>next(),
    cloudinary, configureCloudinary:()=>({cloud_name:"test"}),
  });
  const server=app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  t.after(()=>server.close());
  const base="http://127.0.0.1:"+server.address().port;
  async function call(path,auth="applicant",body,method="POST",contentType="application/json"){
    const headers={};if(auth)headers.Authorization="Bearer "+auth;
    if(body!==undefined)headers["Content-Type"]=contentType;
    const res=await fetch(base+path,{method,headers,
      body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
    const json=await res.json();return {status:res.status,body:json};
  }
  return {store,cloudinary,call};
}
const application={
  fullName:"Test Local Government Staff",lguOffice:"Disaster Preparedness Office",
  lguPosition:"Preparedness Officer",appointmentReference:"SJDM-AUTH-2026",
  barangay:"Poblacion",
};
const approval={
  office:"Disaster Preparedness Office",position:"Preparedness Officer",
  credentialReference:"SJDM-AUTH-2026",
  verificationMethod:"Official LGU phone callback",
  identityMatched:true,lguEmploymentConfirmed:true,credentialsConfirmed:true,
};

test("LGU Cloudinary onboarding is owner-only and never grants admin on registration",async t=>{
  const {store,call}=await serve(t);
  assert.equal((await call("/api/lgu-staff/application",null,application)).status,401);
  assert.equal((await call("/api/lgu-staff/application","applicant",{...application,role:"superadmin",status:"approved"})).status,201);
  const user=store.data.get("users/"+APPLICANT);
  assert.equal(user.role,"applicant");assert.equal(user.status,"pending_review");
  assert.equal(user.residentAccess,false);assert.equal(user.volunteerAccess,false);
  assert.equal((await call("/api/lgu-staff/application","applicant",application)).status,200);
  assert.equal((await call("/api/lgu-staff/application","super",application)).status,409);
});

test("private Cloudinary credentials require real image, owner and distinct ID/employment slots",async t=>{
  const {store,cloudinary,call}=await serve(t);
  await call("/api/lgu-staff/application","applicant",application);
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","admin",JPEG,"POST","image/jpeg")).status,403);
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","applicant",Buffer.alloc(64,65),"POST","image/jpeg")).status,415);
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","applicant",JPEG,"POST","image/png")).status,415);
  const first=await call("/api/lgu-staff/credentials/staff-id","applicant",JPEG,"POST","image/jpeg");
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","applicant",JPEG,"POST","image/jpeg")).status,200);
  const second=await call("/api/lgu-staff/credentials/appointment-letter","applicant",JPEG,"POST","image/jpeg");
  assert.equal(second.status,201,JSON.stringify(second.body));
  assert.equal(cloudinary.uploads.length,2);
  for(const item of cloudinary.uploads){
    assert.equal(item.opts.type,"authenticated");
    assert.match(item.opts.public_id,/^volunserve\/lgu-staff-credentials\//);
  }
  const proof=store.data.get("lguStaffCredentialAssets/"+APPLICANT+"_staff-id");
  assert.equal(proof.status,"ready");assert.equal(proof.deliveryType,"authenticated");
  assert(!JSON.stringify(proof).includes("secure_url"));
});

test("only approved Super Admin gets temporary private links; missing docs cannot be approved",async t=>{
  const {store,call}=await serve(t);
  await call("/api/lgu-staff/application","applicant",application);
  const route="/api/superadmin/lgu-credentials/"+APPLICANT+"/staff-id/access";
  assert.equal((await call(route,null,undefined,"GET")).status,401);
  assert.equal((await call(route,"applicant",undefined,"GET")).status,403);
  assert.equal((await call(route,"admin",undefined,"GET")).status,403);
  assert.equal((await call(route,"super",undefined,"GET")).status,404);
  let response=await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","super",approval);
  assert.equal(response.status,409,JSON.stringify(response.body));
  assert.equal(store.data.get("users/"+APPLICANT).role,"applicant");
  await call("/api/lgu-staff/credentials/staff-id","applicant",JPEG,"POST","image/jpeg");
  await call("/api/lgu-staff/credentials/appointment-letter","applicant",JPEG,"POST","image/jpeg");
  response=await call(route,"super",undefined,"GET");
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.match(response.body.url,/private_token=temporary/);
  assert(response.body.expiresAt>Date.now()/1000);
  assert.equal((await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","admin",approval)).status,403);
  assert.equal((await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","super",{...approval,identityMatched:false})).status,400);
  assert.equal((await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","super",{...approval,verificationMethod:"I saw a photo"})).status,400);
  response=await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","super",approval);
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(store.data.get("users/"+APPLICANT).role,"admin");
  assert.equal(store.data.get("users/"+APPLICANT).status,"approved");
  assert.equal(store.data.get("lguAdminCredentialReviews/"+APPLICANT).reviewStatus,"verified");
  assert.equal([...store.data.keys()].filter(k=>k.startsWith("adminLogs/")).length,1);
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","applicant",JPEG,"POST","image/jpeg")).status,403);
  assert.equal((await call("/api/superadmin/lgu-applications/"+APPLICANT+"/approve","super",approval)).status,409);
});

test("rejection leaves applicant without Admin access and records audit atomically",async t=>{
  const {store,call}=await serve(t);
  assert.equal((await call("/api/lgu-staff/application","rejected",application)).status,201);
  const path="/api/superadmin/lgu-applications/"+REJECTED+"/reject";
  assert.equal((await call(path,"admin",{reason:"Not a current city employee."})).status,403);
  assert.equal((await call(path,"super",{reason:"Short"})).status,400);
  assert.equal((await call(path,"super",{reason:"Official city records did not confirm current appointment."})).status,200);
  const user=store.data.get("users/"+REJECTED);
  assert.equal(user.role,"applicant");assert.equal(user.status,"rejected");
  assert.equal((await call("/api/lgu-staff/credentials/staff-id","rejected",JPEG,"POST","image/jpeg")).status,403);
  assert.equal([...store.data.keys()].filter(k=>k.startsWith("adminLogs/")).length,1);
});

test("validate image signatures and never allow arbitrary file types",()=>{
  assert.equal(imageMime(JPEG),"image/jpeg");
  assert.throws(()=>imageMime(Buffer.alloc(20,65)),/Only valid JPG/);
  assert.throws(()=>imageMime(Buffer.alloc(0)),/Choose an image/);
});
