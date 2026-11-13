"use strict";
// Consolidated synthetic acceptance on actual Node GET/POST route bodies.
// No Firebase, real IDs, webcam, network, accounts, or production writes.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const {selectedIdRecognized}=require("./selectedIdPolicy");
const {reviewIssuerEvidence}=require("./identityIssuerReviewPolicy");
const {getProfileRole,isApprovedAccount}=require("./adminAccess");
const source=fs.readFileSync("backend/server.js","utf8");
function segment(a,b) {
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert(i>=0&&j>i,"Missing real handler segment: "+a);
 return source.slice(i,j);
}
const normalizeIdDocumentScreening=vm.runInNewContext(
 segment("function normalizeIdDocumentScreening(value) {","\nfunction numberOrNull(")+
 "\nnormalizeIdDocumentScreening",{}
);
const statusSource=segment('app.get(\n  "/api/identity/status"',
                           'app.post(\n  "/api/identity/verify"');
const reviewSource=segment("function identityAdminTimestampIso(value) {",
 'app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"');
const gateSource=segment("const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;",
                         "const MAX_IDENTITY_AI_ATTEMPTS = 3;");
const ADMIN="admin_synthetic_001",RESIDENT="resident_synthetic_001",
 VOLUNTEER="volunteer_synthetic_001";
