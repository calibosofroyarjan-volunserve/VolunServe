"use strict";
/**
 * Synthetic-only execution of the actual staff onboarding handler.
 * No Firebase Auth, external images, Cloudinary, real accounts, credentials,
 * role grants or deployment.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"lguCredentialRoutes.js"),"utf8");

function createHarness(existing=null){
  const routes=new Map(),writes=[],documents=new Map();
  if(existing)documents.set("users/staging_applicant_fixture_001",existing);
  const db={
    collection(name){
      return {
        doc(uid){return {path:name+"/"+uid}},
      };
    },
    async runTransaction(fn){
      const tx={
        async get(ref){
          const row=documents.get(ref.path);
          return {exists:row!==undefined,data:()=>row};
        },
        create(ref,data){
          writes.push({operation:"create",path:ref.path,data});
          documents.set(ref.path,data);
        },
      };
      return fn(tx);
    },
  };
  const app={
    post(route,...handlers){routes.set(route,handlers)},
    get(route,...handlers){routes.set(route,handlers)},
  };
  const module={exports:{}};
  vm.runInNewContext(source,{
    module,exports:module.exports,Buffer,console,
    require(name){
      if(name==="node:crypto")return require("node:crypto");
      if(name==="express")return {raw:()=>()=>{}};
      throw new Error("unexpected dependency in fake test: "+name);
    },
  },{filename:"lguCredentialRoutes.testisolated.js"});
  module.exports.installLguCredentialRoutes({
    app,db,auth:{getUser:async()=>({emailVerified:true})},
    FieldValue:{serverTimestamp:()=>({fakeTimestamp:true})},
    requireFirebaseUser:()=>{},cloudinary:{uploader:{}},
    configureCloudinary:()=>{},
  });
  const apply=routes.get("/api/lgu-staff/application");
  assert(apply&&apply.length===2,"actual LGU application route must be captured");
  return {
    writes,
    documents,
    async apply(options={}){
      const {uid="staging_applicant_fixture_001",body=null}=options;
      // A missing Firebase token claim must stay missing, not default true.
      const email=Object.prototype.hasOwnProperty.call(options,"email")
        ? options.email : "fictional@example.invalid";
      const email_verified=Object.prototype.hasOwnProperty.call(options,"email_verified")
        ? options.email_verified : true;
      const req={
        firebaseUser:{uid,email,email_verified},
        body:body||{
          fullName:"Fictional Applicant",lguOffice:"Staging LGU",
          lguPosition:"Identity Reviewer",
          appointmentReference:"SYNTHETIC-NO-REAL-APPOINTMENT",
          barangay:"Sample Barangay",
        },
      };
      const result={status:200,body:null};
      const res={
        set(){return this},
        status(code){result.status=code;return this},
        json(value){result.body=value;return this},
      };
      await apply[1](req,res);
      return result;
    },
  };
}
test("unverified staging Auth email is denied before Firestore access",async()=>{
  for(const verified of [false,undefined,null,"true",0]){
    const h=createHarness();
    const result=await h.apply({email_verified:verified});
    assert.equal(result.status,403);
    assert.equal(result.body.error,"email_verification_required");
    assert.equal(h.writes.length,0);
  }
});
test("malformed or missing email cannot start an LGU application",async()=>{
  for(const email of ["","invalid","invalid@","@example.invalid",null]){
    const h=createHarness();
    const result=await h.apply({email,email_verified:true});
    assert.equal(result.status,400);
    assert.equal(result.body.error,"invalid_account_email");
    assert.equal(h.writes.length,0);
  }
});
test("verified staging applicant creates only pending applicant, NEVER an Admin",async()=>{
  const h=createHarness();
  const result=await h.apply();
  assert.equal(result.status,201);
  assert.equal(result.body.status,"pending_review");
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].path,"users/staging_applicant_fixture_001");
  const doc=h.writes[0].data;
  assert.equal(doc.role,"applicant");
  assert.equal(doc.status,"pending_review");
  assert.equal(doc.residentAccess,false);
  assert.equal(doc.volunteerAccess,false);
  assert.equal(doc.email,"fictional@example.invalid");
  assert.equal(doc.adminStatus,undefined);
});
test("cannot overwrite an existing Resident account to applicant or Admin",async()=>{
  const h=createHarness({role:"resident",status:"approved",
    email:"fictional@example.invalid"});
  const result=await h.apply();
  assert.equal(result.status,409);
  assert.equal(result.body.error,"account_already_registered");
  assert.equal(h.writes.length,0);
  assert.equal(h.documents.get("users/staging_applicant_fixture_001").role,"resident");
});
test("actual route grants Admin only by independent Super Admin review path",()=>{
  const appStart=source.indexOf('app.post("/api/lgu-staff/application"');
  const uploadStart=source.indexOf('app.post("/api/lgu-staff/credentials/:kind"',appStart);
  const appSource=source.slice(appStart,uploadStart);
  assert(!/role:\s*["']admin["']/.test(appSource));
  assert(appSource.includes('role: "applicant", status: "pending_review"'));
  const reviewStart=source.indexOf('app.post("/api/superadmin/lgu-applications/:uid/approve"');
  assert(reviewStart>uploadStart);
  const approve=source.slice(reviewStart);
  assert(approve.includes("const reviewer = await superAdmin(req)"));
  assert(approve.includes("lguEmploymentConfirmed"));
  assert(approve.includes("credentialsConfirmed"));
  assert(approve.includes('role: "admin", adminStatus: "active", status: "approved"'));
});
