"use strict";
/** Synthetic-only Node integration tests; never touch a production bucket. */
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../backend/lguStaffPrivacy.js"),"utf8");
const STAFF="synthetic-privacy-applicant_26",SU="synthetic-privacy-superadmin_26",LGU="synthetic-privacy-lgu-admin_26";
const prefix="lguStaffEvidence/"+STAFF+"/";
const DELETE=Symbol("delete");
function harness({enabled=false,badFile=false,deleteFails=false,role="superadmin"}={}){
  const docs=new Map([
    ["users/"+STAFF,{uid:STAFF,role:"applicant",status:"pending_review"}],
    ["users/"+SU,{uid:SU,role,status:"approved"}],
    ["users/"+LGU,{uid:LGU,role:"admin",status:"approved"}],
    ["lguApplicantEvidence/"+STAFF,{uid:STAFF,idType:"ph_national_id"}],
    ["lguApplicantFaceScreenings/"+STAFF,{uid:STAFF,faceSimilarityScore:0.7}],
    ["lguApplicantDocumentScreenings/"+STAFF,{uid:STAFF,documentTypeSignal:"document_type_inconclusive"}],
  ]);
  const names=new Set([prefix+"front.jpg",prefix+"back.jpg",prefix+"selfie.jpg",prefix+"lgu_proof.jpg"]);
  if(badFile)names.add(prefix+"hidden-document.exe");
  const trace={storage:0,deleted:[],audits:0};
  function ref(col,id){return {key:col+"/"+id,async get(){return snapshot(this.key);}};}
  function snapshot(key){return{exists:docs.has(key),data:()=>docs.get(key)};}
  function update(ref,data){
    const previous=docs.get(ref.key)||{};
    const next={...previous};
    for(const [k,v] of Object.entries(data)){if(v===DELETE)delete next[k];else next[k]=v;}
    docs.set(ref.key,next);
  }
  const db={
    collection(col){return {doc(id){return ref(col,id||"synthetic-audit-1");}};},
    async runTransaction(fn){return fn({
      async get(ref){return snapshot(ref.key);},
      update,create(ref,data){assert(!docs.has(ref.key));docs.set(ref.key,data);},
    });},
    batch(){const todo=[];return{
      delete(ref){todo.push(()=>docs.delete(ref.key));},
      update(ref,data){todo.push(()=>update(ref,data));},
      create(ref,data){todo.push(()=>{assert(!docs.has(ref.key));docs.set(ref.key,data);trace.audits++;});},
      async commit(){for(const op of todo)op();},
    };},
  };
  const storage={getStorage:()=>({bucket:name=>{
    assert.equal(name,"demo-volunserve.appspot.com");
    return{getFiles:async ({prefix:p,maxResults})=>{
      trace.storage++;assert.equal(p,prefix);assert.equal(maxResults,13);
      return[[...names].filter(n=>n.startsWith(p)).slice(0,maxResults).map(name=>({
        name,async delete(){if(deleteFails)throw Error("synthetic_storage_unavailable");
          names.delete(name);trace.deleted.push(name);},
      }))];
    }};
  }})};
  const module={exports:{}},routes={};
  vm.runInNewContext(source,{
    module,exports:module.exports,
    process:{env:{LGU_STAFF_EVIDENCE_PURGE_ENABLED:enabled?"true":"false",
      LGU_STAFF_STORAGE_BUCKET:"demo-volunserve.appspot.com"}},
    require(name){if(name==="firebase-admin/storage")return storage;if(name==="node:crypto")return require("node:crypto");throw Error(name);},
  });
  module.exports.mountLguStaffPrivacy({post(path,middleware,handler){
    assert.equal(typeof middleware,"function");routes[path]=handler;
  }},{db,adminApp:{},FieldValue:{serverTimestamp:()=>"SERVER_TIME",delete:()=>DELETE},
    requireFirebaseUser(_req,_res,next){next?.();}});
  async function request(path,uid,body={}){
    let status=200,response=null;
    const res={status(x){status=x;return this;},json(x){response=x;return x;}};
    await routes[path]({firebaseUser:{uid},body},res);
    return{status,result:response};
  }
  const withdraw=(uid=STAFF)=>request("/api/lgu-staff/privacy/request-withdrawal",uid);
  const purge=(uid=SU,confirmation="PURGE_LGU_EVIDENCE")=>request("/api/lgu-staff/privacy/purge-evidence",uid,
    {applicantUid:STAFF,confirmation});
  return {docs,trace,names,withdraw,purge};
}
test("Applicant withdrawal immediately rejects pending role and records no identity pixels",async()=>{
  const h=harness(),r=await h.withdraw();
  assert.equal(r.status,200);assert.equal(h.docs.get("users/"+STAFF).status,"rejected");
  assert.equal(h.docs.get("lguApplicantPrivacyRequests/"+STAFF).status,"requested");
  assert(!JSON.stringify(r.result).includes("faceSimilarityScore"));
  assert.equal((await h.withdraw()).status,200);
});
test("Resident/LGU/Super Admin cannot impersonate applicant withdrawal",async()=>{
  const h=harness();
  assert.equal((await h.withdraw(SU)).status,403);
  assert.equal((await h.withdraw(LGU)).status,403);
  assert.equal(h.docs.get("users/"+STAFF).status,"pending_review");
});
test("Purge requires confirmed programmer Super Admin, withdrawal and server release",async()=>{
  const h=harness();
  assert.equal((await h.purge()).status,503);
  assert.equal(h.trace.storage,0);
  const q=harness({enabled:true});
  assert.equal((await q.purge()).status,409);
  assert.equal((await q.withdraw()).status,200);
  assert.equal((await q.purge(LGU)).status,403);
  assert.equal((await q.purge(SU,"")).status,400);
  assert.equal(q.trace.storage,0);
});
test("Only enumerated synthetic private files are erased, audit and metadata remain consistent",async()=>{
  const h=harness({enabled:true});
  assert.equal((await h.withdraw()).status,200);
  const result=await h.purge();
  assert.equal(result.status,200);
  assert.equal(result.result.deletedObjects,4);
  assert.equal(h.trace.deleted.length,4);
  assert.equal(h.names.size,0);
  assert(!h.docs.has("lguApplicantEvidence/"+STAFF));
  assert(!h.docs.has("lguApplicantFaceScreenings/"+STAFF));
  assert(!h.docs.has("lguApplicantDocumentScreenings/"+STAFF));
  assert.equal(h.docs.get("lguApplicantPrivacyRequests/"+STAFF).status,"completed");
  assert.equal(h.trace.audits,1);
  assert.equal(h.docs.get("users/"+STAFF).role,"applicant");
  assert.equal(h.docs.get("users/"+STAFF).status,"rejected");
  assert.equal((await h.purge()).status,409);
});
test("Unknown file slot blocks all deletions and leaves request retryable",async()=>{
  const h=harness({enabled:true,badFile:true});
  await h.withdraw();
  const r=await h.purge();
  assert.equal(r.status,409);
  assert.equal(h.trace.deleted.length,0);
  assert.equal(h.docs.get("lguApplicantPrivacyRequests/"+STAFF).status,"purge_failed");
});
test("Storage outage preserves Firestore evidence and never reports complete erasure",async()=>{
  const h=harness({enabled:true,deleteFails:true});
  await h.withdraw();
  const r=await h.purge();
  assert.equal(r.status,503);
  assert(h.docs.has("lguApplicantEvidence/"+STAFF));
  assert.equal(h.docs.get("lguApplicantPrivacyRequests/"+STAFF).status,"purge_failed");
  assert.equal(h.trace.audits,0);
});