const good={
 declaredIdType:"passport",detectedIdType:"passport",
 status:"text_consistent_unverified",warningCodes:[],
 imageQualityStatus:"adequate",backImageQualityStatus:"not_required",
 backSideProvided:false,backSideScreened:false,
 passportMrzCheck:"checksum_consistent_unverified",
 passportMrzBirthDateCheck:"possible_match",
 passportMrzCheckDigitsConsistent:true,profileBirthDateCheck:"possible_match",
 profileNameCheck:"possible_match",
};
function harness(){
 const records=new Map(),handlers=new Map();let autoId=0;
 for(const [uid,role,screen] of [
   [RESIDENT,"resident",good],
   [VOLUNTEER,"volunteer",{...good,passportMrzCheck:"checksum_inconsistent_or_ocr_error",
                            warningCodes:["passport_mrz_conflict"]}]
 ]) {
   records.set("users/"+uid,{
     uid,role,status:"approved",residentAccess:true,
     identityStatus:"pending",identityVerified:false,
     fullName:"Synthetic "+role,email:"example@example.invalid",
     confidentialPhotoBase64:"SECRET_DO_NOT_EXPOSE",
   });
   records.set("identityVerifications/"+uid,{
     uid,verificationId:"synthetic_review_"+uid,status:"pending",
     requiresManualReview:true,aiDecision:"manual_review",decision:"manual_review",
     aiAttemptCount:2,aiAttemptCycle:1,
     matchScore:0.8,livenessScore:null,
     documentScreening:{...screen,rawMrz:"SECRET_DO_NOT_EXPOSE"},
     untrustedSelfieBytes:"SECRET_DO_NOT_EXPOSE",
     createdAt:"2026-11-13T09:00:00.000Z",
     updatedAt:"2026-11-13T09:00:00.000Z",
   });
 }
 const snap=(col,id)=>{
   const row=records.get(col+"/"+id);
   return {id,exists:!!row,data:()=>row?{...row}:undefined};
 };
 const db={
   collection(col){return{
     doc(id){const key=id||"synthetic_log_"+(++autoId);
       return {col,id:key,get:async()=>snap(col,key)};
     },
     orderBy(){return{limit(n){return{get:async()=>({
       docs:[...records.keys()].filter(k=>k.startsWith(col+"/"))
         .slice(0,n).map(k=>snap(col,k.slice(col.length+1))),
     })};}};},
   };},
   async runTransaction(work){
     const pending=[];
     const tx={
       get:async ref=>snap(ref.col,ref.id),
       set:(ref,data,opts)=>pending.push({ref,data,opts}),
     };
     const result=await work(tx);
     for(const {ref,data,opts} of pending){
       const key=ref.col+"/"+ref.id;
       const row=opts?.merge?{...(records.get(key)||{})}:{};
       for(const [name,value] of Object.entries(data)){
         if(value?.__delete===true)delete row[name];
         else row[name]=value;
       }
       records.set(key,row);
     }
     return result;
   },
 };
 const app={
   get:(path,...functions)=>handlers.set("GET "+path,functions),
   post:(path,...functions)=>handlers.set("POST "+path,functions),
 };
 const requireFirebaseUser=(req,res,next)=>{
   if(!req.viewerUid)return res.status(401).json({error:"unauthenticated"});
   req.firebaseUser={uid:req.viewerUid,name:"Synthetic reviewer"};next();
 };
 const requireOperationalAdmin=(req,res,next)=>{
   if(req.viewerUid!==ADMIN||req.adminApproved!==true)
     return res.status(403).json({error:"admin_required"});
   req.volunServeProfile={role:"admin",status:"approved",fullName:"Synthetic LGU"};
   next();
 };
 const sandbox={
   app,db,requireFirebaseUser,requireOperationalAdmin,
   FieldValue:{
     serverTimestamp:()=> "2026-11-13T09:30:00.000Z",
     delete:()=>({__delete:true}),
   },
   MAX_IDENTITY_AI_ATTEMPTS:3,
   normalizeIdentityStatus:x=>["basic","pending","verified","failed"].includes(x)?x:"basic",
   cleanText:(x,n=200)=>String(x||"").trim().slice(0,n),
   numberOrNull:x=>typeof x==="number"&&Number.isFinite(x)?x:null,
   identityAttemptCount:x=>Number.isSafeInteger(x)?Math.min(Math.max(0,x),3):0,
   normalizeIdDocumentScreening,selectedIdRecognized,reviewIssuerEvidence,
   getProfileRole,isApprovedAccount,
   makeHttpError:(statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code}),
   console:{error:()=>{}},
 };
 vm.runInNewContext(statusSource,sandbox,{filename:"actual_status_handler.js"});
 vm.runInNewContext(reviewSource,sandbox,{filename:"actual_admin_handlers.js"});
 vm.runInNewContext(gateSource,sandbox,{filename:"actual_media_gate.js"});
 async function call(method,path,{viewerUid=ADMIN,adminApproved=true,body={},params={}}={}){
   const chain=handlers.get(method+" "+path);
   assert(chain,"Route not mounted: "+path);
   const req={viewerUid,adminApproved,body,params};
   const res={code:200,body:null,
     status(n){this.code=n;return this;},
     json(value){this.body=value;return this;},
   };
   for(const fn of chain){
     if(res.body!==null)break;
     let nextCalled=false;
     await fn(req,res,()=>{nextCalled=true;});
     if(res.body===null&&!nextCalled)throw Error("Route did not reply");
   }
   assert(res.body!==null,"Route must respond");
   return res;
 }
 const queue=opts=>call("GET","/api/admin/identity/reviews",opts);
 const status=uid=>call("GET","/api/identity/status",{viewerUid:uid});
 const decision=(uid,action,more={})=>call(
   "POST","/api/admin/identity/reviews/:uid/decision",
   {params:{uid},body:{
     action,validationMethod:"official_document_check",
     issuerReviewAttested:true,
     notes:"Synthetic-only simulation of an independently reviewed document.",
     ...more,
   }},
 );
 return {records,call,queue,status,decision,mediaGate:sandbox.requireStagingIdentityMediaApproval};
}
function assertSanitized(data){
 const s=JSON.stringify(data);
 for(const forbidden of ["SECRET_DO_NOT_EXPOSE","rawMrz","untrustedSelfieBytes",
                         "confidentialPhotoBase64","biometricTemplate","privateKey"]){
   assert(!s.includes(forbidden),"Leaked "+forbidden);
 }
}
test("staging media is blocked with 423 before any uploader middleware",()=>{
 const h=harness();let next=false;
 const res={code:200,status(n){this.code=n;return this;},
   json(x){this.body=x;return this;}};
 h.mediaGate({},res,()=>{next=true;});
 assert.equal(res.code,423);
 assert.equal(res.body.error,"staging_identity_media_disabled");
 assert.equal(next,false);
});
test("role/auth isolates Admin queue and Resident can read own pending status",async()=>{
 const h=harness();
 assert.equal((await h.queue({viewerUid:RESIDENT})).code,403);
 assert.equal((await h.queue({viewerUid:null})).code,401);
 assert.equal((await h.queue({viewerUid:ADMIN,adminApproved:false})).code,403);
 const r=await h.status(RESIDENT);
 assert.equal(r.code,200);assert.equal(r.body.identityStatus,"pending");
 assert.equal(r.body.identityVerified,false);
 assert.equal(r.body.decision,"manual_review");
 assertSanitized(r.body);
});
test("Resident status remains pending when profile snapshot is still basic",async()=>{
 const h=harness();
 const key="users/"+RESIDENT;
 h.records.set(key,{...h.records.get(key),identityStatus:"basic",identityVerified:false});
 const status=await h.status(RESIDENT);
 assert.equal(status.code,200);
 assert.equal(status.body.identityStatus,"pending");
 assert.equal(status.body.identityVerified,false);
 assert.equal(status.body.decision,"manual_review");
 assertSanitized(status.body);
});
test("verification row cannot impersonate profile-owned Verified Resident status",async()=>{
 const h=harness(),userKey="users/"+RESIDENT,recordKey="identityVerifications/"+RESIDENT;
 const profile=h.records.get(userKey),verification=h.records.get(recordKey);
 h.records.set(userKey,{...profile,identityStatus:"basic",identityVerified:false});
 h.records.set(recordKey,{
   ...verification,status:"verified",decision:"verified",
   aiDecision:"verified",manualReviewDecision:"verified",
   requiresManualReview:false,
 });
 const spoofed=await h.status(RESIDENT);
 assert.equal(spoofed.code,200);
 assert.equal(spoofed.body.identityVerified,false);
 assert.equal(spoofed.body.identityStatus,"basic");
 assert.notEqual(spoofed.body.decision,"verified");
 assertSanitized(spoofed.body);

 // A stale profile text flag on its own is also insufficient.
 h.records.set(userKey,{...profile,identityStatus:"verified",identityVerified:false});
 const inconsistent=await h.status(RESIDENT);
 assert.equal(inconsistent.body.identityVerified,false);
 assert.notEqual(inconsistent.body.identityStatus,"verified");
 assert.notEqual(inconsistent.body.decision,"verified");

 // Once the authoritative Admin transaction has updated the profile flag,
 // only THEN may the status route emit a verified account.
 h.records.set(userKey,{...profile,identityStatus:"verified",identityVerified:true});
 const genuinelyApprovedProfile=await h.status(RESIDENT);
 assert.equal(genuinelyApprovedProfile.body.identityVerified,true);
 assert.equal(genuinelyApprovedProfile.body.identityStatus,"verified");
 assert.equal(genuinelyApprovedProfile.body.decision,"verified");
});
test("final Admin Require Retry overrides a stale pending verification snapshot",async()=>{
 const h=harness(),recordKey="identityVerifications/"+RESIDENT;
 const verification=h.records.get(recordKey);
 h.records.set(recordKey,{
   ...verification,status:"pending",manualReviewDecision:"retry_required",
   requiresManualReview:false,aiDecision:"manual_review",decision:"manual_review",
 });
 const status=await h.status(RESIDENT);
 assert.equal(status.code,200);
 assert.equal(status.body.identityStatus,"failed");
 assert.equal(status.body.identityVerified,false);
 assert.equal(status.body.decision,"retry_required");
});

