"use strict";

/**
 * Real Auth-context + Firestore Rules emulator E2E.
 * Synthetic accounts and cases only. Hard refusal outside local emulator.
 * Never connects to production, writes Firebase rules, or deploys anything.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {
  arrayUnion, collection, doc, getDoc, getDocs, query, setDoc,
  updateDoc, where, writeBatch, serverTimestamp,
} = require("firebase/firestore");

const host = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host)) {
  throw Error("Refusing remote Firebase access. FIRESTORE_EMULATOR_HOST must point to localhost.");
}
const PROJECT = "demo-volunserve-emergency-flow-qa-20261125";
const ADMIN = "qa-admin";
const RESIDENT = "qa-resident";
const VOLUNTEER = "qa-volunteer";
const OUTSIDER = "qa-outsider";
const CASE = "qa-incident";
const OFFER = "qa-incident_qa-volunteer";

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {rules: fs.readFileSync("firestore.rules","utf8")},
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const accounts = [
        [ADMIN,{role:"admin",status:"approved"}],
        [RESIDENT,{role:"resident",status:"approved",email:"resident@test.local",residentAccess:true,activeMode:"resident",identityVerified:true}],
        [VOLUNTEER,{role:"resident",status:"approved",email:"volunteer@test.local",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",identityVerified:true}],
        [OUTSIDER,{role:"resident",status:"approved",email:"outsider@test.local",residentAccess:true,activeMode:"resident",identityVerified:true}],
      ];
      for (const [uid, data] of accounts) {
        await setDoc(doc(db,"users",uid),{uid,...data});
      }
    });

    const dbAs = (uid, email) => env.authenticatedContext(uid,{email,email_verified:true}).firestore();
    const admin = dbAs(ADMIN,"admin@test.local");
    const resident = dbAs(RESIDENT,"resident@test.local");
    const volunteer = dbAs(VOLUNTEER,"volunteer@test.local");
    const outsider = dbAs(OUTSIDER,"outsider@test.local");
    const assignmentRef = doc(admin,"responseAssignments",OFFER);
    const incidentRef = doc(admin,"disasterCases",CASE);
    const stamp = () => serverTimestamp();

    // Actual Resident submission goes through the deployed Firestore create
    // contract, with synthetic metadata and no real resident/photo/GPS.
    await assertSucceeds(setDoc(doc(resident,"disasterCases",CASE), {
      reporterUid:RESIDENT,reporterName:"Synthetic Resident",
      reporterEmail:"resident@test.local",reporterBarangay:"",
      reporterAddress:"Synthetic QA address",contactNumber:"09123456789",
      emergencyContact:"",reporterProfilePictureUrl:"",
      source:"resident_emergency_assistance",requestKind:"emergency_assistance",
      title:"Synthetic emergency QA",category:"Other Emergency",severity:"medium",
      status:"reported",verificationStatus:"pending_verification",
      evidenceReviewStatus:"pending_review",
      location:"Synthetic incident pin inside SJDM",
      latitude:14.813,longitude:121.045,gpsAccuracyMeters:20,
      locationCapturedAt:stamp(),details:"Synthetic resident request for QA testing only.",
      affectedPeople:1,assistanceTypes:["Emergency assistance"],
      requiredSkills:["General Volunteer"],neededGoods:["Assessment only"],
      needsNote:"",needs:"Emergency assistance requested",
      attachments:[{url:"https://example.invalid/synthetic.jpg",type:"image"}],
      photoEvidenceCount:1,videoEvidenceCount:0,
      verification:{gpsProvided:true,photoEvidenceProvided:true},
      residentConfirmationAccepted:true,residentConfirmationAt:stamp(),
      privacyScope:"admin_and_assigned_responder",
      requiredVolunteers:0,assignedVolunteersCount:0,
      assignedVolunteerIds:[],adminNote:"",
      validatedAt:null,validatedBy:null,assignedAt:null,
      resolvedAt:null,closedAt:null,createdAt:stamp(),updatedAt:stamp(),
    }));
    await assertFails(getDoc(doc(volunteer,"disasterCases",CASE)));
    await assertSucceeds(updateDoc(incidentRef,{
      status:"validated",verificationStatus:"validated",evidenceReviewStatus:"approved",
      validatedAt:stamp(),validatedBy:ADMIN,updatedAt:stamp(),
    }));

    // Admin offers the task; case has no barangay.
    await assertSucceeds(setDoc(assignmentRef,{
      caseId:CASE,volunteerId:VOLUNTEER,volunteerName:"Synthetic Volunteer",
      caseTitle:"Synthetic emergency QA",status:"offered",createdBy:ADMIN,
      createdAt:stamp(),updatedAt:stamp(),
    }));
    await assertSucceeds(updateDoc(incidentRef,{
      status:"assigned",assignedVolunteerIds:arrayUnion(VOLUNTEER),
      assignedVolunteersCount:1,updatedAt:stamp(),
    }));

    const own = query(collection(volunteer,"responseAssignments"),where("volunteerId","==",VOLUNTEER));
    assert.equal((await assertSucceeds(getDocs(own))).size,1);
    await assertFails(getDoc(doc(outsider,"responseAssignments",OFFER)));

    const ownAssignment = doc(volunteer,"responseAssignments",OFFER);
    const gpsRef = doc(volunteer,"responseLocations",VOLUNTEER);
    const payload = {
      volunteerId:VOLUNTEER,assignmentId:OFFER,caseId:CASE,
      latitude:14.8137,longitude:121.045,accuracy:20,updatedAt:stamp(),
    };
    await assertFails(setDoc(gpsRef,payload)); // "Offered" must not start GPS.
    await assertSucceeds(updateDoc(ownAssignment,{status:"accepted",updatedAt:stamp()}));
    await assertFails(setDoc(gpsRef,payload)); // "Accepted" does not begin sharing.
    await assertSucceeds(updateDoc(ownAssignment,{
      status:"responding",updatedAt:stamp(),responseStartedAt:stamp(),
    }));
    await assertSucceeds(setDoc(gpsRef,payload));
    await assertSucceeds(getDoc(doc(resident,"responseLocations",VOLUNTEER)));
    await assertFails(getDoc(doc(outsider,"responseLocations",VOLUNTEER)));

    await assertSucceeds(updateDoc(ownAssignment,{
      status:"on_site",updatedAt:stamp(),arrivedAt:stamp(),
    }));
    await assertSucceeds(setDoc(gpsRef,{...payload,latitude:14.813}));
    await assertSucceeds(updateDoc(ownAssignment,{
      status:"completed",updatedAt:stamp(),
      contributionType:"Task completion",
      contributionSummary:"Volunteer marked task complete; no field report was submitted.",
      peopleHelped:0,completionNotes:"",completedAt:stamp(),
      residentConfirmationStatus:"pending",
    }));
    await assertFails(setDoc(gpsRef,payload)); // Completed ends sharing.
    await assertFails(getDoc(doc(resident,"responseLocations",VOLUNTEER)));
    const reports = await assertSucceeds(getDocs(collection(admin,"volunteerFieldReports")));
    assert.equal(reports.size,0,"Completing must not create a Field Report");

    const assignment = (await assertSucceeds(getDoc(doc(resident,"responseAssignments",OFFER)))).data();
    assert.equal(assignment.status,"completed");
    const batch = writeBatch(resident);
    batch.set(doc(resident,"assistanceConfirmations",OFFER),{
      assignmentId:OFFER,caseId:CASE,residentId:RESIDENT,volunteerId:VOLUNTEER,
      outcome:"fully_helped",reviewState:"resident_confirmed",residentNote:"",
      creditStatus:"credited",createdAt:stamp(),updatedAt:stamp(),
    });
    batch.set(doc(resident,"verifiedContributions",OFFER),{
      assignmentId:OFFER,caseId:CASE,volunteerId:VOLUNTEER,
      volunteerName:"Synthetic Volunteer",residentId:RESIDENT,
      outcome:"fully_helped",contributionType:assignment.contributionType,
      contributionSummary:assignment.contributionSummary,
      peopleHelped:assignment.peopleHelped,completionNotes:assignment.completionNotes,
      responseStartedAt:assignment.responseStartedAt,arrivedAt:assignment.arrivedAt,
      completedAt:assignment.completedAt,residentConfirmedAt:stamp(),
      verificationSource:"resident_confirmation",status:"verified",
      createdAt:stamp(),verifiedAt:stamp(),
    });
    batch.update(doc(resident,"responseAssignments",OFFER),{
      residentConfirmationStatus:"resident_confirmed",
      residentConfirmationOutcome:"fully_helped",verifiedContributionId:OFFER,
      residentConfirmedAt:stamp(),updatedAt:stamp(),
    });
    await assertSucceeds(batch.commit());

    await assertSucceeds(updateDoc(incidentRef,{status:"in_progress",updatedAt:stamp()}));
    await assertSucceeds(updateDoc(incidentRef,{
      status:"resolved",resolvedAt:stamp(),updatedAt:stamp(),
    }));
    assert.equal((await assertSucceeds(getDoc(incidentRef))).data().status,"resolved");
    console.log("PASS: synthetic Resident report → Admin review/offer → Volunteer accept → GPS share/stop → On Site → one-tap completion → Resident fully helped → Admin resolved");
  } finally {
    await env.cleanup();
  }
}
main().catch((err) => {console.error(err);process.exitCode=1;});
