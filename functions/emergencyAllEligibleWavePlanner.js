"use strict";

/**
 * Staging-only, side-effect-free "offer to everyone in the active wave" policy.
 * This does not send messages, reserve Volunteers, or write to Firestore.
 * The dispatcher must revalidate eligibility and use atomic per-Volunteer
 * reservation/assignment writes before considering any offer delivered.
 */
const {planVolunteerWaves}=require("./emergencyVolunteerWavePlanner");

function chooseAllEligibleWave(caseData,roster,options={}) {
  const plan=planVolunteerWaves(caseData,roster,options);
  const attempted=new Set(Array.isArray(options.attemptedVolunteerIds)?
    options.attemptedVolunteerIds.filter(v=>typeof v==="string"):[]);
  const completed=new Set(Array.isArray(options.completedWaves)?
    options.completedWaves.map(Number):[]);
  const statuses=(options.existingAssignments||[]).filter(a=>
    a && a.caseId===caseData.id &&
    ["offered","accepted","responding","on_site"].includes(String(a.status))
  );
  if(statuses.length){
    return {action:"existing_active_offers",wave:0,volunteers:[],
      existing:statuses.length,counts:plan.counts};
  }
  for(const wave of [1,2,3]){
    if(completed.has(wave))continue;
    if(wave===2 && !plan.wave2Configured){
      return {action:"requires_verified_neighbors",wave,volunteers:[],
        counts:plan.counts};
    }
    const group=(plan.waves[wave]||[]).filter(person=>
      person.eligible && person.uid && !attempted.has(person.uid)
    );
    if(group.length){
      return {action:"offer_all",wave,
        volunteers:group.map(person=>person.uid),
        counts:plan.counts};
    }
    completed.add(wave);
  }
  return {action:"no_more_eligible",wave:0,volunteers:[],counts:plan.counts};
}
module.exports={chooseAllEligibleWave};
