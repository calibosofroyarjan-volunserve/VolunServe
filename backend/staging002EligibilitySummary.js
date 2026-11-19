"use strict";
/**
 * Read-only aggregate diagnosis for the FIXED fictional staging E2E 002.
 * This module never performs Firestore writes, creates accounts or sends offers.
 * Only an independently authenticated and approved staging Admin may call it
 * through the server's protected endpoint. No names, UIDs or documents returned.
 */
const {validateVolunteer}=require("../functions/emergencyVolunteerWavePlanner");
const {E2E_CASE_ID}=require("./stagingVolunteerTask");
const {recognized}=require("./stagingFreshCase002");
const barangays=require("../functions/sjdmBarangays.json");

const ACTIVE=["offered","accepted","responding","on_site"];
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const blocked=reason=>({status:"blocked",reason,willSendOffers:false});

async function summarizeStaging002Eligibility(db){
  const snap=await db.collection("disasterCases").doc(E2E_CASE_ID).get();
  if(!snap.exists)return blocked("fictional_002_not_created");
  const record=snap.data()||{};
  if(!recognized(record))return blocked("not_recognized_fictional_002");
  if(record.verificationStatus!=="validated"||
     !["validated","assigned"].includes(record.status)||
     record.dispatchBlocked===true)
    return blocked("fictional_002_not_validated");
  const [apps,busy]=await Promise.all([
    db.collection("volunteerApplications").where("status","==","approved").limit(201).get(),
    db.collection("responseAssignments").where("status","in",ACTIVE).limit(201).get(),
  ]);
  if(apps.size>200||busy.size>200)return blocked("staging_pool_limit");
  const seen=new Set(),reasons={},waves={wave1:0,wave2:0,wave3:0};
  let evaluated=0,invalidApplicationUid=0,duplicateApplication=0,eligible=0;
  const activeAssignments=busy.docs.map(x=>x.data()||{});
  for(const d of apps.docs){
    const a=d.data()||{};
    const uid=String(a.uid||a.userId||a.volunteerId||d.id||"").trim();
    if(!UID.test(uid)){invalidApplicationUid++;continue;}
    if(seen.has(uid)){duplicateApplication++;continue;}
    seen.add(uid);
    const account=await db.collection("users").doc(uid).get();
    const result=validateVolunteer({id:E2E_CASE_ID,...record},{
      uid,application:a,user:account.exists?account.data()||{}:{}
    },{knownBarangays:barangays,neighborsByBarangay:{},activeAssignments});
    evaluated++;
    if(result.eligible){
      eligible++;
      const wave="wave"+result.wave;
      if(Object.hasOwn(waves,wave))waves[wave]++;
    }else{
      const code=String(result.code||"unclassified").replace(/[^a-z_]/g,"").slice(0,50);
      reasons[code]=(reasons[code]||0)+1;
    }
  }
  const primaryReason=eligible>0?"eligible_volunteers_available":
    apps.size===0?"no_approved_volunteer_applications":
    Object.keys(reasons).length===1?Object.keys(reasons)[0]:
    "multiple_eligibility_reasons";
  return {
    status:eligible>0?"ready":"no_eligible_volunteers",
    reason:primaryReason,
    approvedApplications:apps.size,
    evaluated,
    eligible,
    eligibleByWave:waves,
    excludedByReason:reasons,
    invalidApplicationUid,
    duplicateApplication,
    willSendOffers:false,
    noPersonalDetails:true
  };
}
module.exports={summarizeStaging002Eligibility};
