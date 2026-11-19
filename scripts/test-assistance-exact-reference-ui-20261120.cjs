"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const p=fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const d=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
const main=p.slice(p.indexOf('  return (\n    <View style={styles.page}>'),p.indexOf('      <DocumentPreviewModal'));
const caseTab=p.slice(p.indexOf('function ReferenceCaseField'),p.indexOf('function EvidenceTab'));
assert(main.includes('contentContainerStyle={styles.referencePageContent}'),
  "Details must use one full page scroll");
assert(!main.includes('style={styles.detailMainScroll}'),
  "Nested detail scrolling must not be used");
for(const phrase of ["ReferenceCaseCard","Request Information","Resident Information",
 "Requested Amount","Current Situation","Description","Contact","Address"]){
 assert(caseTab.includes(phrase),"Reference detail missing "+phrase);
}
assert(caseTab.includes('borderBottomColor:"#E7EEEA"'),"Compact divider rows missing");
assert(!caseTab.includes("<InfoItem"),"Big grey info cards must not be used in Request Details");
assert(p.includes('backgroundColor:"#FFFFFF",\n    flexGrow:1,'),
  "Reference page requires white background");
assert(p.includes('borderBottomColor: "#087747"'),
  "Reference tabs must have a green underline on selected tab");
assert(p.includes('label="Back to Assistance Requests"') ||
 p.includes('accessibilityLabel="Back to Assistance Requests"'));
assert(main.includes('renderDetailChrome()')&&main.includes('renderReviewMain()'));
for(const v of ["Request Details","Documents (","Resident Info","Review & Decision"]){
 assert(p.includes(v),"Missing detail tab "+v);
}
assert(p.includes("submissionDateLabel(request.createdAt)") &&
 p.includes("SUBMITTED")&&p.includes("pageSize={5}"),
 "Queue should match 5-page table reference with submitted date");
assert(p.includes('function DecisionTab({')&&p.includes('onReviewChange("riskFlags"')&&
 p.includes('onReviewChange("siteVisitStatus","completed")')&&
 p.includes('onReviewChange("videoVerificationStatus","completed")'),
 "Protected risk/site/video verification must remain");
assert(p.includes('onContinueDonation={saveAndContinueDonation}')&&
 p.includes('function EvidenceTab({')&&p.includes('function ResidentReviewTab({'),
 "Backend route and private documents/resident review must remain available");
assert(d.includes("privacySafeResidentDraft")&&d.includes("residentStoryPrivacyReviewed"),
 "Public campaign resident story privacy confirmation must remain");
console.log("PASS: exact-reference compact Request/Resident cards, full-page scroll, green tabs, table, and preserved workflow security");