test("staging Admin queue exposes non-sensitive eligibility and blocks unauthorized targets",async()=>{
 const h=harness();
 const cases=[
  ["staff_synthetic_001","admin","approved",true],
  ["suspended_synthetic_001","resident","suspended",true],
  ["noaccess_synthetic_001","resident","approved",false],
  ["missing_synthetic_001",null,null,null],
 ];
 for(const [uid,role,status,residentAccess] of cases){
  if(role){
   h.records.set("users/"+uid,{
    uid,role,status,residentAccess,identityStatus:"pending",
    identityVerified:false,fullName:"Synthetic test account",
   });
  }
  h.records.set("identityVerifications/"+uid,{
   uid,status:"pending",decision:"manual_review",
   requiresManualReview:true,documentScreening:{...good},
   verificationId:"synthetic_"+uid,
   updatedAt:"2026-11-13T09:00:00.000Z",
  });
 }
 const response=await h.queue({});
 assert.equal(response.code,200);
 assertSanitized(response.body);
 for(const [uid] of cases){
  const row=response.body.items.find(x=>x.uid===uid);
  assert(row,"expected synthetic queue record "+uid);
  assert.equal(row.targetEligible,false);
  assert.equal(row.identityVerified,false);
  const attempt=await h.decision(uid,"verify");
  assert.equal(attempt.code,uid==="missing_synthetic_001"?404:403);
 }
 assert.equal([...h.records].filter(([k])=>k.startsWith("adminActivityLogs/")).length,0);
});

