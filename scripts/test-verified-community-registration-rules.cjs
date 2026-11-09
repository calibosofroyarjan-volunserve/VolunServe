"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc, Timestamp} = require("firebase/firestore");

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve-verified-signup",
    firestore: {rules: fs.readFileSync("firestore.rules", "utf8")},
  });
  try {
    const validProfile = {
      uid: "new-resident", email: "real@gmail.com", fullName: "Test, Resident",
      firstName: "Resident", lastName: "Test", middleName: "",
      age: 23, phoneNumber: "+639171234567",
      region: "Region III – Central Luzon", province: "Bulacan",
      city: "City of San Jose del Monte", barangay: "Muzon Proper",
      address: "Muzon Proper, City of San Jose del Monte, Bulacan",
      occupationCategory: "Student", occupationSpecialization: "College",
      occupationOther: "", occupation: "Student", skills: [],
      skillOther: "", availability: [], role: "resident",
      requestedRole: "resident", primaryRole: "resident",
      residentAccess: true, volunteerAccess: false,
      volunteerStatus: "not_applied", activeMode: "resident",
      status: "approved", identityStatus: "basic", identityVerified: false,
      profilePictureUrl: "", createdAt: Timestamp.now(),
    };
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "legacy-guest"), {
        uid: "legacy-guest", role: "guest", status: "approved",
        email: "guest@gmail.com",residentAccess:true,activeMode:"resident",
      });
      await setDoc(doc(db, "users", "admin"), {
        uid: "admin", role: "admin", status: "approved",
        email: "admin@gmail.com", adminStatus: "active",
      });
      await setDoc(doc(db, "users", "existing-resident"), {
        uid: "existing-resident", email: "existing@gmail.com",
        role: "resident", status: "approved", residentAccess: true,
        activeMode: "resident",
      });
      await setDoc(doc(db, "announcements", "published"), {
        title: "Public safety update", publishAt: Timestamp.fromMillis(1000),
      });
    });
    const as = (uid, email, verified) =>
      env.authenticatedContext(uid, {email, email_verified: verified}).firestore();
    await assertFails(getDoc(doc(as("existing-resident","existing@gmail.com",false),"announcements","published")));
    await assertFails(getDoc(doc(as("existing-resident","other@gmail.com",true),"announcements","published")));
    await assertSucceeds(getDoc(doc(as("existing-resident","existing@gmail.com",true),"announcements","published")));
    await assertFails(getDoc(doc(as("legacy-guest","guest@gmail.com",true),"announcements","published")));

    // Staff role in a user document must NOT bypass Firebase's verified-email
    // claim by invoking Firestore directly, outside the normal Login UI.
    await assertFails(getDoc(doc(as("admin", "admin@gmail.com", false),"users","existing-resident")));
    await assertSucceeds(getDoc(doc(as("admin", "admin@gmail.com", true),"users","existing-resident")));

    await assertFails(setDoc(doc(as("new-resident","real@gmail.com",false),"users","new-resident"),validProfile));
    await assertFails(setDoc(doc(as("new-resident","other@gmail.com",true),"users","new-resident"),validProfile));
    // Every invalid registration has its own UID to test CREATE permission
    // (rather than accidentally testing UPDATE on an existing profile).
    let n = 0;
    async function invalidCreate(changes) {
      const uid = "invalid-resident-" + (++n);
      const email = "invalid" + n + "@gmail.com";
      const candidate = {...validProfile,uid,email,...changes};
      await assertFails(setDoc(doc(as(uid,email,true),"users",uid),candidate));
    }
    await invalidCreate({phoneNumber:"0917"});
    await invalidCreate({phoneNumber:"+639171234567999"});
    await invalidCreate({barangay:"Muzon"});
    await invalidCreate({barangay:"Quezon City"});
    await invalidCreate({occupationCategory:"Unknown"});
    await invalidCreate({occupationCategory:"Student",occupationSpecialization:"Doctor"});
    await invalidCreate({occupationCategory:"Student",occupationOther:"Unrelated occupation"});
    await invalidCreate({occupationCategory:"Unemployed",occupationSpecialization:"Doctor"});
    await invalidCreate({occupationCategory:"Student",occupationSpecialization:""});
    await invalidCreate({occupationCategory:"Other (Specify)",occupationSpecialization:"",occupationOther:""});
    await invalidCreate({firstName:"A"});
    await invalidCreate({lastName:"A"});
    await invalidCreate({age:17});
    await invalidCreate({age:101});
    await invalidCreate({region:""});
    // A number was removed from both legacy signups, so a blank value is valid.
    const optionalUid="new-resident-no-phone", optionalEmail="no-phone@gmail.com";
    await assertSucceeds(setDoc(doc(as(optionalUid,optionalEmail,true),"users",optionalUid),{
      ...validProfile,uid:optionalUid,email:optionalEmail,phoneNumber:"",
    }));
    // A verified real mailbox cannot be swapped for disposable email, even
    // when a caller skips the frontend and talks directly to Firestore.
    for(const [n,mailbox] of [
      ["emailkeep","test@emailkeep.com"],["emailkeep-sub","test@sub.emailkeep.com"],
      ["en2ch","test@en2ch.co"],["en2ch-sub","test@sub.en2ch.co"]
    ]) {
      const uid="disposable-"+n;
      await assertFails(setDoc(doc(as(uid,mailbox,true),"users",uid),{
        ...validProfile,uid,email:mailbox,phoneNumber:"",
      }));
    }
    await assertSucceeds(setDoc(doc(as("new-resident","real@gmail.com",true),"users","new-resident"),validProfile));
    assert.ok(true);
    console.log("PASS Firestore: unverified community/staff emails denied; verified complete Resident and staff access permitted.");
  } finally {
    await env.cleanup();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
