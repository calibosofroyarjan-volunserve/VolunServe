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
    // Mirror the real Admin manual-offer case patch. The native Resident map
    // cannot subscribe to the assigned Volunteer's GPS without this exact ID.
    await assertSucceeds(updateDoc(incidentRef,{
      status:"assigned",assignedVolunteerIds:arrayUnion(VOLUNTEER),
      assignedVolunteersCount:1,
      activeVolunteerSupportUid:VOLUNTEER,
      activeVolunteerSupportName:"Synthetic Volunteer",
      activeVolunteerSupportAssignmentId:OFFER,
      assignedAt:stamp(),updatedAt:stamp(),
    }));
    const residentCase = (await assertSucceeds(getDoc(
      doc(resident,"disasterCases",CASE)
    ))).data();
    assert.equal(residentCase.reporterUid,RESIDENT);
    assert.equal(residentCase.activeVolunteerSupportUid,VOLUNTEER);
    assert.equal(residentCase.activeVolunteerSupportAssignmentId,OFFER);
    await assertFails(getDoc(doc(outsider,"disasterCases",CASE)));

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
    await assertSucceeds(getDoc(doc(admin,"responseLocations",VOLUNTEER)));
    await assertFails(getDoc(doc(outsider,"responseLocations",VOLUNTEER)));

    // GPS privacy regression: active case ownership permits the exact assigned
    // document only. Never allow public collection scans, anonymous reads,
    // forged volunteers, mismatched assignments, or extra location data.
    const anonymous = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous,"responseLocations",VOLUNTEER)));
    await assertFails(getDocs(collection(resident,"responseLocations")));
    await assertFails(getDocs(collection(outsider,"responseLocations")));
    await assertFails(setDoc(doc(resident,"responseLocations",VOLUNTEER),payload));
    await assertFails(setDoc(doc(volunteer,"responseLocations",OUTSIDER),{
      ...payload,volunteerId:OUTSIDER,
    }));
    await assertFails(setDoc(gpsRef,{...payload,assignmentId:"qa-unlinked"}));
    await assertFails(setDoc(gpsRef,{...payload,caseId:"qa-unrelated"}));
    await assertFails(setDoc(gpsRef,{...payload,accuracy:"20"}));
    await assertFails(setDoc(gpsRef,{...payload,privateAddress:"should-not-be-stored"}));
    // Failed updates must not corrupt the last legitimate tracking payload.
    const stillValid = (await assertSucceeds(getDoc(gpsRef))).data();
    assert.equal(stillValid.assignmentId,OFFER);
    assert.equal(stillValid.caseId,CASE);
    assert.equal(stillValid.volunteerId,VOLUNTEER);
    console.log("PASS: GPS privacy — assigned Resident/Admin document read only, no anonymous/cross-case/bulk reads or forged writes");

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

    // Disputed assistance: Resident says NOT HELPED. It must create a dispute,
    // never an automatic verified contribution or resolved case.
    const DISPUTE_CASE = "qa-disputed-case";
    const DISPUTE = "qa-disputed-case_qa-volunteer";
    await env.withSecurityRulesDisabled(async context => {
      const root = context.firestore();
      await setDoc(doc(root, "disasterCases", DISPUTE_CASE), {
        reporterUid:RESIDENT,status:"assigned",verificationStatus:"validated",
      });
      await setDoc(doc(root,"responseAssignments",DISPUTE), {
        caseId:DISPUTE_CASE,volunteerId:VOLUNTEER,
        volunteerName:"Synthetic Volunteer",caseTitle:"Synthetic disputed case",
        status:"completed",contributionType:"Task completion",
        contributionSummary:"Volunteer marked task complete; no field report was submitted.",
        peopleHelped:0,completionNotes:"",residentConfirmationStatus:"pending",
        responseStartedAt:stamp(),arrivedAt:stamp(),completedAt:stamp(),
        createdAt:stamp(),updatedAt:stamp(),
      });
    });
    const disputeNote = "The Resident reports no assistance was received.";
    const disputed = writeBatch(resident);
    disputed.set(doc(resident,"assistanceConfirmations",DISPUTE), {
      assignmentId:DISPUTE,caseId:DISPUTE_CASE,residentId:RESIDENT,
      volunteerId:VOLUNTEER,outcome:"not_helped",reviewState:"disputed",
      residentNote:disputeNote,creditStatus:"disputed",
      createdAt:stamp(),updatedAt:stamp(),
    });
    disputed.set(doc(resident,"responseDisputes",DISPUTE), {
      assignmentId:DISPUTE,caseId:DISPUTE_CASE,
      volunteerId:VOLUNTEER,residentId:RESIDENT,
      residentNote:disputeNote,contributionType:"Task completion",
      contributionSummary:"Volunteer marked task complete; no field report was submitted.",
      status:"open",createdAt:stamp(),updatedAt:stamp(),
    });
    disputed.update(doc(resident,"responseAssignments",DISPUTE), {
      residentConfirmationStatus:"disputed",residentConfirmationOutcome:"not_helped",
      residentConfirmedAt:stamp(),updatedAt:stamp(),
    });
    await assertSucceeds(disputed.commit());
    assert.equal((await assertSucceeds(getDoc(doc(admin,"responseDisputes",DISPUTE)))).data().status,"open");
    assert.equal((await assertSucceeds(getDoc(doc(admin,"disasterCases",DISPUTE_CASE)))).data().status,"assigned");
    assert.equal((await assertSucceeds(getDoc(doc(admin,"verifiedContributions",DISPUTE)))).exists(),false);
    console.log("PASS: Not Helped creates Admin dispute; case stays open; no contribution credit");

    // Partial assistance uses the exact Resident confirmation rules but may
    // NOT be treated as fully helped for Admin case resolution.
    const PARTIAL_CASE = "qa-partial-case";
    const PARTIAL = "qa-partial-case_qa-volunteer";
    await env.withSecurityRulesDisabled(async context => {
      const root = context.firestore();
      await setDoc(doc(root,"disasterCases",PARTIAL_CASE),{
        reporterUid:RESIDENT,status:"assigned",verificationStatus:"validated",
      });
      await setDoc(doc(root,"responseAssignments",PARTIAL),{
        caseId:PARTIAL_CASE,volunteerId:VOLUNTEER,
        volunteerName:"Synthetic Volunteer",caseTitle:"Synthetic partial case",
        status:"completed",contributionType:"Task completion",
        contributionSummary:"Volunteer marked task complete; no field report was submitted.",
        peopleHelped:0,completionNotes:"",residentConfirmationStatus:"pending",
        responseStartedAt:stamp(),arrivedAt:stamp(),completedAt:stamp(),
        createdAt:stamp(),updatedAt:stamp(),
      });
    });
    const partialAssignment = (await assertSucceeds(getDoc(doc(resident,"responseAssignments",PARTIAL)))).data();
    const partial = writeBatch(resident);
    partial.set(doc(resident,"assistanceConfirmations",PARTIAL), {
      assignmentId:PARTIAL,caseId:PARTIAL_CASE,residentId:RESIDENT,
      volunteerId:VOLUNTEER,outcome:"partially_helped",
      reviewState:"resident_confirmed",residentNote:"Help was partial.",
      creditStatus:"credited",createdAt:stamp(),updatedAt:stamp(),
    });
    partial.set(doc(resident,"verifiedContributions",PARTIAL),{
      assignmentId:PARTIAL,caseId:PARTIAL_CASE,volunteerId:VOLUNTEER,
      volunteerName:"Synthetic Volunteer",residentId:RESIDENT,
      outcome:"partially_helped",contributionType:partialAssignment.contributionType,
      contributionSummary:partialAssignment.contributionSummary,
      peopleHelped:partialAssignment.peopleHelped,
      completionNotes:partialAssignment.completionNotes,
      responseStartedAt:partialAssignment.responseStartedAt,
      arrivedAt:partialAssignment.arrivedAt,completedAt:partialAssignment.completedAt,
      residentConfirmedAt:stamp(),verificationSource:"resident_confirmation",
      status:"verified",createdAt:stamp(),verifiedAt:stamp(),
    });
    partial.update(doc(resident,"responseAssignments",PARTIAL),{
      residentConfirmationStatus:"resident_confirmed",
      residentConfirmationOutcome:"partially_helped",verifiedContributionId:PARTIAL,
      residentConfirmedAt:stamp(),updatedAt:stamp(),
    });
    await assertSucceeds(partial.commit());
    assert.equal((await assertSucceeds(getDoc(doc(admin,"verifiedContributions",PARTIAL)))).data().outcome,"partially_helped");
    assert.equal((await assertSucceeds(getDoc(doc(admin,"disasterCases",PARTIAL_CASE)))).data().status,"assigned");
    console.log("PASS: Partially Helped recorded; case not automatically resolved");

    // Manual Volunteer decline and Admin re-offer reuse the same assignment
    // document. A declined/re-offered task must never turn on GPS early.
    const REOFFER_CASE = "qa-reoffer-case";
    const REOFFER = "qa-reoffer-case_qa-volunteer";
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(),"disasterCases",REOFFER_CASE),{
        reporterUid:RESIDENT,status:"validated",verificationStatus:"validated",
      });
    });
    const reofferRef = doc(admin,"responseAssignments",REOFFER);
    await assertSucceeds(setDoc(reofferRef,{
      caseId:REOFFER_CASE,volunteerId:VOLUNTEER,
      volunteerName:"Synthetic Volunteer",caseTitle:"Synthetic manual re-offer",
      status:"offered",createdBy:ADMIN,createdAt:stamp(),updatedAt:stamp(),
    }));
    const reofferVolunteerRef = doc(volunteer,"responseAssignments",REOFFER);
    await assertSucceeds(updateDoc(reofferVolunteerRef,{
      status:"declined",updatedAt:stamp(),
    }));
    assert.equal((await assertSucceeds(getDoc(reofferVolunteerRef))).data().status,"declined");
    await assertFails(setDoc(gpsRef,{
      ...payload,assignmentId:REOFFER,caseId:REOFFER_CASE,
    }));
    await assertFails(updateDoc(reofferVolunteerRef,{
      status:"responding",responseStartedAt:stamp(),updatedAt:stamp(),
    }));
    await assertSucceeds(updateDoc(reofferRef,{
      status:"offered",updatedAt:stamp(),
    }));
    await assertFails(setDoc(gpsRef,{
      ...payload,assignmentId:REOFFER,caseId:REOFFER_CASE,
    }));
    await assertSucceeds(updateDoc(reofferVolunteerRef,{
      status:"accepted",updatedAt:stamp(),
    }));
    await assertFails(updateDoc(reofferVolunteerRef,{
      status:"completed",completedAt:stamp(),updatedAt:stamp(),
    }));
    await assertSucceeds(updateDoc(reofferVolunteerRef,{
      status:"responding",responseStartedAt:stamp(),updatedAt:stamp(),
    }));
    assert.equal((await assertSucceeds(getDoc(reofferVolunteerRef))).data().status,"responding");
    console.log("PASS: manual Decline → Admin Re-offer → Accept → Responding, no premature GPS or skipped transitions");

  } finally {
    await env.cleanup();
  }
}
main().catch((err) => {console.error(err);process.exitCode=1;});
