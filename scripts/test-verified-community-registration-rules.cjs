"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc, writeBatch, serverTimestamp, Timestamp} = require("firebase/firestore");

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
    // Known provider-associated temporary domains must fail for existing
    // verified community profiles, even when bypassing the login UI.
    for (const [uid,email] of [
      ["existing-temp-mailer", "person@mailer.pics"],
      ["existing-temp-gmail-lookalike","person@gmail.shagni.com"],
      ["existing-temp-uppercase", "person@MAILER.PICS"],
      ["existing-temp-mixed", "person@suB.MPMAIL.TOP"],
      ["existing-temp-emailkeep-upper","person@EMAILKEEP.COM"]
    ]) {
      await env.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(),"users",uid),{
          uid,email,role:"resident",status:"approved",residentAccess:true,activeMode:"resident"
        });
      });
      await assertFails(getDoc(doc(as(uid,email,true),"announcements","published")));
    }

    // Staff role in a user document must NOT bypass Firebase's verified-email
    // claim by invoking Firestore directly, outside the normal Login UI.
    await assertFails(getDoc(doc(as("admin", "admin@gmail.com", false),"users","existing-resident")));
    await assertSucceeds(getDoc(doc(as("admin", "admin@gmail.com", true),"users","existing-resident")));

    await assertFails(setDoc(doc(as("new-resident","real@gmail.com",false),"users","new-resident"),validProfile));
    await assertFails(setDoc(doc(as("new-resident","other@gmail.com",true),"users","new-resident"),validProfile));
    // Firebase Auth can create an unverified UID even when front-end screening
    // is bypassed; verified disposable mailboxes must NOT create Resident data.
    for (const domain of ["en2ch.co","en2ch.com","sub.en2ch.co","emailkeep.com","sub.emailkeep.com"]) {
      const uid = "blocked-disposable-" + domain.replace(/[^a-z0-9]/g,"-");
      const email = "person@" + domain;
      await assertFails(setDoc(doc(as(uid,email,true),"users",uid),{
        ...validProfile,uid,email,
      }));
    }
    for(const domain of ["mailer.pics","mpmail.top","gmail.shagni.com","ghostmailz.club","mail.sc2hub.com",
      "MAILER.PICS","sub.MPMAIL.TOP","EN2CH.CO","EMAILKEEP.COM","sub.EMAILKEEP.COM"]){
      const uid="blocked-provider-"+domain.replace(/[^a-z0-9]/g,"-");
      const email="person@"+domain;
      await assertFails(setDoc(doc(as(uid,email,true),"users",uid),{...validProfile,uid,email}));
    }
    // Legitimate Gmail must continue to work even though gmail.shagni.com is blocked.
        // Every invalid registration has its own UID to test CREATE permission
    // (rather than accidentally testing UPDATE on an existing profile).
    let n = 0;
    async function invalidCreate(changes) {
      const uid = "invalid-resident-" + (++n);
      const email = "invalid" + n + "@gmail.com";
      const candidate = {...validProfile,uid,email,...changes};
      // Include the required claim so only the input validation decides the denial.
      await assertFails(createGmailResident(uid,email,candidate));
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
    // New Gmail Residents must create their mailbox claim and profile
    // together; non-Gmail Resident registration needs no Gmail claim.
    async function createGmailResident(uid,email,profile) {
      const db = as(uid,email,true);
      const canonical = email.toLowerCase().split("@")[0].split("+")[0].replace(/\./g,"")+"@gmail.com";
      const batch=writeBatch(db);
      batch.set(doc(db,"gmailAliasClaims",canonical),{uid,createdAt:serverTimestamp()});
      batch.set(doc(db,"users",uid),{...profile,uid,email});
      return batch.commit();
    }
    // The published signup form removed phone input. Verified Basic
    // Resident may register with an empty phone; malformed nonempty phones
    // remain rejected by validInitialResidentInputs().
    await assertSucceeds(createGmailResident("new-resident-no-phone","no-phone@gmail.com",
      {...validProfile,phoneNumber:""}));
    await assertSucceeds(createGmailResident("new-resident","real@gmail.com",validProfile));
    // A raw SDK profile create must never bypass the mailbox claim.
    await assertFails(setDoc(doc(as("direct-gmail","re.al@gmail.com",true),"users","direct-gmail"),
      {...validProfile,uid:"direct-gmail",email:"re.al@gmail.com"}));
    // Dot-variation and googlemail.com aliases must lose to the first writer.
    await assertFails(createGmailResident("dot-clone","r.e.a.l@gmail.com",validProfile));
    await assertFails(createGmailResident("domain-clone","real@googlemail.com",validProfile));
    // A Yahoo address is not Gmail and remains valid with the original route.
    await assertSucceeds(setDoc(doc(as("valid-yahoo","member@yahoo.com",true),"users","valid-yahoo"),
      {...validProfile,uid:"valid-yahoo",email:"member@yahoo.com"}));
    // Alias claims cannot be created in isolation or usurped by strangers.
    const orphan=as("orphan","orphan@gmail.com",true);
    await assertFails(setDoc(doc(orphan,"gmailAliasClaims","orphan@gmail.com"),
      {uid:"orphan",createdAt:serverTimestamp()}));
    await assertFails(setDoc(doc(as("impostor","notreal@gmail.com",true),
      "gmailAliasClaims","real@gmail.com"),{uid:"impostor",createdAt:serverTimestamp()}));
    assert.ok(true);
    console.log("PASS Firestore: unverified community/staff emails denied; verified complete Resident and staff access permitted.");
  } finally {
    await env.cleanup();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
