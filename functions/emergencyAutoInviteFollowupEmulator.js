"use strict";
/**
 * FICTIONAL Firebase Emulator-only automatic offer expiry and follow-up.
 * This is a PROCESS-LOCAL demonstration worker, not a durable scheduler.
 * NEVER imported or registered by production functions/index.js.
 *
 * Wave 1: all qualified same-barangay Volunteers (from approval trigger).
 * Wave 2: deliberately absent until an officially verified SJDM adjacency
 *          map is available. Do NOT fabricate nearby barangays.
 * Wave 3: unattempted qualified Volunteers in other explicitly allowed
 *          fictional SJDM barangays, after all first-wave offers expire.
 *
 * Multiple Volunteers may accept their own valid offers. ANY accepted
 * responder blocks all later-wave escalation; existing offers stay valid.
 */
const {
  explicitDemoGate,recognizedCase
}=require("./emergencyAutoInviteOnApproval");
const {
  planApprovedEmergencyVolunteerInvites,norm
}=require("./emergencyAutoInviteCompatibility");
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ORIGIN="fictional_emulator_auto_volunteer_only";
const MODE="fictional_emulator_auto_invitation";
const ACTIVE=["offered","accepted","responding","on_site"];
const ACCEPTED=new Set(["accepted","responding","on_site","completed"]);
const ref=(db,col,id)=>db.collection(col).doc(id);
const result=(status,reason,extra={})=>({
  status,reason:reason||null,emulatorOnly:true,
  productionDispatchEnabled:false,...extra
});
function createDemoFollowupScanner({
  db,FieldValue,env=process.env,
  clock=()=>Date.now(),knownBarangays=["Bagong Buhay I","Citrus"]
}={}){
  if(!db||!FieldValue?.serverTimestamp||!Array.isArray(knownBarangays)||
     typeof clock!=="function")
    throw Error("Local Firestore follow-up dependencies required");

  const known=new Set(knownBarangays.map(norm).filter(Boolean));
  async function scanCase(caseId){
    if(!explicitDemoGate(env))return result("disabled","local_emulators_required");
    if(typeof caseId!=="string"||!UID.test(caseId)||
       !caseId.startsWith("DEMO_AUTO_CASE_"))
      return result("blocked","not_a_fictional_emergency_case");
    const now=clock();
    if(!Number.isSafeInteger(now)||now<0)
      return result("blocked","invalid_emulator_clock");
    const caseRef=ref(db,"disasterCases",caseId);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const legacyRef=ref(db,"emergencyAutoDispatch",caseId);
    const offersQuery=db.collection("responseAssignments")
      .where("caseId","==",caseId).limit(201);
    const appQuery=db.collection("volunteerApplications")
      .where("status","==","approved").limit(201);
    const activeQuery=db.collection("responseAssignments")
      .where("status","in",ACTIVE).limit(201);

    return db.runTransaction(async tx=>{
      // Query and document reads ALL happen before writes; concurrent Accept,
      // Cancel and scanner ticks must serialize on the batch/case/offer docs.
      const [cSnap,bSnap,legacy,offers,apps,active]=await Promise.all([
        caseRef,batchRef,legacyRef,offersQuery,appQuery,activeQuery
      ].map(r=>tx.get(r)));
      if(!cSnap.exists||!recognizedCase(caseId,cSnap.data())||
         !bSnap.exists||bSnap.data()?.testOnly!==true||
         bSnap.data()?.caseId!==caseId||
         bSnap.data()?.origin!==ORIGIN||legacy.exists)
        return result("blocked","not_a_trusted_fictional_batch");
      const c=cSnap.data()||{},b=bSnap.data()||{};
      if(b.status==="supported")
        return result("stopped_accepted","accepted_responder_stops_escalation");
      if(b.status!=="waiting")
        return result("already_finished","batch_not_waiting");
      if(!Number.isSafeInteger(b.expiresAtMs)||b.expiresAtMs>now)
        return result("waiting","not_due");
      if(offers.size>200||apps.size>200||active.size>200)
        return result("blocked","audited_pool_limit");
      const offersData=offers.docs.map(s=>({
        ref:s.ref,id:s.id,...(s.data()||{})
      }));
      if(offersData.some(a=>a.caseId!==caseId||
         a.offerMode!==MODE||a.testOnly!==true||
         a.id!==caseId+"_"+a.volunteerId||
         !UID.test(String(a.volunteerId||""))))
        return result("blocked","mixed_or_untrusted_case_assignments");
      if(offersData.some(a=>ACCEPTED.has(a.status)))
        return result("stopped_accepted","accepted_responder_stops_escalation");

      const pending=offersData.filter(a=>a.status==="offered");
      if(pending.some(a=>!Number.isSafeInteger(a.expiresAtMs)||
         a.expiresAtMs>now))
        return result("waiting","some_live_offers_not_expired");
      const reservations=await Promise.all(pending.map(a=>
        tx.get(ref(db,"autoVolunteerReservations",a.volunteerId))));
      if(pending.some((a,i)=>!reservations[i].exists||
         reservations[i].data()?.caseId!==caseId||
         reservations[i].data()?.uid!==a.volunteerId||
         reservations[i].data()?.assignmentId!==a.id))
        return result("blocked","untrusted_old_reservations");
      const terminal=["cancelled","closed","resolved","rejected"].includes(c.status)||
        c.dispatchBlocked===true||Boolean(c.closedAt)||Boolean(c.resolvedAt);
      const authorized=c.verificationStatus==="validated" &&
        ["validated","assigned","in_progress"].includes(c.status) &&
        !c.activeVolunteerSupportAssignmentId &&
        !c.activeVolunteerSupportUid &&
        UID.test(String(c.validatedBy||""));
      let admin=null;
      if(!terminal&&authorized)
        admin=await tx.get(ref(db,"users",c.validatedBy));
      if(!terminal&&(!authorized||!admin?.exists||
         admin.data()?.role!=="admin"||
         admin.data()?.status!=="approved"||
         admin.data()?.adminStatus==="suspended"))
        return result("blocked","approval_no_longer_authorized");
      const stamp=FieldValue.serverTimestamp();
      const closeOld=()=>{
        for(const a of pending){
          tx.update(a.ref,{status:"expired",updatedAt:stamp});
          tx.delete(ref(db,"autoVolunteerReservations",a.volunteerId));
        }
      };
      if(terminal){
        closeOld();
        tx.update(batchRef,{status:"cancelled",updatedAt:stamp});
        return result("cancelled","fictional_case_closed",
          {expired:pending.length});
      }
      if(b.wave!==1&&b.wave!==3)
        return result("blocked","unknown_fictional_wave");
      const incidentBarangay=norm(c.incidentBarangay||
        c.emergencyBarangay||c.barangay);
      if(!known.has(incidentBarangay))
        return result("blocked","unknown_incident_barangay");
      const attempted=new Set(offersData.map(a=>a.volunteerId));
      const busy=active.docs.map(s=>s.data()||{});
      const rows=[];
      if(b.wave===1){
        const seen=new Set();
        for(const applicant of apps.docs){
          const data=applicant.data()||{};
          const uid=String(data.uid||"");
          if(!UID.test(uid)||applicant.id!==uid||seen.has(uid))
            return result("blocked","untrusted_approved_candidate_uid");
          seen.add(uid);
          if(attempted.has(uid))continue;
          const userSnap=await tx.get(ref(db,"users",uid));
          const user=userSnap.exists?userSnap.data()||{}:{};
          const area=norm(user.barangay||user.addressBarangay);
          if(!area||!known.has(area)||area===incidentBarangay)continue;
          // Reuse the EXACT same verified skills, account, application,
          // incident status and busy-task contract as the first wave.
          // A temporary geographic scope is used solely for eligibility;
          // no adjacency relationship is inferred.
          const virtualIncident={
            ...c,id:caseId,incidentBarangay:area,
            emergencyBarangay:area,barangay:area,
            autoVolunteerDispatch:undefined
          };
          const plan=planApprovedEmergencyVolunteerInvites({
            incident:virtualIncident,
            roster:[{uid,user,application:data}],
            knownBarangays,activeAssignments:busy,caseAssignments:[]
          });
          if(plan.status==="ready")rows.push({
            uid,user,assignmentId:caseId+"_"+uid
          });
        }
        rows.sort((a,b)=>a.uid.localeCompare(b.uid));
        if(rows.length>40)
          return result("blocked","atomic_fallback_wave_limit",
            {eligible:rows.length});
      }
      const newRefs=rows.flatMap(v=>[
        ref(db,"responseAssignments",v.assignmentId),
        ref(db,"autoVolunteerReservations",v.uid),
        ref(db,"responderLocks",v.uid),
        ref(db,"notifications","auto_response_"+v.assignmentId),
        ref(db,"adminActivityLogs","auto_followup_"+v.assignmentId)
      ]);
      const newDocs=await Promise.all(newRefs.map(r=>tx.get(r)));
      if(newDocs.some(s=>s.exists))
        return result("blocked","new_candidate_reservation_conflict");

      // No later wave is permitted if accepted/supported; guarded at batch
      // read and offer-set read, both of which participate in transactions.
      closeOld();
      if(b.wave===1&&rows.length){
        const expiresAtMs=now+180000;
        for(const v of rows){
          tx.create(ref(db,"autoVolunteerReservations",v.uid),{
            caseId,uid:v.uid,assignmentId:v.assignmentId,
            expiresAtMs,testOnly:true,createdAt:stamp
          });
          tx.create(ref(db,"responseAssignments",v.assignmentId),{
            caseId,volunteerId:v.uid,
            volunteerName:String(v.user.fullName||"Fictional Volunteer").slice(0,120),
            caseTitle:String(c.title||"Fictional Emergency").slice(0,120),
            status:"offered",createdBy:"automatic_matching_engine",
            offerMode:MODE,wave:3,testOnly:true,expiresAtMs,
            createdAt:stamp,updatedAt:stamp
          });
          tx.create(ref(db,"notifications","auto_response_"+v.assignmentId),{
            userId:v.uid,audience:"volunteer",
            type:"response_assignment",caseId,
            assignmentId:v.assignmentId,
            title:"FICTIONAL citywide Volunteer offer",
            message:"Fictional demo: first local offers expired; "+
              "you may Accept or Decline this citywide test invitation.",
            read:false,testOnly:true,createdAt:stamp
          });
          tx.create(ref(db,"adminActivityLogs","auto_followup_"+v.assignmentId),{
            caseId,volunteerUid:v.uid,
            action:"Fictional Automatic Wave 3 Offer",
            testOnly:true,createdAt:stamp
          });
        }
        tx.update(batchRef,{
          status:"waiting",wave:3,expiresAtMs,
          volunteerCount:rows.length,updatedAt:stamp
        });
        tx.update(caseRef,{
          "autoVolunteerDispatch.state":"waiting",
          "autoVolunteerDispatch.wave":3,
          "autoVolunteerDispatch.updatedAt":stamp,
          updatedAt:stamp
        });
        return result("offered","fictional_citywide_fallback",
          {wave:3,offered:rows.length,expired:pending.length});
      }
      tx.update(batchRef,{status:"exhausted",updatedAt:stamp});
      tx.update(caseRef,{
        "autoVolunteerDispatch.state":"needs_admin_review",
        "autoVolunteerDispatch.updatedAt":stamp,
        updatedAt:stamp
      });
      return result("exhausted","no_more_verified_fictional_volunteers",
        {wave:b.wave,expired:pending.length});
    },{maxAttempts:5});
  }
  return {scanCase};
}

