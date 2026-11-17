#!/usr/bin/env node
"use strict";
/**
 * Tests existing, published-source data shapes with synthetic records only.
 * No Firebase SDK, no credentials, Firestore writes, or production service.
 */
const assert=require("node:assert/strict");
const {
 normalizeLiveDisasterCase,normalizeLiveApprovedVolunteer,
 normalizeLiveAssignments,checkManualAssignmentConflict,
 previewExistingLiveEmergency,previewFromLiveAdminDirectory
}=require("../backend/additiveEmergencyMatching/liveCompatibility.cjs");

let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const baseIncident={
  title:"TEST ONLY - Dummy Emergency",status:"validated",verificationStatus:"validated",
  reporterUid:"resident-1",severity:"low",incidentBarangay:"Bagong Buhay I",
  reporterBarangay:"Bagong Buhay II",requiredSkills:["First Aid"],
  dispatchBlocked:false,activeVolunteerSupportAssignmentId:"",
  activeVolunteerSupportUid:"",activeLguResponderUid:"official-lgu-do-not-touch"
};
const approvedApp={
  uid:"vol-1",status:"approved",fullName:"Fictional Approved Volunteer",
  skills:["First Aid"],identityStatus:"verified"
};
const approvedUser={
  uid:"vol-1",role:"resident",status:"approved",
  activeMode:"resident",volunteerStatus:"approved",
  volunteerAccess:true,identityVerified:true,
  barangay:"Bagong Buhay I",skills:["First Aid"]
};
const roster=[{id:"vol-1",...approvedApp}];
const knownBarangays=["Bagong Buhay I","Bagong Buhay II","San Rafael I"];
const input={
  caseId:"dummy-case-1",
  caseData:baseIncident,
  approvedApplications:roster,
  usersByUid:{"vol-1":approvedUser},
  assignments:[],responderLocksByUid:{},
  knownBarangays
};
const state=JSON.stringify(input);
const result=previewExistingLiveEmergency(input);
eq(result.status,"offer","Wave 1 candidate");
eq(result.wave,1,"Wave 1 same current barangay");
eq(result.volunteerId,"vol-1","existing linked approved UID");
eq(result.offerSent,false,"preview never creates Firestore task");
eq(result.productionDispatchEnabled,false,"production automation OFF");
ok(JSON.stringify(input)===state,"preview never edits user or case input");
const normalized=normalizeLiveDisasterCase("dummy-case-1",baseIncident);
eq(normalized.incidentBarangay,"Bagong Buhay I","incident barangay trumps reporter address");
eq(normalized.requiredSkills,["First Aid"],"published requiredSkills honored");
ok(!Object.hasOwn(normalized,"activeLguResponderUid"),"do not modify or copy official LGU fields");
eq(normalizeLiveDisasterCase("dummy-case-1",{
  ...baseIncident,incidentBarangay:"",emergencyBarangay:"",barangay:""
}).incidentBarangay,"Bagong Buhay II","fallback reporter barangay per live Admin");
ok(!normalizeLiveDisasterCase("../evil",baseIncident),"invalid path-like case ID blocked");
eq(normalizeLiveApprovedVolunteer({
  applicationId:"vol-1",application:approvedApp,user:approvedUser
}).user.barangay,"Bagong Buhay I","volunteer location always from users profile");
const absentCurrentBarangay={...approvedUser,barangay:"",addressBarangay:""};
ok(!normalizeLiveApprovedVolunteer({
  applicationId:"vol-1",application:{...approvedApp,barangay:"Bagong Buhay I"},
  user:absentCurrentBarangay
}),"approved application cannot invent Volunteer location");
const invalidUid={...approvedUser,uid:"other-volunteer"};
ok(!normalizeLiveApprovedVolunteer({
  applicationId:"vol-1",application:approvedApp,user:invalidUid
}),"mismatched users UID must fail closed");
const preview=overrides=>previewExistingLiveEmergency({...input,...overrides});
const denied=(overrides,reason)=>{
 const value=preview(overrides);
 eq(value.status,"blocked",reason+" blocked");
 eq(value.reason,reason,reason+" reason");
 eq(value.offerSent,false,reason+" never writes");
};
denied({caseData:{...baseIncident,verificationStatus:"pending_verification"}},"not_validated_open_case");
denied({caseData:{...baseIncident,status:"closed"}},"not_validated_open_case");
denied({caseData:{...baseIncident,dispatchBlocked:true}},"not_validated_open_case");
denied({caseData:{...baseIncident,reporterUid:""}},"not_validated_open_case");
denied({caseData:{...baseIncident,activeVolunteerSupportAssignmentId:"dummy-case-1_vol-1"}},"existing_responder_reference");
denied({caseData:{...baseIncident,activeVolunteerSupportUid:"vol-1"}},"existing_responder_reference");
denied({caseData:{...baseIncident,activeResponderAssignmentId:"legacy-task"}},"existing_responder_reference");
denied({assignments:[{id:"manual-1",caseId:"dummy-case-1",volunteerId:"vol-1",status:"offered"}]},"existing_manual_or_auto_assignment");
denied({assignments:[{id:"manual-2",caseId:"dummy-case-1",volunteerId:"vol-1",status:"accepted"}]},"existing_manual_or_auto_assignment");
denied({knownBarangays:[]},"missing_reviewed_roster");
denied({approvedApplications:Array.from({length:201},()=>approvedApp)},"pool_limit");
const unavailable=(overrides,label)=>{
 const value=preview(overrides);
 ok(value.status!=="offer",label+" no offer");
 eq(value.offerSent,false,label+" read only");
};
unavailable({approvedApplications:[{...approvedApp,status:"pending"}]},"unapproved application");
unavailable({usersByUid:{"vol-1":{...approvedUser,status:"suspended"}}},"suspended user");
unavailable({usersByUid:{"vol-1":{...approvedUser,volunteerStatus:"revoked"}}},"revoked Volunteer");
unavailable({usersByUid:{"vol-1":{...approvedUser,volunteerAccess:false}}},"revoked Volunteer access");
unavailable({usersByUid:{"vol-1":{...approvedUser,identityVerified:false,identityStatus:"rejected"}}},"rejected identity");
unavailable({approvedApplications:[{...approvedApp,identityStatus:"rejected"}],
  usersByUid:{"vol-1":{...approvedUser,identityVerified:true}}},"rejected application identity");
