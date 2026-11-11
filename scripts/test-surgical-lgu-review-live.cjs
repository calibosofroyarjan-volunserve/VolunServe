"use strict";
const fs=require("node:fs");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,writeBatch,getDoc,serverTimestamp}=require("firebase/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Use Firestore emulator only");
async function main(){
 const rules=fs.readFileSync("firestore.rules","utf8");
 if(!rules.includes("hasFreshLguCredentialReview()")||!rules.includes("lguAdminCredentialReviews"))throw Error("Candidate LGU policy absent");
 const env=await initializeTestEnvironment({projectId:"demo-volunserve",firestore:{rules}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();
   for(const [uid,fields] of [
    ["super-approver",{role:"superadmin",status:"approved"}],
    ["lgu-operations-admin",{role:"admin",status:"approved",adminStatus:"active"}],
    ["resident-unrelated",{role:"resident",status:"approved",residentAccess:true}]
   ])await setDoc(doc(db,"users",uid),{uid,...fields});
  });
  const admin=env.authenticatedContext("super-approver").firestore();
  const operations=env.authenticatedContext("lgu-operations-admin").firestore();
  const resident=env.authenticatedContext("resident-unrelated").firestore();
  const makeApplicant=(uid,email)=>({
   uid,email,fullName:"Verified LGU Personnel",age:0,phoneNumber:"",
   role:"applicant",status:"pending_review",residentAccess:false,volunteerAccess:false,
   region:"Region III – Central Luzon",province:"Bulacan",city:"City of San Jose del Monte",
   barangay:"Poblacion",lguOffice:"Office of Public Safety",lguPosition:"Emergency Coordinator",
   appointmentReference:"LGU-APPT-2026-TEST",createdAt:serverTimestamp()
  });
  const uid="lgu-applicant-new",email="new-verified-staff@lgu.test";
  const applicant=env.authenticatedContext(uid,{email}).firestore();
  await assertFails(setDoc(doc(applicant,"users",uid),{...makeApplicant(uid,email),role:"admin",status:"approved"}));
  await assertFails(setDoc(doc(applicant,"users","someone-else"),makeApplicant("someone-else",email)));
  await assertFails(setDoc(doc(applicant,"users",uid),{...makeApplicant(uid,email),residentAccess:true}));
  await assertSucceeds(setDoc(doc(applicant,"users",uid),makeApplicant(uid,email)));
  console.log("PASS new staff creates only own pending unprivileged profile");
  const grant={
   previousRole:"applicant",previousPrimaryRole:"applicant",role:"admin",status:"approved",
   adminStatus:"active",adminCreatedAt:serverTimestamp(),adminCreatedBy:"super-approver",
   adminUpdatedAt:serverTimestamp(),adminUpdatedBy:"super-approver"
  };
  await assertFails(updateDoc(doc(applicant,"users",uid),grant));
  await assertFails(updateDoc(doc(operations,"users",uid),grant));
  await assertFails(updateDoc(doc(admin,"users",uid),grant));
  const reviewFields={
   targetUid:uid,accountEmail:email,reviewStatus:"verified",office:"Public Safety Office",
   position:"Emergency Coordinator",credentialReference:"APPT-2026-APPROVED",
   verificationMethod:"Official LGU HR office confirmation",
   verifiedBy:"super-approver",verifiedAt:serverTimestamp(),
  };
  await assertFails(setDoc(doc(applicant,"lguAdminCredentialReviews",uid),reviewFields));
  await assertFails(setDoc(doc(operations,"lguAdminCredentialReviews",uid),reviewFields));
  console.log("PASS direct, LGU Admin and unreviewed promotions denied");
  const batch=writeBatch(admin);
  batch.set(doc(admin,"lguAdminCredentialReviews",uid),reviewFields);
  batch.update(doc(admin,"users",uid),grant);
  batch.set(doc(admin,"adminLogs","lgu-staff-approve-test"),{
   actionType:"admin_account_created",targetType:"user",targetId:uid,
   adminUid:"super-approver",adminName:"Test Super Admin",
   description:"LGU staff approved after independently confirmed employment.",
   createdAt:serverTimestamp()
  });
  await assertSucceeds(batch.commit());
  const updated=await getDoc(doc(admin,"users",uid));
  if(updated.data()?.role!=="admin"||updated.data()?.adminStatus!=="active")throw Error("Approved applicant not promoted to LGU Admin");
  await assertFails(getDoc(doc(resident,"lguAdminCredentialReviews",uid)));
  await assertSucceeds(getDoc(doc(admin,"lguAdminCredentialReviews",uid)));
  console.log("PASS reviewed Super Admin approval succeeds atomically and review record remains private");
  const rejectedUid="lgu-applicant-rejected",rejectedEmail="rejected-staff@lgu.test";
  const rejected=env.authenticatedContext(rejectedUid,{email:rejectedEmail}).firestore();
  await assertSucceeds(setDoc(doc(rejected,"users",rejectedUid),makeApplicant(rejectedUid,rejectedEmail)));
  const rejectedUpdate={status:"rejected",rejectedReason:"Employment verification failed against the official LGU HR record.",reviewedAt:serverTimestamp(),reviewedBy:"super-approver"};
  await assertFails(updateDoc(doc(operations,"users",rejectedUid),{...rejectedUpdate,reviewedBy:"lgu-operations-admin"}));
  await assertFails(updateDoc(doc(rejected,"users",rejectedUid),rejectedUpdate));
  await assertFails(updateDoc(doc(admin,"users",rejectedUid),{...rejectedUpdate,rejectedReason:"No"}));
  const rejectBatch=writeBatch(admin);
  rejectBatch.update(doc(admin,"users",rejectedUid),rejectedUpdate);
  rejectBatch.set(doc(admin,"adminLogs","lgu-staff-reject-test"),{
   actionType:"lgu_admin_application_rejected",targetType:"user",targetId:rejectedUid,
   adminUid:"super-approver",adminName:"Test Super Admin",
   description:"LGU staff application rejected due to unverified appointment.",
   createdAt:serverTimestamp()
  });
  await assertSucceeds(rejectBatch.commit());
  const rejectedProfile=(await getDoc(doc(admin,"users",rejectedUid))).data();
  if(rejectedProfile.role!=="applicant"||rejectedProfile.status!=="rejected"||
    rejectedProfile.residentAccess!==false||rejectedProfile.volunteerAccess!==false)throw Error("Rejected applicant gained unauthorized access");
  console.log("PASS rejected LGU staff retains no privileges and rejection audited");
  console.log("PASS surgical live LGU application, approval, rejection and role isolation regression");
 } finally {await env.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