function createDemoFollowupWorker({
  db,FieldValue,env=process.env,clock=()=>Date.now(),
  knownBarangays=["Bagong Buhay I","Citrus"],
  intervalMs=2000,schedule=setInterval,unschedule=clearInterval
}={}){
  if(!explicitDemoGate(env))
    throw Error("Automatic follow-up worker requires isolated Firebase Emulators");
  if(!Number.isInteger(intervalMs)||intervalMs<250||intervalMs>60000||
     typeof schedule!=="function"||typeof unschedule!=="function")
    throw Error("Invalid fictional worker timer");
  const scanner=createDemoFollowupScanner({db,FieldValue,env,clock,
    knownBarangays});
  let started=false,stopped=false,busy=false,timer=null;
  let last={status:"not_started"};
  async function tick(){
    if(!started||stopped)return result("stopped");
    if(busy)return result("skipped_busy");
    if(!explicitDemoGate(env))return result("disabled","emulator_guard_lost");
    busy=true;
    try{
      const batches=await db.collection("emergencyAutoDispatchBatches")
        .where("status","==","waiting").limit(26).get();
      if(batches.size>25)return result("blocked","batch_scan_limit");
      const outcomes=[];
      for(const b of batches.docs){
        const data=b.data()||{};
        if(data.testOnly!==true||data.origin!==ORIGIN)continue;
        if(!Number.isSafeInteger(data.expiresAtMs)||
           data.expiresAtMs>clock())continue;
        outcomes.push(await scanner.scanCase(b.id));
      }
      last={status:"scanned",scanned:outcomes.length,
        outcomes:outcomes.map(x=>({status:x.status,wave:x.wave||0,
          offered:x.offered||0}))};
      return last;
    }catch(error){
      last=result("blocked","fictional_worker_unavailable");
      return last;
    }finally{busy=false;}
  }
  function start(){
    if(started||stopped)throw Error("Fictional worker already started/stopped");
    started=true;
    timer=schedule(()=>void tick().catch(()=>undefined),intervalMs);
    timer?.unref?.();
    return stop;
  }
  function stop(){
    if(stopped)return;
    stopped=true;
    if(timer!==null)unschedule(timer);
    timer=null;
  }
  function status(){
    return {active:started&&!stopped,processLocal:true,
      reliableCloudScheduler:false,emulatorOnly:true,last};
  }
  return {start,stop,tick,status};
}
module.exports={
  createDemoFollowupScanner,createDemoFollowupWorker
};
