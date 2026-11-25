"use strict";
// Source contract regression for a Hosting-snapshot-derived, NO DEPLOY release
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const read=(p)=>fs.readFileSync(p,"utf8");
const admin=read("app/(admin)/admin-cases.tsx");
const volunteer=read("app/(tabs)/volunteer.tsx");
const volunteerWeb=read("app/(tabs)/volunteer.web.tsx");
const flow=read("components/tabs/ResponseFlow.web.tsx");
const nativeMap=read("components/tabs/MapTracking.native.tsx");
const webMap=read("components/tabs/MapTracking.web.tsx");
const reportWeb=read("components/DisasterResponse.web.tsx");
const reportNative=read("components/DisasterResponse.native.tsx");
const myCases=read("app/(tabs)/my-cases.tsx");
const entry=read("app/(tabs)/disaster-response.tsx");
const matching=read("components/admin/EmergencyFiveTabDesign.tsx");
const eligibility=read("components/admin/VolunteerEligibilityValidation.tsx");
const rules=read("firestore.rules");

test("resident submission is authorized by the existing Firestore schema",()=>{
  for(const s of [reportWeb,reportNative])assert.match(s,/pending_verification/);
  assert.match(rules,/match \/disasterCases\/\{caseId\}/);
  assert.match(rules,/request\.resource\.data\.status == 'reported'/);
  assert.match(admin,/currentVerification !== "validated"/);
});

test("Admin only manually offers verified approved task to eligible volunteer",()=>{
  assert.match(admin,/onPress=\{\(\) => assignVolunteerToCase\(incident, volunteer\)\}/);
  assert.match(admin,/responderLockSnapshot\.exists\(\)/);
  assert.match(admin,/hasCurrentSkillMatch/);
  assert.match(admin,/currentVerification !== "validated"/);
  assert.doesNotMatch(admin,/currentVolunteerBarangay !== currentCaseBarangay|Emergency case barangay is missing|Volunteer profile has no barangay/);
  assert.match(admin,/automaticStatus="off"/);
  assert.match(admin,/manualOnly/);
  assert.match(matching,/Manual Volunteer Assignment/);
  assert.match(eligibility,/Manual assignment · citywide eligible Volunteers/);
  assert.doesNotMatch(admin,/collection\(db, "volunteerFieldReports"\)/);
  assert.doesNotMatch(admin,/VOLUNTEER → LGU FIELD REPORT/);
  // Original official LGU coordination and safeguards must remain untouched
  assert.match(admin,/LGU Field Report Review Required/);
  assert.match(admin,/activeLguResponderUid/);
});

test("Resident and Volunteer screens never trigger automatic Volunteer fan-out",()=>{
  for(const entry of [
    "components/DisasterResponse.web.tsx",
    "components/DisasterResponse.native.tsx",
    "app/(tabs)/volunteer.tsx",
    "app/(tabs)/volunteer.web.tsx",
    "components/tabs/ResponseFlow.web.tsx",
  ]){
    const source=read(entry);
    assert.doesNotMatch(source,/requestRenderEmergencyAuto|respondRenderEmergencyAuto/);
    assert.doesNotMatch(source,/emergency-auto\/report-submitted|emergency-auto\/respond/);
  }
  // Manual Admin assignment is still the only Volunteer task-offer action.
  assert.match(admin,/onPress=\{\(\) => assignVolunteerToCase\(incident, volunteer\)\}/);
  assert.match(admin,/automaticStatus="off"/);
});

test("latest observed deployed Render auto-invite controller stays off without explicit production approvals",()=>{
  // Read the latest read-only Render live deploy commit (2026-11-25). Do not use production
  // credentials, modify env settings, or call any actual API endpoints.
  const {execFileSync}=require("node:child_process");
  const release="d3308da6107f517061f5022997a229de9d05a0cb";
  const source=execFileSync("git",["show",release+":backend/renderEmergencyAutoInvites.js"],{
    encoding:"utf8",timeout:20000,maxBuffer:1024*1024
  });
  assert.match(source,/VOLUNSERVE_RENDER_AUTO_ENABLED/);
  assert.match(source,/VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED/);
  const m={exports:{}};
  vm.runInNewContext(source,{
    exports:m.exports,module:m,process:{env:{}},
    require:(p)=>{
      assert.equal(p,"../functions/emergencySimpleAutoInvite");
      return {volunteerAllowed:()=>false};
    },
    Date,Math,Number,Set,Map,Array,Object,JSON,RegExp,Error,Promise
  },{filename:"deployed-render-auto-controller.js",timeout:1000});
  const {config}=m.exports;
  const production={FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-3aa5b"}),
    VOLUNSERVE_RENDER_AUTO_PROJECT_ID:"volunserve-3aa5b"};
  assert.equal(config({}).enabled,false);
  assert.equal(config(production).enabled,false);
  assert.equal(config({...production,VOLUNSERVE_RENDER_AUTO_ENABLED:"true"}).enabled,false);
  assert.equal(config({...production,VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED:"true"}).enabled,false);
  assert.equal(config({...production,VOLUNSERVE_RENDER_AUTO_ENABLED:"true",
    VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED:"true"}).enabled,true);
  // Gate source behavior is established; deployed env values remain UNKNOWN.
});

