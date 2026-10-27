"use strict";
/** Mocked secure backend integration tests — NO real ID photos or network calls. */
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../backend/lguStaffFaceScreening.js"),"utf8");
const APPLICANT="synthetic-applicant-2026",REVIEWER="synthetic-superadmin-2026";
const good=Buffer.alloc(1400,0x54);good[0]=255;good[1]=216;good[2]=255;
function harness(config={}){
  const users={
    [REVIEWER]:{role:config.reviewerRole||"superadmin",status:"approved"},
    [APPLICANT]:{role:"applicant",status:"pending_review"},
  };
  const evidence={
    uid:APPLICANT,idType:"ph_national_id",reviewStatus:"pending_manual_review",
    aiStatus:"not_run",officialOfficeStatus:"unconfirmed",
    front:"lguStaffEvidence/"+APPLICANT+"/front.jpg",
    selfie:config.badPath?"https://public.example/selfie.jpg":
      "lguStaffEvidence/"+APPLICANT+"/selfie.jpg",
  };
  const docs=new Map([["users/"+REVIEWER,users[REVIEWER]],
    ["users/"+APPLICANT,users[APPLICANT]],
    ["lguApplicantEvidence/"+APPLICANT,evidence]]);
  const view=(collection,id)=>({
    id,collection,
    async get(){
      const data=docs.get(collection+"/"+id);
      return {exists:!!data,data:()=>data};
    },
    async set(value,opt){
      const key=collection+"/"+id;
      docs.set(key,opt?.merge?{...docs.get(key),...value}:value);
    },
  });
  const db={
    collection(name){return {doc(id){return view(name,id);}};},
    async runTransaction(fn){
      const tx={
        get(ref){return ref.get();},
        set(ref,value,opt){return ref.set(value,opt);},
        update(ref,value){return ref.set(value,{merge:true});},
      };
      return await fn(tx);
    },
  };
  let aiCalls=0,storageReads=0;
  let handler=null;
  const fakeApp={
    post(route,middleware,callback){
      assert.equal(route,"/api/lgu-staff/face-screen");
      assert.equal(typeof middleware,"function");
      handler=callback;
    },
  };
  const storage={
    getStorage(){
      return {bucket(name){
        assert.equal(name,"demo-volunserve.appspot.com");
        return {file(p){
          storageReads++;
          assert(p.startsWith("lguStaffEvidence/"+APPLICANT+"/"));
          return {
            getMetadata:async()=>[{size:good.length,contentType:"image/jpeg",
              metadata:{purpose:"lgu_staff_manual_review"}}],
            download:async()=>[good],
          };
        }};
      }};
    },
  };
  const target={exports:{}};
  vm.runInNewContext(source,{
    module:target,exports:target.exports,Buffer,Blob,FormData,
    AbortSignal,console,
    process:{env:{IDENTITY_AI_SERVICE_URL:"https://private-ai.example.test",
      IDENTITY_AI_INTERNAL_KEY:"secret-in-tests-only",
      LGU_STAFF_STORAGE_BUCKET:"demo-volunserve.appspot.com",NODE_ENV:"test"}},
    fetch:async(_url,opts)=>{
      aiCalls++;
      assert.equal(opts.headers["X-VolunServe-User-Id"],APPLICANT);
      assert.equal(opts.headers["X-VolunServe-Internal-Key"],"secret-in-tests-only");
      assert.equal(opts.method,"POST");
      return {ok:true,json:async()=>({
        status:config.fakeVerifiedResponse?"verified":"pending",
        decision:config.fakeVerifiedResponse?"verified":"manual_review",
        matchScore:config.lowScore?0.62:0.93,
        matchThreshold:0.85,livenessImplemented:false,
      })};
    },
    require(name){
      if(name==="firebase-admin/storage")return storage;
      if(name==="crypto")return require("node:crypto");
      throw Error("Unexpected import "+name);
    },
  },{filename:"lguStaffFaceScreening.js"});
  target.exports.mountLguStaffFaceScreening(fakeApp,{
    db,adminApp:{},FieldValue:{
      serverTimestamp(){return "serverTimestamp";},
      delete(){return "deleteField";},
    },
    requireFirebaseUser(_req,_res,next){next?.();},
  });
  assert.equal(typeof handler,"function");
  async function invoke(role=REVIEWER){
    let status=200;
    let result=null;
    const res={
      status(number){status=number;return res;},
      json(body){result=body;return body;},
    };
    await handler({firebaseUser:{uid:role},
      body:{applicantUid:APPLICANT}},res);
    return {status,body:result};
  }
  return {invoke,docs,getCalls:()=>({aiCalls,storageReads})};
}
test("Real Python manual_review/pending match score gets informational signal, never role grant",async()=>{
  const h=harness();
  const result=await h.invoke();
  assert.equal(result.status,200);
  assert.equal(result.body.identityDecision,"manual_review_required");
  assert.equal(result.body.livenessImplemented,false);
  assert.equal(result.body.documentAuthenticityVerified,false);
  assert.equal(result.body.faceSimilaritySignal,"similarity_signal_present");
  assert.equal(h.docs.get("users/"+APPLICANT).role,"applicant");
  assert.equal(h.docs.get("users/"+APPLICANT).status,"pending_review");
  assert.equal(h.docs.get("lguApplicantFaceScreenings/"+APPLICANT).identityDecision,"manual_review_required");
  assert(!JSON.stringify(result.body).includes("secret-in-tests-only"));
  assert(!JSON.stringify(result.body).includes("0.93"));
});
test("Unexpected fake verified engine result cannot be treated as similarity confirmation",async()=>{
  const h=harness({fakeVerifiedResponse:true});
  const result=await h.invoke();
  assert.equal(result.status,200);
  assert.equal(result.body.faceSimilaritySignal,"inconclusive_manual_review");
  assert.equal(result.body.identityDecision,"manual_review_required");
  assert.equal(h.docs.get("users/"+APPLICANT).role,"applicant");
});
test("Below-threshold geometry score remains inconclusive",async()=>{
  const h=harness({lowScore:true});
  const result=await h.invoke();
  assert.equal(result.status,200);
  assert.equal(result.body.faceSimilaritySignal,"inconclusive_manual_review");
});
test("operational LGU Admin cannot inspect private media or invoke AI screening",async()=>{
  const h=harness({reviewerRole:"admin"});
  const result=await h.invoke();
  assert.equal(result.status,403);
  assert.equal(result.body.error,"superadmin_only");
  assert.equal(h.getCalls().aiCalls,0);
  assert.equal(h.getCalls().storageReads,0);
});
test("invalid or public evidence paths stop before image download",async()=>{
  const h=harness({badPath:true});
  const result=await h.invoke();
  assert.equal(result.status,409);
  assert.equal(result.body.error,"invalid_media_paths");
  assert.equal(h.getCalls().aiCalls,0);
  assert.equal(h.getCalls().storageReads,0);
});
test("three allowed informative comparisons then manual-review-only rate limit",async()=>{
  const h=harness();
  for(let i=0;i<3;i++){
    const r=await h.invoke();assert.equal(r.status,200);
  }
  const fourth=await h.invoke();
  assert.equal(fourth.status,429);
  assert.equal(fourth.body.identityDecision,"manual_review_required");
  assert.equal(h.getCalls().aiCalls,3);
});
