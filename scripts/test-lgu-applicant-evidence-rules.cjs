/** Firebase Firestore Emulator ONLY. No production reads or writes. */
const fs=require("node:fs"),path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run against production.");process.exit(1);
}
const projectId="demo-volunserve";
const SU="evidence-test-superadmin", ADMIN="evidence-test-admin";
const STAFF="evidence-test-applicant", OTHER="evidence-test-outsider";
const base=(idType="ph_national_id")=>({
  uid:STAFF,idType,
  front:"lguStaffEvidence/"+STAFF+"/front.jpg",
  back:idType==="ph_passport"?"":"lguStaffEvidence/"+STAFF+"/back.png",
  selfie:"lguStaffEvidence/"+STAFF+"/selfie.webp",
  lguProof:"lguStaffEvidence/"+STAFF+"/lgu_proof.jpg",
  reviewStatus:"pending_manual_review",aiStatus:"not_run",
  officialOfficeStatus:"unconfirmed",consentVersion:"lgu-intake-v1",
  createdAt:firebase.firestore.FieldValue.serverTimestamp(),
});
let failed=0,passed=0;
async function check(label,promise,deny=false) {
  try {if(deny) await assertFails(promise());else await assertSucceeds(promise());
    console.log("PASS "+label);passed++;}catch(e){console.error("FAIL "+label+": "+String(e.message||e));failed++;}
}
async function main() {
  const env=await initializeTestEnvironment({
    projectId,firestore:{rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")},
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await db.doc("users/"+SU).set({uid:SU,role:"superadmin",status:"approved"});
      await db.doc("users/"+ADMIN).set({uid:ADMIN,role:"admin",status:"approved"});
      await db.doc("users/"+STAFF).set({uid:STAFF,role:"applicant",status:"pending_review",
        residentAccess:false,volunteerAccess:false});
      await db.doc("users/"+OTHER).set({uid:OTHER,role:"resident",status:"approved"});
    });
    const applicant=env.authenticatedContext(STAFF).firestore();
    const superadmin=env.authenticatedContext(SU).firestore();
    const admin=env.authenticatedContext(ADMIN).firestore();
    const stranger=env.authenticatedContext(OTHER).firestore();
    const anon=env.unauthenticatedContext().firestore();
    const row=applicant.doc("lguApplicantEvidence/"+STAFF);
    await check("Missing server release denies Firestore evidence creation",
      ()=>row.set(base()),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguIdentityIntake/release").set({enabled:false});
    });
    await check("Disabled release denies direct applicant SDK submission",
      ()=>row.set(base()),true);
    await check("Applicants cannot read confidential release flag",
      ()=>applicant.doc("lguIdentityIntake/release").get(),true);
    await check("Super Admin browser cannot change server-controlled release",
      ()=>superadmin.doc("lguIdentityIntake/release").set({enabled:true}),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguIdentityIntake/release").set({enabled:true});
    });
    await check("school ID rejected even if applicant calls it ID",()=>row.set(base("school_id")),true);
    await check("private ID record with unrecognized custom type rejected",
      ()=>row.set(base("other_government_id")),true);
    await check("applicant cannot self-verify AI results",
      ()=>row.set({...base(),aiStatus:"verified"}),true);
    await check("cannot claim official office confirmed",
      ()=>row.set({...base(),officialOfficeStatus:"confirmed"}),true);
    await check("forged public evidence path rejected",
      ()=>row.set({...base(),front:"https://example.test/photo.jpg"}),true);
    await check("missing required backside rejected",
      ()=>row.set({...base(),back:""}),true);
    await check("valid pending-only government ID metadata",
      ()=>row.set(base()));
    await check("applicant may read their own restricted status",()=>row.get());
    await check("LGU Admin cannot read applicant biometric metadata",
      ()=>admin.doc("lguApplicantEvidence/"+STAFF).get(),true);
    await check("other resident cannot read applicant ID metadata",
      ()=>stranger.doc("lguApplicantEvidence/"+STAFF).get(),true);
    await check("anonymous cannot read applicant ID metadata",
      ()=>anon.doc("lguApplicantEvidence/"+STAFF).get(),true);
    await check("programmer Super Admin can inspect confidential metadata",
      ()=>superadmin.doc("lguApplicantEvidence/"+STAFF).get());
    await check("Applicant cannot forge face-similarity results", ()=>
      applicant.doc("lguApplicantFaceScreenings/"+STAFF).set({
        uid:STAFF,faceSimilaritySignal:"similarity_signal_present",
        identityDecision:"verified",livenessImplemented:true,
      }),true);
    await check("Operational LGU Admin cannot forge staff biometric screening", ()=>
      admin.doc("lguApplicantFaceScreenings/"+STAFF).set({
        uid:STAFF,faceSimilaritySignal:"similarity_signal_present",
      }),true);
    await check("Super Admin browser cannot forge backend AI results", ()=>
      superadmin.doc("lguApplicantFaceScreenings/"+STAFF).set({
        uid:STAFF,faceSimilaritySignal:"similarity_signal_present",
      }),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguApplicantFaceScreenings/"+STAFF).set({
        uid:STAFF,status:"manual_review_required",
        identityDecision:"manual_review_required",
        livenessImplemented:false,documentAuthenticityVerified:false,
      });
    });
    await check("Applicant may read own non-privileged screening status", ()=>
      applicant.doc("lguApplicantFaceScreenings/"+STAFF).get());
    await check("Only Super Admin may read another applicant face screening", ()=>
      superadmin.doc("lguApplicantFaceScreenings/"+STAFF).get());
    await check("Operational LGU Admin cannot inspect applicant face comparison", ()=>
      admin.doc("lguApplicantFaceScreenings/"+STAFF).get(),true);
    await check("Unrelated resident cannot inspect face screening result", ()=>
      stranger.doc("lguApplicantFaceScreenings/"+STAFF).get(),true);
    await check("Applicant cannot forge OCR government ID authenticity", ()=>
      applicant.doc("lguApplicantDocumentScreenings/"+STAFF).set({
        documentTypeSignal:"declared_type_text_consistent",
        decision:"verified",documentAuthenticityVerified:true,
      }),true);
    await check("Operational Admin cannot forge OCR issuer checks", ()=>
      admin.doc("lguApplicantDocumentScreenings/"+STAFF).set({
        documentTypeSignal:"declared_type_text_consistent",
        decision:"verified",
      }),true);
    await check("Super Admin browser cannot forge backend OCR", ()=>
      superadmin.doc("lguApplicantDocumentScreenings/"+STAFF).set({
        documentTypeSignal:"declared_type_text_consistent",
      }),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguApplicantDocumentScreenings/"+STAFF).set({
        uid:STAFF,documentTypeSignal:"document_type_inconclusive",
        decision:"manual_review_required",
        documentAuthenticityVerified:false,
      });
    });
    await check("Applicant can read own OCR review status", ()=>
      applicant.doc("lguApplicantDocumentScreenings/"+STAFF).get());
    await check("Programmer Super Admin can review OCR screening", ()=>
      superadmin.doc("lguApplicantDocumentScreenings/"+STAFF).get());
    await check("LGU operational Admin cannot access OCR screening", ()=>
      admin.doc("lguApplicantDocumentScreenings/"+STAFF).get(),true);
    await check("Other resident cannot read private OCR results", ()=>
      stranger.doc("lguApplicantDocumentScreenings/"+STAFF).get(),true);
    await check("applicant cannot overwrite manual review status",
      ()=>row.update({reviewStatus:"verified"}),true);
    await check("applicant cannot delete evidence metadata",
      ()=>row.delete(),true);
    await check("applicant cannot create second forged doc for another UID",
      ()=>applicant.doc("lguApplicantEvidence/"+SU).set({...base(),uid:SU}),true);
  }finally{await env.cleanup();}
  console.log("LGU applicant identity evidence rules: "+passed+" passed, "+failed+" failed.");
  if(failed)process.exitCode=1;
}
main().catch(err=>{console.error(err);process.exitCode=1;});