unavailable({usersByUid:{"vol-1":{...approvedUser,role:"admin"}}},"no Admin Volunteers");
unavailable({usersByUid:{"vol-1":{...approvedUser,barangay:"Unknown Outside SJDM"}}},"outside SJDM");
unavailable({caseData:{...baseIncident,requiredSkills:["Water rescue"]}},"unmatched skills");
unavailable({caseData:{...baseIncident,reporterUid:"vol-1"}},"cannot volunteer for own report");
unavailable({responderLocksByUid:{"vol-1":{caseId:"another"}}},"already locked");
unavailable({assignments:[{id:"other",caseId:"other-case",volunteerId:"vol-1",status:"offered"}]},"active offer elsewhere");
const anotherBarangay=preview({usersByUid:{"vol-1":{...approvedUser,barangay:"San Rafael I"}}});
eq(anotherBarangay.status,"offer","wave 3 can serve verified SJDM barangay");
eq(anotherBarangay.wave,3,"citywide fallback only after Wave 1/2");
const wave2=preview({usersByUid:{"vol-1":{...approvedUser,barangay:"Bagong Buhay II"}},
  neighborsByBarangay:{"bagong buhay i":["Bagong Buhay II"]}});
eq(wave2.wave,2,"wave 2 only with known adjacency configuration");
const critical=preview({caseData:{...baseIncident,severity:"critical"}});
eq(critical.requiresOfficialEscalation,true,"critical incident requires official hotline");
eq(critical.offerSent,false,"critical preview does not dispatch");
eq(normalizeLiveAssignments([{id:"legacy",caseId:"dummy-case-1",
  volunteerId:"vol-1",status:"completed"}]).length,1,"terminal assignment retained");
eq(checkManualAssignmentConflict(normalized,[{
  caseId:"dummy-case-1",volunteerId:"vol-1",status:"completed"
}]),null,"completed manual assignment does not block new review");
const historicalFallback=preview({
  usersByUid:{"vol-1":{...approvedUser,volunteerAccess:undefined}}
});
ok(historicalFallback.status!=="offer","do not auto-approve incomplete legacy profile");
const screenProfile={
  uid:"vol-1",fullName:"Fictional Approved Volunteer",
  barangay:"Bagong Buhay I",skills:["First Aid"],availability:[],
  role:"resident",status:"approved",volunteerStatus:"approved",
  volunteerAccess:true,identityVerified:true,identityStatus:"verified",
  applicationApproved:true
};
const fromScreen=previewFromLiveAdminDirectory({
  incident:{id:"dummy-case-1",...baseIncident},
  approvedVolunteers:[screenProfile],assignments:[],responderLocksByUid:{},
  knownBarangays
});
eq(fromScreen.status,"offer","existing Admin merged Volunteer directory compatibility");
eq(fromScreen.volunteerId,"vol-1","Admin directory uses original Volunteer UID");
eq(fromScreen.offerSent,false,"Admin screen preview remains read only");
const blockedWithoutLocks=previewFromLiveAdminDirectory({
  incident:{id:"dummy-case-1",...baseIncident},
  approvedVolunteers:[screenProfile],assignments:[],knownBarangays
});
eq(blockedWithoutLocks.status,"blocked","missing lock subscription must block");
eq(blockedWithoutLocks.reason,"lock_snapshot_missing","missing lock snapshot reason");
eq(previewExistingLiveEmergency({...input,responderLocksByUid:undefined}).reason,
  "lock_snapshot_missing","raw adapter also blocks missing lock snapshots");
eq(previewFromLiveAdminDirectory({
  incident:{id:"dummy-case-1",...baseIncident},
  approvedVolunteers:[{...screenProfile,applicationApproved:false}],
  assignments:[],responderLocksByUid:{},knownBarangays
}).status,"admin_review","only approved Admin directory applicants may be eligible");
eq(previewFromLiveAdminDirectory({
  incident:{id:"dummy-case-1",...baseIncident},
  approvedVolunteers:[screenProfile],assignments:[
    {caseId:"dummy-case-1",volunteerId:"vol-1",status:"offered"}
  ],responderLocksByUid:{},knownBarangays
}).reason,"existing_manual_or_auto_assignment","manual assignments take precedence");
console.log("PASS: "+checks+" compatibility assertions for deployed Admin case schema, Volunteer approval, manual response locks, SJDM matching and no-write behavior");
