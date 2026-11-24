"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");

function checkTSX(file){
  const input=fs.readFileSync(file,"utf8");
  const parsed=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const errors=parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," "));
  assert.deepEqual(errors,[],file+" must parse cleanly");
  return input;
}
const page=checkTSX(path.resolve(__dirname,"../app/(admin)/admin-cases.tsx"));
const design=checkTSX(path.resolve(__dirname,"../components/admin/EmergencyFiveTabDesign.tsx"));
for(const [name,condition] of [
  ["Queue-only initial state",page.includes("useState(false)")&&page.includes("isCaseDetailOpen")],
  ["Queue disappears on detail",page.includes("{!isCaseDetailOpen && (")],
  ["Full-width detail only on selection",page.includes("{isCaseDetailOpen && selectedCase && (")],
  ["Case click opens details",page.includes("setIsCaseDetailOpen(true)")],
  ["Back button returns to queue",page.includes("setIsCaseDetailOpen(false)")],
  ["Five-case pagination retained",page.includes("visibleCases.slice((activeCasePage - 1) * 5, activeCasePage * 5)")],
  ["Five detail tabs retained",["overview","evidence","response","personnel","history"].every(x=>page.includes('["'+x+'"'))],
  ["No forced fake data",!page.includes('Maria Santos')&&!design.includes('Maria Santos')],
  ["Real GPS map only",design.includes("Number.isFinite(lat)")&&design.includes('maps.google.com/maps?q=')],
  ["Real Firestore assignment listener",page.includes('collection(db, "responseAssignments")')],
  ["Offer states instead of false acceptance",design.includes("Pending Acceptance") && design.includes("Task offered is not the same as Volunteer accepted")],
  ["Preserve volunteer manual controls",page.includes("cancelAssignment(savedAssignment)")],
]){
  assert.ok(condition,"FAILED: "+name);
  console.log("PASS:",name);
}
console.log("Admin Emergency Reports master-detail checks passed (no deploy or database access).");


for (const [name,condition] of [
  ["Preserves historical review actions",page.includes("reviewVerification(") && page.includes("cancelAssignment(")],
  ["Preserves Firestore transactions",page.includes("runTransaction(db")],
  ["Preserves resident evidence panel",page.includes("reviewReasons") && page.includes("Evidence")],
  ["Preserves manual and historical assignment actions",design.includes('x.status!=="completed" ?') && design.includes("onCancelAssignment(x)")],
  ["Preserves named Volunteer action tab",page.includes('["personnel", "Volunteers"]')],
  ["Only real offers, not assumed acceptance",design.includes("allAssignments") && design.includes("accepted") && design.includes("declined")],
  ["Existing incident Live Map route remains",page.includes('admin-live-map?caseId=')],
]) {
  assert.ok(condition,"FAILED: "+name);
  console.log("PASS:",name);
}
