"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=
  require("@firebase/rules-unit-testing");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.LIVE_NOTIFICATION_RULES_FILE)
  throw Error("STOP: notifications privacy tests require FIRESTORE EMULATOR");
const rules=fs.readFileSync(process.env.LIVE_NOTIFICATION_RULES_FILE,"utf8");
if(!rules.includes("match /notifications/"))throw Error("STOP: active rules lack expected inbox section");
const a=rules.indexOf("match /notifications/{notificationId}");
const b=rules.indexOf("    match /",a+20);
if(a<0||b<0)throw Error("STOP: exact active notifications rule block missing");
console.log("READ-ONLY EMULATOR CANDIDATE NOTIFICATION POLICY:");
const block=rules.slice(a,b);
if(!block.includes(".hasOnly(['read'])") || !block.includes("request.resource.data.read == true"))
  throw Error("STOP candidate must restrict content edits and accept read:true only");
console.log("PASS restricted notification read-only content policy; only read flag may change");
(async()=>{
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve",firestore:{rules}
  });
  try{
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await db.doc("users/resident").set({uid:"resident",role:"resident",status:"approved",barangay:"Francisco Homes-Narra"});
      await db.doc("users/volunteer").set({uid:"volunteer",role:"volunteer",status:"approved",barangay:"Francisco Homes-Narra"});
      await db.doc("notifications/resident-report").set({
        userId:"resident",type:"emergency",title:"Emergency report validated",
        message:"Your emergency report was verified.",read:false,
        createdAt:new Date("2026-10-26T03:00:00.000Z")
      });
      await db.doc("notifications/volunteer-invite").set({
        userId:"volunteer",type:"emergency",title:"New VolunServe Volunteer invitation",
        message:"Open Emergency Tasks.",read:false,
        createdAt:new Date("2026-10-30T03:00:00.000Z")
      });
    });
    const resident=env.authenticatedContext("resident").firestore();
    const volunteer=env.authenticatedContext("volunteer").firestore();
    const anon=env.unauthenticatedContext().firestore();
    const inbox=ctx=>ctx.collection("notifications").where("userId","==","resident");
    const rs=await assertSucceeds(inbox(resident).get());
    assert.equal(rs.docs.length,1);
    assert.equal(rs.docs[0].id,"resident-report");
    const vs=await assertSucceeds(volunteer.collection("notifications")
      .where("userId","==","volunteer").get());
    assert.equal(vs.docs.length,1);
    assert.equal(vs.docs[0].id,"volunteer-invite");
    await assertSucceeds(resident.doc("notifications/resident-report").update({read:true}));
    const marked=await assertSucceeds(resident.doc("notifications/resident-report").get());
    assert.equal(marked.data().read,true);
    await assertFails(resident.doc("notifications/volunteer-invite").get());
    await assertFails(resident.doc("notifications/volunteer-invite").update({read:true}));
    await assertFails(resident.doc("notifications/resident-report").update({title:"Fake urgent instruction"}));
    await assertFails(resident.collection("notifications").get());
    await assertFails(anon.collection("notifications").where("userId","==","resident").get());
    console.log("PASS: current live Firestore rules allow private inbox, read status update; deny cross-user/anonymous access and forged content.");
  }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
