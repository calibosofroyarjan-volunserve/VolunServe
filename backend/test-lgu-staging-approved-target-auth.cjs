"use strict";
/**
 * Actual Super Admin LGU promotion handler with fictional Auth + Firestore.
 * No Firebase services, credentials, photos, Cloudinary or deployment used.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"lguCredentialRoutes.js"),"utf8");

const TARGET_UID="staging_lgu_applicant_fixture_001";
const REVIEWER_UID="staging_superadmin_fixture_001";
const TARGET_EMAIL="fictional.applicant@example.invalid";
const REVIEWER_EMAIL="fictional.superadmin@example.invalid";
const proof=(kind)=>({
  ownerUid:TARGET_UID,kind,status:"ready",deliveryType:"authenticated",
  cloudinaryPublicId:"fictional_private_asset_for_test_only",
});

function harness({
  targetAuth={uid:TARGET_UID,email:TARGET_EMAIL,emailVerified:true,disabled:false},
  reviewer={role:"superadmin",status:"approved",fullName:"Fictional Super Admin"},
  applicant={
    uid:TARGET_UID,email:TARGET_EMAIL,
    role:"applicant",status:"pending_review",
  },
  staffId=proof("staff-id"),
  letter=proof("appointment-letter"),
}={}){
  const documents=new Map([
    ["users/"+REVIEWER_UID,reviewer],
    ["users/"+TARGET_UID,applicant],
    ["lguStaffCredentialAssets/"+TARGET_UID+"_staff-id",staffId],
    ["lguStaffCredentialAssets/"+TARGET_UID+"_appointment-letter",letter],
  ]);
  // An absent Firestore document has exists=false, not exists=true/data=null.
  if(staffId===null)documents.delete("lguStaffCredentialAssets/"+TARGET_UID+"_staff-id");
  if(letter===null)documents.delete("lguStaffCredentialAssets/"+TARGET_UID+"_appointment-letter");
  const writes=[],authQueries=[],routes=new Map();
  let nextId=0;
  const db={
    collection(collectionName){
      return {
        doc(uid){
          const path=collectionName+"/"+(uid || "fictional_auto_log_"+(++nextId));
          return {
            path,
            async get(){
              const data=documents.get(path);
              return {exists:data!==undefined,data:()=>data};
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      return await fn({
        async get(ref){
          const data=documents.get(ref.path);
          return {exists:data!==undefined,data:()=>data};
        },
        set(ref,data) {
          writes.push({action:"set",path:ref.path,data});
          documents.set(ref.path,data);
        },
        update(ref,data) {
          writes.push({action:"update",path:ref.path,data});
          documents.set(ref.path,{...(documents.get(ref.path)||{}),...data});
        },
      });
    },
  };
  const auth={
    async getUser(uid){
      authQueries.push(uid);
      if(!targetAuth)throw Error("mock missing Firebase account");
      return targetAuth;
    },
  };
  const app={
    get(name,...callbacks){routes.set(name,callbacks)},
    post(name,...callbacks){routes.set(name,callbacks)},
  };
  const module={exports:{}};
  vm.runInNewContext(code,{
    module,exports:module.exports,Buffer,console,
    require(name){
      if(name==="node:crypto")return require("node:crypto");
      if(name==="express")return {raw:()=>()=>{}};
      throw Error("Unexpected dependency: "+name);
    },
  },{filename:"actual_staging_lgu_route.js"});
  module.exports.installLguCredentialRoutes({
    app,db,auth,FieldValue:{serverTimestamp:()=>"[SYNTHETIC_TIMESTAMP]"},
    requireFirebaseUser:()=>{},cloudinary:{uploader:{}},
    configureCloudinary:()=>{},
  });
  const callbacks=routes.get("/api/superadmin/lgu-applications/:uid/approve");
  assert(callbacks?.length===2);
  async function approve(body={
    office:"Fictional SJDM LGU",position:"Identity Reviewer",
    credentialReference:"SYNTHETIC-APPOINTMENT-0001",
    verificationMethod:"Official LGU phone callback",
    identityMatched:true,lguEmploymentConfirmed:true,
    credentialsConfirmed:true,
  }){
    const request={
      firebaseUser:{uid:REVIEWER_UID,email:REVIEWER_EMAIL,email_verified:true},
      params:{uid:TARGET_UID},body,
    };
    const result={status:200,data:null};
    const response={
      set(){return this},
      status(status){result.status=status;return this},
      json(data){result.data=data;return this},
    };
    await callbacks.at(-1)(request,response);
    return result;
  }
  return {approve,writes,documents,authQueries};
}
test("unverified target account never becomes LGU Admin",async()=>{
  for(const authInfo of [
    {uid:TARGET_UID,email:TARGET_EMAIL,emailVerified:false,disabled:false},
    {uid:TARGET_UID,email:TARGET_EMAIL,disabled:false},
    {uid:TARGET_UID,email:TARGET_EMAIL,emailVerified:true,disabled:true},
  ]){
    const h=harness({targetAuth:authInfo});
    const result=await h.approve();
    assert.equal(result.status,409);
    assert.equal(result.data.error,"lgu_target_email_unverified");
    assert.equal(h.writes.length,0);
    assert.deepEqual(h.authQueries,[TARGET_UID]);
    assert.equal(h.documents.get("users/"+TARGET_UID).role,"applicant");
  }
});
test("missing Auth account blocks promotion with zero writes",async()=>{
  const h=harness({targetAuth:null});
  const result=await h.approve();
  assert.equal(result.status,409);
  assert.equal(result.data.error,"lgu_target_auth_missing");
  assert.equal(h.writes.length,0);
});
test("Auth email and canonical applicant profile must match",async()=>{
  for(const authEmail of ["another@example.invalid",""]){
    const h=harness({targetAuth:{
      uid:TARGET_UID,email:authEmail,emailVerified:true,disabled:false,
    }});
    const result=await h.approve();
    assert.equal(result.status,409);
    assert.equal(result.data.error,authEmail?"lgu_target_auth_profile_mismatch":"lgu_target_email_unverified");
    assert.equal(h.writes.length,0);
  }
});
test("unapproved reviewer cannot invoke target Auth lookup or grant privileges",async()=>{
  const h=harness({reviewer:{role:"resident",status:"approved"}});
  const result=await h.approve();
  assert.equal(result.status,403);
  assert.equal(result.data.error,"superadmin_required");
  assert.equal(h.authQueries.length,0);
  assert.equal(h.writes.length,0);
});
test("missing private employment evidence prevents promotion",async()=>{
  const h=harness({letter:null});
  const result=await h.approve();
  assert.equal(result.status,409);
  assert.equal(result.data.error,"lgu_proof_missing");
  assert.equal(h.writes.length,0);
});
test("verified matching applicant still needs independent Super Admin attestation",async()=>{
  const h=harness();
  const result=await h.approve({
    office:"Fictional SJDM LGU",position:"Identity Reviewer",
    credentialReference:"SYNTHETIC-APPOINTMENT-0001",
    verificationMethod:"Official LGU phone callback",
    identityMatched:true,lguEmploymentConfirmed:false,
    credentialsConfirmed:true,
  });
  assert.equal(result.status,400);
  assert.equal(result.data.error,"credential_review_incomplete");
  assert.equal(h.writes.length,0);
});
test("fully validated fictional profile gets approved ONLY by Super Admin",async()=>{
  const h=harness();
  const result=await h.approve();
  assert.equal(result.status,200);
  assert.equal(result.data.status,"approved");
  const user=h.documents.get("users/"+TARGET_UID);
  assert.equal(user.role,"admin");
  assert.equal(user.adminStatus,"active");
  assert.equal(user.status,"approved");
  assert.equal(user.adminCreatedBy,REVIEWER_UID);
  assert(h.writes.some(x=>x.path==="lguAdminCredentialReviews/"+TARGET_UID));
  assert(h.writes.some(x=>x.path.startsWith("adminLogs/")));
});