test("Volunteer web/native one-tap completion has no required Field Report",()=>{
  for(const s of [volunteer,volunteerWeb]){
    for(const key of ['accepted: "offered"','declined: "offered"','responding: "accepted"','on_site: "responding"','completed: "on_site"']) {
      assert.ok(s.includes(key),key);
    }
    assert.match(s,/Mark Task Complete/);
    assert.doesNotMatch(s,/Submit Field Report & Complete|Hide Field Report/);
    assert.doesNotMatch(s,/"volunteerFieldReports"/);
    assert.match(s,/patch\.peopleHelped = 0/);
    assert.match(s,/residentConfirmationStatus = "pending"/);
  }
  assert.match(flow,/Mark Task Complete/);
  assert.doesNotMatch(flow,/MissionCompletionForm/);
  assert.match(flow,/await setDoc\(locationRef, payload\)/);
  assert.match(flow,/deleteDoc\(locationRef\)/);
});

test("GPS publishing is private, case-scoped, stops with case and task status",()=>{
  assert.match(rules,/match \/responseLocations\/\{uid\}/);
  assert.match(rules,/linkedAssignmentForWrite\(\)\.status in/);
  assert.match(nativeMap,/activeEmergencyTaskRef\.current/);
  assert.match(nativeMap,/responseLocations", CURRENT_USER_ID/);
  assert.match(nativeMap,/\["responding", "on_site"\]\.includes/);
  assert.match(webMap,/responseLocations/);
});

test("Native Resident sees only an active, case-specific private Volunteer GPS pin",()=>{
  assert.match(nativeMap,/activeVolunteerSupportAssignmentId/);
  assert.match(nativeMap,/doc\(db, "responseAssignments", trackedVolunteerAssignmentId\)/);
  assert.match(nativeMap,/doc\(db, "responseLocations", volunteerUid\)/);
  assert.match(nativeMap,/gps\.assignmentId === trackedVolunteerAssignmentId/);
  assert.match(nativeMap,/gps\.caseId === focusedCaseId/);
  assert.match(nativeMap,/\["responding", "on_site"\]\.includes\(String\(assignment\.status\)\)/);
  assert.match(nativeMap,/focusedIncident\?\.reportedBy === CURRENT_USER_ID/);
  assert.match(nativeMap,/gpsClock - lastUpdate > 120_000/);
  assert.match(nativeMap,/validCityRoute\(\[/);
  assert.match(nativeMap,/Assigned Volunteer · live GPS/);
  assert.match(nativeMap,/not verified arrival or guaranteed road ETA/);
  assert.doesNotMatch(nativeMap,/collection\(db, "responseLocations"\)/);
  // Existing official LGU pins and Volunteer GPS publishing must survive.
  assert.match(nativeMap,/visibleLguVehiclePins\.filter/);
  assert.match(nativeMap,/setDoc\(doc\(db, "responseLocations", CURRENT_USER_ID\)/);
  assert.match(rules,/match \/responseLocations\/\{uid\}/);
});

test("Admin does not auto-resolve a Volunteer case without full Resident confirmation",()=>{
  assert.match(admin,/item\.residentConfirmationStatus !== "resident_confirmed"/);
  assert.match(admin,/item\.residentConfirmationOutcome !== "fully_helped"/);
  for(const option of ['"fully_helped"','"partially_helped"','"not_helped"'])assert.ok(myCases.includes(option));
  assert.match(myCases,/assignment\.contributionType !== "Task completion"/);
  assert.match(myCases,/This does not prove that assistance was delivered/);
  assert.match(myCases,/"assistanceConfirmations"/);
  assert.match(myCases,/"responseDisputes"/);
});

test("Call 911 only invokes device dialer",()=>{
  assert.match(entry,/Linking\.openURL\("tel:911"\)/);
  assert.match(entry,/does not call or dispatch 911 automatically/);
});

test("100 m proximity is advisory with accuracy and freshness checks",()=>{
  const js=ts.transpileModule(read("lib/emergencyArrival.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const ctx={exports:{}};
  vm.runInNewContext(js,{module:ctx,exports:ctx.exports,Date,Math,Number});
  const fn=ctx.exports.emergencyArrivalAssessment;
  const now=1800000000000,d={latitude:14.813,longitude:121.045};
  assert.equal(fn({latitude:14.8135,longitude:121.045,accuracy:15,timestamp:now},d,now).status,"near");
  assert.equal(fn({latitude:14.816,longitude:121.045,accuracy:15,timestamp:now},d,now).status,"en_route");
  assert.equal(fn({latitude:14.8135,longitude:121.045,accuracy:70,timestamp:now},d,now).status,"low_accuracy");
  assert.equal(fn({latitude:14.8135,longitude:121.045,accuracy:10,timestamp:now-60000},d,now).status,"stale");
  assert.equal(fn(null,d,now).within100Meters,false);
});
