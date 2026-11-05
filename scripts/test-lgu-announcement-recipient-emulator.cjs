"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.LGU_RECIPIENT_RULES_FILE)
  throw Error("Refuse live Firestore LGU area tests; emulator required");
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const setup=(uid,area)=>({barangay:area,barangayDeclaredAt:stamp(),barangayDeclaredBy:uid});
const notice=(uid,area)=>({
  title:"Official Barangay Advisory",
  message:"Please follow the verified LGU barangay notice and safety instructions.",
  audience:area,priority:"normal",publishAt:stamp(),createdBy:uid,
  createdAt:stamp(),updatedAt:stamp(),linkUrl:"",imageUrl:""
});
(async()=>{
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve",
    firestore:{rules:fs.readFileSync(process.env.LGU_RECIPIENT_RULES_FILE,"utf8")}
  });
  try{
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await db.doc("users/staff").set({uid:"staff",role:"admin",status:"approved",adminStatus:"active",
        barangay:"",fullName:"TEST LGU Staff"});
      await db.doc("users/staff2").set({uid:"staff2",role:"admin",status:"approved",adminStatus:"active",barangay:""});
      await db.doc("users/active").set({uid:"active",role:"admin",status:"approved",adminStatus:"active",barangay:"Citrus"});
      await db.doc("users/suspended").set({uid:"suspended",role:"admin",status:"approved",adminStatus:"suspended",barangay:""});
      await db.doc("users/resident").set({uid:"resident",role:"resident",status:"approved",barangay:"Citrus"});
      await db.doc("users/system").set({uid:"system",role:"superadmin",status:"approved",barangay:""});
    });
    const staff=env.authenticatedContext("staff").firestore();
    const staff2=env.authenticatedContext("staff2").firestore();
    const active=env.authenticatedContext("active").firestore();
    const suspended=env.authenticatedContext("suspended").firestore();
    const resident=env.authenticatedContext("resident").firestore();
    const system=env.authenticatedContext("system").firestore();
    await assertFails(staff.collection("announcements").add(notice("staff","Muzon East")));
    await assertFails(staff.doc("users/staff").update({barangay:"Muzon East"}));
    await assertFails(staff.doc("users/staff").update(setup("staff","unlisted barangay")));
    await assertFails(staff.doc("users/staff").update({...setup("staff","Muzon East"),role:"superadmin"}));
    await assertFails(staff2.doc("users/staff2").update({...setup("staff2","Muzon East"),barangayDeclaredBy:"staff"}));
    await assertFails(suspended.doc("users/suspended").update(setup("suspended","Muzon East")));
    await assertFails(resident.doc("users/resident").update(setup("resident","Muzon East")));
    await assertFails(system.doc("users/system").update(setup("system","Muzon East")));
    await assertSucceeds(staff.doc("users/staff").update(setup("staff","Muzon East")));
    const profile=await assertSucceeds(staff.doc("users/staff").get());
    assert.equal(profile.data().barangay,"Muzon East");
    assert.equal(profile.data().barangayDeclaredBy,"staff");
    await assertFails(staff.doc("users/staff").update(setup("staff","Citrus")));
    await assertFails(staff.doc("users/staff").update({barangay:"Citrus"}));
    await assertSucceeds(staff.collection("announcements").add(notice("staff","Muzon East")));
    await assertFails(staff.collection("announcements").add(notice("staff","Citrus")));
    await assertFails(staff.collection("announcements").add(notice("staff","all")));
    await assertSucceeds(active.collection("announcements").add(notice("active","Citrus")));
    await assertFails(active.collection("announcements").add(notice("active","Muzon East")));
    await assertFails(suspended.collection("announcements").add(notice("suspended","Muzon East")));
    await assertFails(resident.collection("announcements").add(notice("resident","Citrus")));
    console.log("PASS: no Super Admin LGU assignment, legacy Admin initializes once, immutable area, scoped announcement, suspended and spoofed roles blocked.");
  }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
