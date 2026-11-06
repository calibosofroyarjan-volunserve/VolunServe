"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const helperSource = fs.readFileSync("lib/communityEventJoinWindow.ts", "utf8");
const js = ts.transpileModule(helperSource, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
const mod = {exports:{}};
vm.runInNewContext(js, {module:mod, exports:mod.exports, Date, Number, String}, {timeout: 1000});
const {eventScheduleHasPassed, canVolunteerJoinEvent} = mod.exports;
const now = Date.parse("2026-11-06T11:50:00+08:00");
const past = {status:"upcoming", date:"2026-10-30", time:"16:00", endTime:"18:00"};
const future = {status:"upcoming", date:"2026-11-15", time:"08:00", endTime:"10:00"};
const today = {status:"upcoming", date:"2026-11-06", time:"08:00", endTime:"16:00"};
assert.equal(eventScheduleHasPassed(past,now),true);
assert.equal(canVolunteerJoinEvent(past,now),false, "Past event must not offer Join");
assert.equal(canVolunteerJoinEvent(future,now),true, "Future event must still allow Join");
assert.equal(canVolunteerJoinEvent(today,now),true, "Today's event before end time is valid");
assert.equal(canVolunteerJoinEvent({...past,status:"active"},now),true, "Admin-started active event remains joinable");
assert.equal(canVolunteerJoinEvent({...future,status:"completed"},now),false);
assert.equal(canVolunteerJoinEvent({...future,status:"cancelled"},now),false);
assert.equal(canVolunteerJoinEvent({status:"upcoming",date:"2026-11-06",time:"08:00"},now),true,
  "No end time retains whole-day registration");
const source=fs.readFileSync("app/(tabs)/community-events.tsx","utf8");
assert(source.includes('import { canVolunteerJoinEvent, eventScheduleHasPassed }'), "Use common join window for all platforms");
assert(source.includes('onPress={() => void respondToEvent(event, "joined")}'), "Keep actual Join handler connected");
assert(source.includes('"communityEventParticipants"') && source.includes("runTransaction("), "Keep original Firestore transaction");
assert(source.includes("setEventActionFeedback({") && source.includes("accessibilityRole=\"alert\""), "Show event-local visible errors");
assert(source.includes("eventScheduleHasPassed(current"), "Check latest event inside transaction");
assert(source.includes("canVolunteerJoinEvent(event)"), "Apply same joinability to card controls");
console.log("PASS volunteer Join UI, event-local messages, expiry and unchanged Firestore transaction");
