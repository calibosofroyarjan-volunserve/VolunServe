/**
 * Isolated Firestore emulator tests only. No production access or real facility data.
 * npx firebase emulators:exec --only firestore --project demo-volunserve "node scripts/test-sjdm-facility-rules.cjs"
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run without the Firestore emulator.");
  process.exit(1);
}
const UID = { admin:"sjdm-mock-admin", resident:"sjdm-mock-resident",
  superadmin:"sjdm-mock-programmer", suspended:"sjdm-mock-suspended" };
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const base = id => ({
  name: "Synthetic CDRRMO Test Location",
  address: "Synthetic test address, SJDM",
  barangay: "Dulong Bayan",
  facilityType: "cdrrmo",
  latitude: 14.81, longitude: 121.04,
  status: "active", verificationStatus: "verified",
  verificationSource: "Synthetic-only authorized review reference",
  updatedBy: id, updatedAt: stamp(),
});
const center = id => {
  const {facilityType, ...rest}=base(id);
  return {...rest, capacity: 100, occupied: 25, lastVerifiedAt: stamp()};
};
let count=0;
async function check(label, fn, fail=false) {
  if (fail) await assertFails(fn());
  else await assertSucceeds(fn());
  count++;
  console.log("PASS " + label);
}
async function main() {
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve",
    firestore:{rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")},
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx=>{
      const database=ctx.firestore();
      await Promise.all([
        database.doc("users/"+UID.admin).set({role:"admin",status:"approved",adminStatus:"active"}),
        database.doc("users/"+UID.resident).set({role:"resident",status:"approved",residentAccess:true}),
        database.doc("users/"+UID.superadmin).set({role:"superadmin",status:"approved"}),
        database.doc("users/"+UID.suspended).set({role:"admin",status:"approved",adminStatus:"suspended"}),
      ]);
    });
    const db=(role)=>env.authenticatedContext(UID[role]).firestore();
    const admin=db("admin"),resident=db("resident"),superDb=db("superadmin"),suspended=db("suspended");
    const facilityRef="lguMapFacilities/mock-center";
    const shelterRef="evacuation_centers/mock-shelter";
    await check("Resident cannot create verified LGU office",()=>resident.doc(facilityRef).set(base(UID.resident)),true);
    await check("Programmer Super Admin cannot publish operational facility",()=>superDb.doc(facilityRef).set(base(UID.superadmin)),true);
    await check("Suspended LGU Admin cannot publish office",()=>suspended.doc(facilityRef).set(base(UID.suspended)),true);
    await check("Approved LGU Admin can publish reviewed office",()=>admin.doc(facilityRef).set(base(UID.admin)));
    await check("Resident can view verified LGU office metadata",()=>resident.doc(facilityRef).get());
    await check("Anonymous cannot query LGU facilities",()=>env.unauthenticatedContext().firestore().collection("lguMapFacilities").get(),true);
    await check("Admin cannot publish pending office as active",()=>admin.doc("lguMapFacilities/pending-active")
      .set({...base(UID.admin),verificationStatus:"pending"}),true);
    await check("Admin cannot publish out-of-city office",()=>admin.doc("lguMapFacilities/outside")
      .set({...base(UID.admin),latitude:15.20}),true);
    await check("Admin can save pending inactive office",()=>admin.doc("lguMapFacilities/pending")
      .set({...base(UID.admin),status:"inactive",verificationStatus:"pending"}));
    await check("Admin can retire a verified office without deleting location history",()=>admin.doc(facilityRef)
      .update({status:"inactive",updatedBy:UID.admin,updatedAt:stamp()}));
    await check("Resident cannot create eviction/emergency center",()=>resident.doc(shelterRef).set(center(UID.resident)),true);
    await check("Approved LGU Admin can publish verified evacuation center",()=>admin.doc(shelterRef).set(center(UID.admin)));
    await check("Anonymous can view published center public metadata",()=>env.unauthenticatedContext().firestore().doc(shelterRef).get());
    await check("Programmer Super Admin cannot change occupancy",()=>superDb.doc(shelterRef)
      .update({occupied:5,updatedAt:stamp(),updatedBy:UID.superadmin}),true);
    await check("Admin cannot claim more occupants than capacity",()=>admin.doc(shelterRef)
      .update({occupied:101,updatedAt:stamp(),updatedBy:UID.admin}),true);
    await check("Admin cannot publish unverified evacuation center",()=>admin.doc("evacuation_centers/unverified")
      .set({...center(UID.admin),verificationStatus:"pending"}),true);
    await check("Admin cannot publish evacuation center outside SJDM envelope",()=>admin.doc("evacuation_centers/outsider")
      .set({...center(UID.admin),latitude:15.40}),true);
    await check("Admin can close verified evacuation center",()=>admin.doc(shelterRef)
      .update({status:"closed",updatedBy:UID.admin,updatedAt:stamp()}));
    console.log("PASS " + count + " LGU and evacuation facility security scenarios");
  } finally { await env.cleanup(); }
}
main().catch(e=>{console.error("FAIL SJDM facility rules: "+(e?.stack||e));process.exitCode=1;});
