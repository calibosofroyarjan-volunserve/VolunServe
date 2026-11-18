"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");

const file=path.join(__dirname,"../app/(admin)/admin-cases.tsx");
const source=fs.readFileSync(file,"utf8");
const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

assert.equal(tree.parseDiagnostics.length,0,
  "Admin Emergency Reports TSX must parse without errors: "+
  tree.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")).join("; "));

// These guardrails cover only Admin Emergency Reports. They do not write
// to Firestore and make no claim about real Firebase permissions or deployment.
const checks=[
  ["Resident profile in list",source.includes("reportResidentAvatar") &&
    source.includes("reporterName")],
  ["Admin review filter",source.includes("reviewQueueCard") &&
    source.includes("setReviewFilter(key)")],
  ["Distinct status groups",["pending","validated","needs_more_evidence","rejected"]
    .every(x=>source.includes('["'+x+'"') || source.includes('"'+x+'"'))],
  ["Atomic case review",source.includes("await runTransaction(db, async (transaction)")],
  ["No duplicate Admin approval",source.includes('currentVerification === "validated" || currentVerification === "rejected"')],
  ["No reset after assignment",source.includes('current.activeVolunteerSupportAssignmentId')],
  ["Fresh photo evidence inside transaction",source.includes("current.attachments.some(")],
  ["Notification recipient uses current Firestore case",source.includes("userId: current.reporterUid")],
  ["Review in progress gate",source.includes("reviewingCaseId") &&
    source.includes('disabled={!!reviewingCaseId}')],
  ["Existing five-item pagination retained",source.includes("visibleCases.slice((activeCasePage - 1) * 5, activeCasePage * 5)")],
];
for(const [description,passed] of checks){
  assert.ok(passed,"Safety check failed: "+description);
  console.log("PASS:",description);
}
console.log("Admin Emergency Reports syntax and non-invasive safety checks passed.");
