"use strict";

/**
 * ADDITIVE PREVIEW ONLY. This module does not use any Firebase SDK, server
 * credentials, Firestore collection, network request or user notifications.
 * Existing Emergency Reports, Volunteer Task UI, Certificates, Donations,
 * Admin and Resident functionality is untouched.
 *
 * The production auto-matching runtime is unconditionally disabled in this
 * review candidate. Only a separately reviewed release can connect the
 * matcher to authenticated endpoints and implement live offer transactions.
 */
const {planVolunteerWaves,recommendNextWave}=require("./planner.cjs");

const LIVE_FIREBASE_PROJECT="volunserve-3aa5b";
const STAGING_FIREBASE_PROJECT="volunserve-volunteer-staging";

function isEnabledForIsolatedStaging(env={}) {
  // Never connect to production under this code-only candidate, even if an
  // accidentally copied environment variable says enabled.
  return env.VOLUNSERVE_AUTOMATCH_ADDONLY_STAGING_ENABLED==="true" &&
    env.FIREBASE_PROJECT_ID===STAGING_FIREBASE_PROJECT &&
    env.FIREBASE_PROJECT_ID!==LIVE_FIREBASE_PROJECT;
}

function simulateVolunteerRecommendation({incident,volunteers,knownBarangays,neighborsByBarangay,activeAssignments}={}) {
  if(!incident||typeof incident!=="object"||!Array.isArray(volunteers)||
     !Array.isArray(knownBarangays)||knownBarangays.length===0){
    return {kind:"preview",status:"blocked",reason:"missing_reviewed_data",offerSent:false};
  }
  const plan=planVolunteerWaves(incident,volunteers,{
    knownBarangays,neighborsByBarangay:neighborsByBarangay||{},
    activeAssignments:activeAssignments||[]
  });
  const next=recommendNextWave(plan);
  return {
    kind:"preview",status:next.action,reason:next.reason||null,
    wave:next.wave||0,volunteerId:next.action==="offer"?next.volunteerId:null,
    eligible:plan.counts.eligible,reviewed:plan.counts.reviewed,
    requiresOfficialEscalation:plan.requiresOfficialEscalation,
    // Unlike the real production engine, previews must never emit offers.
    offerSent:false,
  };
}

module.exports={
  isEnabledForIsolatedStaging,simulateVolunteerRecommendation,
  LIVE_FIREBASE_PROJECT,STAGING_FIREBASE_PROJECT,
};
