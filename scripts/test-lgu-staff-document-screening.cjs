"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const code=fs.readFileSync(path.resolve(__dirname,"../backend/lguStaffDocumentScreening.js"),"utf8");
const CID="synthetic-ocr-applicant_2026",SU="synthetic-ocr-superadmin_2026";
const jpeg=Buffer.alloc(1600,32);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;
function harness({role="superadmin",badPath=false,ocrSignal="declared_type_text_consistent",wrongIdType=false}={}){
  const docs=new Map([
    ["users/"+SU,{role,status:"approved"}],
    ["users/"+CID,{role:"applicant",status:"pending_review"}],
    ["lguApplicantEvidence/"+CID,{
      idType:"ph_national_id",reviewStatus:"pending_manual_review",
      officialOfficeStatus:"unconfirmed",
      front:"lguStaffEvidence/"+CID+"/front.jpg",
      back:badPath?"public_url":
        "lguStaffEvidence/"+CID+"/back.jpg",
    }],
  ]);
  const collection=name=>({doc:id=>({
    async get(){const value=docs.get(name+"/"+id);return{exists:!!value,data:()=>value};},
    async set(value,opts){const key=name+"/"+id;
      docs.set(key,opts?.merge?{...docs.get(key),...value}:value);},
  })});
  const db={collection,
    async runTransaction(fn){
      const tx={get:ref=>ref.get(),
        set:(ref,value,opts)=>ref.set(value,opts),
        update:(ref,value)=>ref.set(value,{merge:true})};
      return fn(tx);
    },
  };
  let aiCalls=0,mediaReads=0,handler=null;
  const target={exports:{}};
  vm.runInNewContext(code,{
    module:target,exports:target.exports,Buffer,Blob,FormData,AbortSignal,
    process:{env:{IDENTITY_AI_SERVICE_URL:"https://private-ai.test",
      IDENTITY_AI_INTERNAL_KEY:"fake-key",
      LGU_STAFF_STORAGE_BUCKET:"demo-volunserve.appspot.com",NODE_ENV:"test"}},
    fetch:async(url,opts)=>{
      aiCalls++;
      assert.equal(url,"https://private-ai.test/lgu-id-ocr");
      assert.equal(opts.headers["X-VolunServe-User-Id"],CID);
      assert.equal(opts.headers["X-VolunServe-Internal-Key"],"fake-key");
      return {ok:true,json:async()=>({
        decision:"verified",documentTypeSignal:ocrSignal,
        ocrEngineAvailable:true,documentAuthenticityVerified:true,
        idNumber:"NeverReturnSensitiveIdNumber",
      })};
    },
    require(name){
      if(name==="crypto")return require("node:crypto");
      if(name==="firebase-admin/storage")return {getStorage:()=>({
        bucket:()=>({file:()=>({
          async getMetadata(){mediaReads++;return[{size:jpeg.length,
            contentType:"image/jpeg",metadata:{purpose:"lgu_staff_manual_review",idType:wrongIdType?"ph_passport":"ph_national_id"}}];},
          async download(){return[jpeg];},
        })}),
      })};
      throw Error("Unexpected module "+name);
    },
  });
  target.exports.mountLguStaffDocumentScreening({
    post(route,middleware,fn){
      assert.equal(route,"/api/lgu-staff/document-screen");
      assert.equal(typeof middleware,"function");
      handler=fn;
    },
  },{db,adminApp:{},FieldValue:{
    serverTimestamp(){return"server_timestamp";},
    delete(){return"field_delete";},
  },requireFirebaseUser(_request,_response,next){next?.();}});
  async function invoke(uid=SU){
    let status=200,result=null;
    const res={status(v){status=v;return this;},json(v){result=v;return v;}};
    await handler({body:{applicantUid:CID},firebaseUser:{uid}},res);
    return{status,result};
  }
  return{invoke,docs,calls:()=>({aiCalls,mediaReads})};
}
test("OCR raw AI 'verified' and sensitive payload can only produce manual review and minimal response",async()=>{
  const h=harness();
  const {status,result}=await h.invoke();
  assert.equal(status,200);
  assert.equal(result.decision,"manual_review_required");
  assert.equal(result.documentAuthenticityVerified,false);
  assert.equal(result.issuerVerificationImplemented,false);
  assert.equal(result.documentTypeSignal,"declared_type_text_consistent");
  assert.equal(h.docs.get("users/"+CID).role,"applicant");
  assert.equal(h.docs.get("lguApplicantDocumentScreenings/"+CID).decision,"manual_review_required");
  assert(!JSON.stringify(result).includes("NeverReturnSensitiveIdNumber"));
});
test("Non-Super Admin blocked before reading government ID images",async()=>{
  const h=harness({role:"admin"});const r=await h.invoke();
  assert.equal(r.status,403);assert.equal(r.result.error,"superadmin_only");
  assert.equal(h.calls().aiCalls,0);assert.equal(h.calls().mediaReads,0);
});
test("Declared ID-type mismatch in private Storage blocks OCR",async()=>{
  const h=harness({wrongIdType:true});
  const r=await h.invoke();
  assert.equal(r.status,409);
  assert.equal(r.result.error,"document_integrity_failed");
  assert.equal(h.calls().aiCalls,0);
});
test("Invalid ID paths blocked before evidence read",async()=>{
  const h=harness({badPath:true});const r=await h.invoke();
  assert.equal(r.status,409);assert.equal(r.result.error,"invalid_document_paths");
  assert.equal(h.calls().aiCalls,0);assert.equal(h.calls().mediaReads,0);
});
test("School/company ID suspicion is never ID authentication",async()=>{
  const h=harness({ocrSignal:"unsupported_document_suspected"});const r=await h.invoke();
  assert.equal(r.status,200);assert.equal(r.result.documentTypeSignal,"unsupported_document_suspected");
  assert.equal(r.result.documentAuthenticityVerified,false);
});
test("Three OCR attempts maximum; fourth cannot query protected AI",async()=>{
  const h=harness();
  for(let i=0;i<3;i++)assert.equal((await h.invoke()).status,200);
  const fourth=await h.invoke();
  assert.equal(fourth.status,429);assert.equal(fourth.result.decision,"manual_review_required");
  assert.equal(h.calls().aiCalls,3);
});
