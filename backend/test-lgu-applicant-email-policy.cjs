"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
  installLguCredentialRoutes,isPermittedNewLguApplicantEmail
} = require("./lguCredentialRoutes");

function fixture(email,{existing=false}={}) {
  const handlers=new Map(), writes=[];
  const app={
    post(path,...handler){handlers.set("POST "+path,handler[handler.length-1]);},
    get(path,...handler){handlers.set("GET "+path,handler[handler.length-1]);},
  };
  const db={
    collection(name){return {doc(uid){return {name,uid}}};},
    async runTransaction(run){
      const tx={
        async get(){return {exists:existing,data:()=>({
          role:"applicant",status:"pending_review",email,
        })}},
        create(ref,value){writes.push({ref,value})},
      };
      return run(tx);
    },
  };
  const FieldValue={serverTimestamp:()=>({serverTimestamp:true})};
  installLguCredentialRoutes({
    app,db,FieldValue,
    requireFirebaseUser:(_req,_res,next)=>next(),
    cloudinary:{},configureCloudinary:()=>{},
  });
  const route=handlers.get("POST /api/lgu-staff/application");
  assert.equal(typeof route,"function");
  const response={
    statusCode:200,result:null,
    set(){return this},
    status(code){this.statusCode=code;return this},
    json(body){this.result=body;return this},
  };
  const request={
    firebaseUser:{
      uid:"lgu-test-user-00001",
      email,
      email_verified:true,
    },
    body:{
      fullName:"Marilyn Test Applicant",
      lguOffice:"City Disaster Risk Office",
      lguPosition:"Clerk Coordinator",
      appointmentReference:"LGU-REF-0001",
      barangay:"Muzon Proper",
    },
  };
  return {route,request,response,writes};
}

test("only Yahoo is eligible for a new LGU application through direct Render API",async()=>{
  for (const email of ["candidate@yahoo.com","candidate@yahoo.com.ph","candidate@yahoo.co.uk"]) {
    const f=fixture(email);
    await f.route(f.request,f.response);
    assert.equal(f.response.statusCode,201,email);
    assert.equal(f.writes.length,1,email);
    assert.equal(f.writes[0].value.status,"pending_review");
    assert.equal(f.writes[0].value.role,"applicant");
  }
  for(const email of [
    "smailpro-pool@gmail.com","candidate@googlemail.com",
    "candidate@outlook.com","candidate@hotmail.com","candidate@en2ch.com",
    "candidate@ruutukf.co","candidate@yahoo.co","candidate@company.co",
    "candidate@sub.yahoo.com","candidate@yahoo.com.attacker.com",
  ]){
    const f=fixture(email);
    await f.route(f.request,f.response);
    assert.equal(f.response.statusCode,403,email);
    assert.equal(f.response.result.error,"new_lgu_email_provider_not_allowed",email);
    assert.equal(f.writes.length,0,email);
    assert.equal(isPermittedNewLguApplicantEmail(email),false,email);
  }
});
test("historical pending LGU applicant not overwritten or retroactively rejected",async()=>{
  const f=fixture("old-applicant@gmail.com",{existing:true});
  await f.route(f.request,f.response);
  assert.equal(f.response.statusCode,200);
  assert.deepEqual(f.response.result,{ok:true,uid:f.request.firebaseUser.uid,status:"pending_review"});
  assert.equal(f.writes.length,0);
});
test("formatter permits official Yahoo domains only",()=>{
  for(const allowed of ["user@yahoo.com","user@yahoo.com.ph","user@yahoo.co.uk"," USER@YAHOO.COM "])
    assert.equal(isPermittedNewLguApplicantEmail(allowed),true,allowed);
  for(const denied of ["","user@gmail.com","user@yahoo.co","user@sub.yahoo.com"])
    assert.equal(isPermittedNewLguApplicantEmail(denied),false,denied);
});