test("actual queue to manual Verify to refreshed Resident verified status and log",async()=>{
 const h=harness(),initial=await h.queue({});
 assert.equal(initial.code,200);assert.equal(initial.body.items.length,2);
 const row=initial.body.items.find(x=>x.uid===RESIDENT);
 assert.equal(row.status,"pending");
 assert.equal(row.requiresManualReview,true);
 assert.equal(row.targetEligible,true);
 assert.equal(selectedIdRecognized(row.documentScreening),true);
 assertSanitized(initial.body);
 const result=await h.decision(RESIDENT,"verify");
 assert.equal(result.code,200);assert.equal(result.body.identityVerified,true);
 const status=await h.status(RESIDENT);
 assert.equal(status.code,200);assert.equal(status.body.identityStatus,"verified");
 assert.equal(status.body.identityVerified,true);
 assert.equal(status.body.decision,"verified");
 assert.equal(status.body.padValidated,false);
 assertSanitized(status.body);
 const list=await h.queue({});
 const updated=list.body.items.find(x=>x.uid===RESIDENT);
 assert.equal(updated.identityStatus,"verified");
 assert.equal(updated.identityVerified,true);
 assert.equal(updated.manualReviewDecision,"verified");
 assert.equal(updated.requiresManualReview,false);
 assertSanitized(list.body);
 assert.equal(h.records.get("identityVerifications/"+RESIDENT).issuerApiAuthenticityVerified,false);
 const logs=[...h.records].filter(([k])=>k.startsWith("adminActivityLogs/"));
 assert.equal(logs.length,1);
 assert.equal(logs[0][1].action,"Resident Identity Manually Verified");
 assert.equal(logs[0][1].performedBy,ADMIN);
 assert.equal((await h.decision(RESIDENT,"verify")).code,409);
 assert.equal([...h.records].filter(([k])=>k.startsWith("adminActivityLogs/")).length,1);
});
test("unresolved document cannot Verify; Require Retry reaches Resident status and audit",async()=>{
 const h=harness(),q=await h.queue({});
 const row=q.body.items.find(x=>x.uid===VOLUNTEER);
 assert.equal(selectedIdRecognized(row.documentScreening),false);
 assert.equal((await h.decision(VOLUNTEER,"verify")).code,409);
 const r=await h.decision(VOLUNTEER,"require_retry",{
   validationMethod:"",issuerReviewAttested:false,
   notes:"Use a clearer synthetic document for simulated re-review.",
 });
 assert.equal(r.code,200);assert.equal(r.body.identityVerified,false);
 const status=await h.status(VOLUNTEER);
 assert.equal(status.body.identityStatus,"failed");
 assert.equal(status.body.identityVerified,false);
 assert.equal(status.body.decision,"retry_required");
 assert.equal(status.body.attemptCount,0);
 const queue=await h.queue({});
 assert.equal(queue.body.items.find(x=>x.uid===VOLUNTEER).manualReviewDecision,"retry_required");
 assertSanitized(queue.body);
 const logs=[...h.records].filter(([k])=>k.startsWith("adminActivityLogs/"));
 assert.equal(logs.length,1);
 assert.equal(logs[0][1].action,"Resident Identity Retry Required");
 assert.equal((await h.decision(VOLUNTEER,"require_retry")).code,409);
});
test("self-review and ordinary-user decisions never write transaction records",async()=>{
 const h=harness(),before=h.records.size;
 const resident=await h.call(
   "POST","/api/admin/identity/reviews/:uid/decision",
   {viewerUid:RESIDENT,params:{uid:RESIDENT},body:{action:"verify"}},
 );
 assert.equal(resident.code,403);
 const self=await h.call("POST","/api/admin/identity/reviews/:uid/decision",{
   viewerUid:ADMIN,params:{uid:ADMIN},body:{
     action:"verify",validationMethod:"official_document_check",
     issuerReviewAttested:true,notes:"Synthetic-only review",
   },
 });
 assert.equal(self.code,403);assert.equal(h.records.size,before);
});
test("AI verification never writes Verified Resident or bypasses media gate",()=>{
 const s=fs.readFileSync("backend/server.js","utf8");
 const i=s.indexOf('"/api/identity/verify"'),j=s.indexOf('"/api/admin/identity/reviews"',i);
 const route=s.slice(i,j);
 assert.match(route,/requireStagingIdentityMediaApproval/);
 assert.match(route,/identityVerified:\s*false/);
 assert.doesNotMatch(route,/identityVerified:\s*true/);
 assert.match(s,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false/);
});
