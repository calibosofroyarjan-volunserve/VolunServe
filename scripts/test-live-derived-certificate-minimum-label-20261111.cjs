"use strict";
// Source-based unit tests for the one-file, live-derived Admin Attendance label fix.
// No Firebase access, HTTP calls, authentication or production writes.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const sourcePath = "app/(admin)/community-attendance.tsx";
const code = fs.readFileSync(path.resolve(__dirname,"..",sourcePath),"utf8");
const parsed = ts.createSourceFile(sourcePath, code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const targets = ["asDate", "displayedCertificateMinimumMinutes", "verifiedServiceMeetsMinimum"];
const sourceFunctions = new Map();
for (const node of parsed.statements) {
  if (ts.isFunctionDeclaration(node) && node.name && targets.includes(node.name.text)) {
    sourceFunctions.set(node.name.text,node.getText(parsed));
  }
}
assert.deepEqual([...sourceFunctions.keys()].sort(), [...targets].sort());
const snippet = [
  'type EventItem = { completedAt?: unknown };',
  'type Participant = { checkedInAt?: unknown; checkedOutAt?: unknown; attendanceVerified?: boolean };',
  'const LIVE_CERTIFICATE_ONE_MINUTE_START = Date.parse("2026-11-10T14:55:00Z");',
  ...targets.map(target => sourceFunctions.get(target)),
  'module.exports = {displayedCertificateMinimumMinutes,verifiedServiceMeetsMinimum};',
].join("\n");
const compiled = ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const context = {module:{exports:{}},Date,console};
vm.runInNewContext(compiled,context,{timeout:3000,filename:sourcePath});
const {displayedCertificateMinimumMinutes: min,verifiedServiceMeetsMinimum: meets} = context.module.exports;

const stamp = iso => ({toDate:()=>new Date(iso)});
function fixture(start,end,completed="2026-11-10T15:20:00Z",verified=true) {
  return [{checkedInAt:stamp(start),checkedOutAt:stamp(end),attendanceVerified:verified},
    {completedAt:stamp(completed)}];
}
test("one minute (60 seconds), five minutes, three hours all meet the new time minimum",()=>{
  for(const end of ["2026-11-10T15:01:00Z","2026-11-10T15:05:00Z","2026-11-10T18:00:00Z"]){
    const [p,e]=fixture("2026-11-10T15:00:00Z",end);
    assert.equal(min(p,e),1);
    assert.equal(meets(p,e),true);
  }
});
test("59 seconds and unverified attendance never qualify",()=>{
  const [p,e]=fixture("2026-11-10T15:00:00Z","2026-11-10T15:00:59Z");
  assert.equal(min(p,e),1);
  assert.equal(meets(p,e),false);
  const [unverified,event]=fixture("2026-11-10T15:00:00Z","2026-11-10T15:01:00Z",undefined,false);
  assert.equal(meets(unverified,event),false);
});
test("old attendance or old event completion still uses the 30-minute threshold",()=>{
  const [oldPerson,event]=fixture("2026-11-10T13:00:00Z","2026-11-10T13:01:00Z");
  assert.equal(min(oldPerson,event),30);
  assert.equal(meets(oldPerson,event),false);
  const [oldThirty]=fixture("2026-11-10T13:00:00Z","2026-11-10T13:30:00Z");
  assert.equal(meets(oldThirty,event),true);
  const [newOneMin,oldEvent]=fixture("2026-11-10T15:00:00Z","2026-11-10T15:01:00Z","2026-11-10T14:00:00Z");
  assert.equal(min(newOneMin,oldEvent),30);
  assert.equal(meets(newOneMin,oldEvent),false);
});
test("future completion and invalid duration are not displayed as service-time eligible",()=>{
  const [person,future]=fixture("2026-11-10T15:00:00Z","2026-11-10T15:01:00Z","2099-01-01T00:00:00Z");
  assert.equal(min(person,future),30);
  assert.equal(meets(person,future),false);
  const [bad,e]=fixture("2026-11-10T15:03:00Z","2026-11-10T15:00:00Z");
  assert.equal(meets(bad,e),false);
  const [tooLong,el]=fixture("2026-11-10T15:00:00Z","2026-11-12T15:00:00Z");
  assert.equal(meets(tooLong,el),false);
});
test("existing certificate backend remains production-only and no UI issuance bypass",()=>{
  assert.match(code,/const CERTIFICATE_BACKEND_URL = "https:\/\/volunserve\.onrender\.com";/);
  assert.match(code,/The server confirms actual eligibility and issues certificates\./);
  assert.match(code,/10:55 PM \(PHT\)/);
  assert.doesNotMatch(code,/30m minimum met|verified with 30\+ minutes|at least 30 minutes of verified service/);
  assert.match(code,/Retry Certificate Sync/);
});
