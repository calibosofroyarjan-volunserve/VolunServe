"use strict";
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,getDoc,writeBatch,serverTimestamp}=require("firebase/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Firestore emulator required - refusing production");
async function main(){
 const env=await initializeTestEnvironment({
   projectId:"demo-volunserve",
   firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
 });
 try{
   await env.clearFirestore();
   await env.withSecurityRulesDisabled(async ctx=>{
     const db=ctx.firestore();
     for(const [id,data] of [
       ["super-reviewer",{role:"superadmin",status:"approved"}],
       ["lgu-staff-admin",{role:"admin",status:"approved",adminStatus:"active"}],
       ["other-resident",{role:"resident",status:"approved",residentAccess:true}],
       ["new-lgustaff",{role:"applicant",status:"pending_review",residentAccess:false,volunteerAccess:false,lguOffice:"Public Safety",lguPosition:"Responder"}],
       ["approved-lgustaff",{role:"admin",status:"approved",residentAccess:false,volunteerAccess:false,lguOffice:"Public Safety"}],
       ["other-applicant",{role:"applicant",status:"pending_review",residentAccess:false,volunteerAccess:false}],
       ["rejected-lgustaff",{role:"applicant",status:"rejected",residentAccess:false,volunteerAccess:false,lguOffice:"Public Safety"}],
     ])await setDoc(doc(db,"users",id),{uid:id,...data});
   });
   const db=(uid)=>env.authenticatedContext(uid).firestore();
   const staff="new-lgustaff";
   const reject={status:"rejected",rejectedReason:"Could not verify current LGU employment authorization.",reviewedAt:serverTimestamp(),reviewedBy:"super-reviewer"};
   await assertFails(updateDoc(doc(db(staff),"users",staff),reject));
   await assertFails(updateDoc(doc(db("other-resident"),"users",staff),reject));
   await assertFails(updateDoc(doc(db("lgu-staff-admin"),"users",staff),{...reject,reviewedBy:"lgu-staff-admin"}));
   await assertFails(updateDoc(doc(db("super-reviewer"),"users",staff),{...reject,rejectedReason:"Too short"}));
   await assertFails(updateDoc(doc(db("super-reviewer"),"users",staff),{...reject,role:"admin"}));
   await assertFails(updateDoc(doc(db("super-reviewer"),"users","approved-lgustaff"),reject));
   await assertFails(updateDoc(doc(db("super-reviewer"),"users","other-applicant"),reject));
   await assertFails(updateDoc(doc(db("super-reviewer"),"users","rejected-lgustaff"),reject));
   console.log("PASS: applicant, Resident, LGU Admin, invalid rejection and non-staff records are denied.");
   const superDb=db("super-reviewer");
   const batch=writeBatch(superDb);
   batch.update(doc(superDb,"users",staff),reject);
   batch.set(doc(superDb,"adminLogs","reject-test-record"),{
     actionType:"lgu_admin_application_rejected",targetType:"user",targetId:staff,
     adminUid:"super-reviewer",adminName:"Test Super Admin",
     description:"Application rejected after authorized review.",createdAt:serverTimestamp(),
   });
   await assertSucceeds(batch.commit());
   const updated=await getDoc(doc(db("super-reviewer"),"users",staff));
   if(updated.data()?.role!=="applicant"||updated.data()?.status!=="rejected"||
      updated.data()?.residentAccess!==false||updated.data()?.volunteerAccess!==false) {
     throw Error("Rejected LGU applicant accidentally gained access");
   }
   await assertSucceeds(getDoc(doc(db("super-reviewer"),"adminLogs","reject-test-record")));
   await assertFails(getDoc(doc(db("lgu-staff-admin"),"adminLogs","reject-test-record")));
   console.log("PASS: only Super Admin rejects pending LGU staff and writes an audit record; role stays unprivileged.");
 }finally{await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
