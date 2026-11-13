"use strict";
/** Synthetic, no-deploy contract for REAL Expo Admin screen + Node ID policy.
 * No accounts, ID media, Firebase, passwords, URLs, or browser requests.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { selectedIdRecognized } = require("./selectedIdPolicy");

const src = fs.readFileSync("lib/identityAdminReviewGate.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0, "Gate should transpile cleanly");
const moduleMock = {exports:{}};
vm.runInNewContext(compiled.outputText, {
  exports:moduleMock.exports, module:moduleMock,
  require:()=>{throw new Error("The pure UI guard must have no runtime imports");},
}, {filename:"identityAdminReviewGate.transpiled.js"});
const {adminReviewDocumentEligible, adminReviewMethodEligible, adminReviewStatusBucket} = moduleMock.exports;

const base = Object.freeze({
 declaredIdType:"national_id",
 detectedIdType:"national_id",
 status:"text_consistent_unverified",
 warningCodes:[],
 imageQualityStatus:"adequate",
 backImageQualityStatus:"adequate",
 backSideProvided:true,backSideScreened:true,
 profileBirthDateCheck:"possible_match",
 profileAddressCheck:"possible_match",
 profileNameCheck:"possible_match",
});

test("every supported recognized, legible no-warning ID is eligible for *manual* Admin UI review",()=>{
 for(const id of ["national_id","drivers_license","passport","umid","prc_id"]){
   const data={...base,declaredIdType:id,detectedIdType:id};
   if(id==="passport"){
     data.backSideProvided=false;
     data.backSideScreened=false;
     data.backImageQualityStatus="not_required";
     data.passportMrzCheck="checksum_consistent_unverified";
   }
   assert.equal(selectedIdRecognized(data),true,id+" server policy");
   assert.equal(adminReviewDocumentEligible(data),true,id+" Expo UI");
 }
});
test("ID-appropriate Admin validation methods match backend issuer review policy",()=>{
 const {reviewIssuerEvidence}=require("./identityIssuerReviewPolicy");
 for(const id of ["national_id","drivers_license","passport","umid","prc_id"]){
   const validMethods=id==="national_id" ? ["psa_national_id_qr_check"] :
       ["in_person_lgu_validation","official_document_check"];
   for(const method of [
     "psa_national_id_qr_check","in_person_lgu_validation",
     "official_document_check","unsupported",""
   ]){
     const screen={...base,declaredIdType:id,detectedIdType:id};
     const expected=validMethods.includes(method);
     assert.equal(adminReviewMethodEligible(screen,method),expected,id+":"+method);
     assert.equal(reviewIssuerEvidence({
       declaredType:id,validationMethod:method,
       confirmed:true,notes:"Synthetic independent validation for test only.",
     }).ok,expected,id+":"+method+" Node policy");
   }
 }
 assert.equal(adminReviewMethodEligible(null,"official_document_check"),false);
 assert.equal(adminReviewMethodEligible({...base,declaredIdType:"school_id"},"official_document_check"),false);
});
test("unsupported, school or declared/detected mismatch can never enable client Verify",()=>{
 for(const candidate of [
   {...base,declaredIdType:"school_id",detectedIdType:"school_id"},
   {...base,detectedIdType:"school_id"},
   {...base,detectedIdType:"passport"},
   {...base,declaredIdType:null},
   {...base,status:"mismatch"},
   {...base,status:"inconclusive"},
 ]){
   assert.equal(adminReviewDocumentEligible(candidate),false,JSON.stringify(candidate));
 }
});
test("blurred, unknown, unmeasured, wrong or incomplete reverse evidence blocks Verify",()=>{
 for(const field of ["imageQualityStatus","backImageQualityStatus"]){
   for(const val of ["low","unknown","not_checked",null,undefined]){
     const data={...base,[field]:val};
     assert.equal(adminReviewDocumentEligible(data),false,
       field+"="+String(val));
   }
 }
 for(const pair of [{backSideProvided:false},{backSideScreened:false}]){
   assert.equal(adminReviewDocumentEligible({...base,...pair}),false);
 }
});
test("any warning disqualifies, even when AI status reports text consistent",()=>{
 for(const code of [
  "document_front_back_swapped","document_back_evidence_inconclusive",
  "document_back_layout_inconclusive","low_document_back_image_quality",
  "school_id_not_supported","document_type_not_recognized",
 ]){
   const data={...base,warningCodes:[code]};
   assert.equal(adminReviewDocumentEligible(data),false,code);
   assert.equal(selectedIdRecognized(data),false,code+" server policy");
 }
 assert.equal(adminReviewDocumentEligible({...base,warningCodes:undefined}),false);
});
test("DOB and passport MRZ contradictions prevent UI eligibility",()=>{
 for(const fields of [
  {profileBirthDateCheck:"possible_conflict"},
  {passportMrzBirthDateCheck:"possible_conflict"},
  {passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
  {passportMrzCheck:"multiple_candidates"},
 ]){
  const data={...base,...fields};
  assert.equal(adminReviewDocumentEligible(data),false);
  assert.equal(selectedIdRecognized(data),false);
 }
});
test("Admin queue never treats stale AI/review text as a Verified Resident",()=>{
 assert.equal(adminReviewStatusBucket({
  status:"pending",identityVerified:true,requiresManualReview:true,targetEligible:true
 }),"verified");
 for(const row of [
   {status:"pending",identityStatus:"verified",requiresManualReview:true,targetEligible:true},
   {status:"pending",manualReviewDecision:"verified",requiresManualReview:true,targetEligible:true},
   {status:"verified",identityVerified:false,requiresManualReview:false,targetEligible:true},
   {status:"pending",identityVerified:false,requiresManualReview:true,targetEligible:false},
   {status:"pending",identityVerified:false,requiresManualReview:true},
   {status:"failed",identityVerified:false,requiresManualReview:true,targetEligible:true},
   {status:"pending",manualReviewDecision:"retry_required",requiresManualReview:true,targetEligible:true},
 ]) {
   assert.equal(adminReviewStatusBucket(row),"all",JSON.stringify(row));
 }
 assert.equal(adminReviewStatusBucket({
  status:"failed",manualReviewDecision:"retry_required",requiresManualReview:false,targetEligible:true
 }),"retry_required");
 assert.equal(adminReviewStatusBucket({
  status:"pending",requiresManualReview:true,targetEligible:true
 }),"pending");
});
test("real Expo Admin component uses the pure gate in button AND submission path",()=>{
 const admin = fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
 assert.match(admin,/import\s*\{[^}]*adminReviewDocumentEligible,[\s\S]*?adminReviewStatusBucket[^}]*\}/);
 assert.match(admin,/function reviewBucket\(item: IdentityReview\): ReviewFilter \{\s*return adminReviewStatusBucket\(item\)/);
 assert.match(admin,/!adminReviewDocumentEligible\(selected\.documentScreening\)/);
 assert.match(admin,/const documentEligible = adminReviewDocumentEligible\(item\.documentScreening\)/);
 assert.match(admin,/const canVerify = pending && item\.targetEligible === true && documentEligible/);
 assert(admin.includes("adminReviewMethodEligible(item.documentScreening, validationMethod)"));
 assert(admin.includes("selected.documentScreening, validationMethod,"));
 assert.match(admin,/reviewBucket\(selected\) !== "pending"/);
 assert.match(admin,/selected\.targetEligible !== true/);
 assert.match(admin,/Require Retry/);
});

// Runtime destination assertions operate on the REAL shared Expo helper,
// transpiled to Node for deterministic no-network testing.
const targetSrc=fs.readFileSync("lib/identityEnvironmentTarget.ts","utf8");
const targetCompiled=ts.transpileModule(targetSrc,{
  compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
  reportDiagnostics:true,
});
assert.equal(targetCompiled.diagnostics?.length || 0,0);
const targetModule={exports:{}};
vm.runInNewContext(targetCompiled.outputText,{
  exports:targetModule.exports,module:targetModule,
  require:()=>{throw new Error("No imports allowed in target resolution");},
},{filename:"identityEnvironmentTarget.transpiled.js"});
const {identityEnvironmentTarget,identityAdminApiBaseUrl}=targetModule.exports;
const fullStaging={
  runtimeEnv:"staging",firebaseTarget:"staging",
  projectId:"volunserve-full-staging",
};
const realProduction={
  runtimeEnv:"production",firebaseTarget:"production",
  projectId:"volunserve-3aa5b",
};

test("staging Admin and Resident requests route to isolated Node only",()=>{
  assert.equal(identityEnvironmentTarget(fullStaging),"staging");
  assert.equal(identityAdminApiBaseUrl(fullStaging),
    "https://volunserve-backend-staging.onrender.com");
  // Missing optional runtime label must not fall back to the live backend
  // when the configured Firebase project is full-staging.
  assert.equal(identityEnvironmentTarget({
    firebaseTarget:"staging",projectId:"volunserve-full-staging",
  }),"staging");
});
test("production identity target routes ONLY matching production Firebase",()=>{
  assert.equal(identityEnvironmentTarget(realProduction),"production");
  assert.equal(identityAdminApiBaseUrl(realProduction),"https://volunserve.onrender.com");
  assert.equal(identityAdminApiBaseUrl({
    firebaseTarget:"production",projectId:"volunserve-3aa5b",
  }),"https://volunserve.onrender.com");
});
test("cross-environment or incomplete identity configurations fail closed",()=>{
  for(const bad of [
    {runtimeEnv:"staging",firebaseTarget:"production",projectId:"volunserve-3aa5b"},
    {runtimeEnv:"staging",firebaseTarget:"production",projectId:"volunserve-full-staging"},
    {runtimeEnv:"staging",firebaseTarget:"staging",projectId:"volunserve-3aa5b"},
    {runtimeEnv:"production",firebaseTarget:"staging",projectId:"volunserve-full-staging"},
    {runtimeEnv:"production",firebaseTarget:"production",projectId:"volunserve-full-staging"},
    {runtimeEnv:"production",firebaseTarget:"staging",projectId:"volunserve-3aa5b"},
    {runtimeEnv:"staging",firebaseTarget:"staging",projectId:"volunserve-auth-staging"},
    {runtimeEnv:"staging",firebaseTarget:"staging",projectId:""},
    {runtimeEnv:"production",firebaseTarget:"production",projectId:""},
    {runtimeEnv:"testing",firebaseTarget:"production",projectId:"volunserve-3aa5b"},
    {runtimeEnv:"production",firebaseTarget:"unknown",projectId:"volunserve-3aa5b"},
    {},
  ]) {
    assert.throws(()=>identityAdminApiBaseUrl(bad),/identity|target|environment/i,
      JSON.stringify(bad));
  }
});
test("real Expo Resident and Admin identity network paths both validate target",()=>{
  const admin=fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
  const resident=fs.readFileSync("lib/identityVerification.ts","utf8");
  assert.match(admin,/identityAdminApiBaseUrl/);
  assert.match(admin,/projectId:\s*auth\.app\.options\.projectId/);
  assert.doesNotMatch(admin,/const BACKEND_URL =/);
  const adminGet=admin.slice(admin.indexOf("const loadReviews = async"),admin.indexOf("  useEffect(() => {",admin.indexOf("const loadReviews = async")));
  assert.match(adminGet,/getReviewBackendUrl\(\);[\s\S]*user\.getIdToken\(true\)/);
  assert.match(adminGet,/\$\{backendUrl\}\/api\/admin\/identity\/reviews/);
  const adminPost=admin.slice(admin.indexOf("const saveDecision = async"),admin.indexOf("  if (sessionLoading)",admin.indexOf("const saveDecision = async")));
  assert.match(adminPost,/getReviewBackendUrl\(\);[\s\S]*user\.getIdToken\(true\)/);
  assert.match(adminPost,/\$\{backendUrl\}\/api\/admin\/identity\/reviews/);
  assert.match(resident,/const staging = identityEnvironmentTarget\(/);
  assert.match(resident,/async function getAuthenticatedUser\(\)\s*\{[\s\S]*identityEnvironmentTarget\(/);
});

test("transactional Node permission gate and disabled media uploads remain authoritative",()=>{
 const server=fs.readFileSync("backend/server.js","utf8");
 assert.match(server,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;/);
 assert.match(server,/identity_review_target_not_eligible/);
 assert.match(server,/targetEligible: userSnapshot\?\.exists === true/);
 assert.match(server,/self_identity_review_forbidden/);
 assert.match(server,/issuerReviewAttested/);
 const adminRoute=server.slice(server.indexOf('"/api/admin/identity/reviews/:uid/decision"'),
    server.indexOf('"/api/admin/assistance/requests/:requestId/start-review"'));
 assert.match(adminRoute,/requireFirebaseUser/);
 assert.match(adminRoute,/requireOperationalAdmin/);
 assert.match(adminRoute,/db\.runTransaction/);
 assert.match(adminRoute,/identityVerified:\s*true/);
 assert.match(adminRoute,/adminActivityLogs/);
});

test("Hybrid Admin Rejected filter only displays final non-verified submissions",()=>{
 assert.equal(adminReviewStatusBucket({
  status:"failed",manualReviewDecision:"rejected",
  requiresManualReview:false,identityVerified:false,targetEligible:true,
 }),"rejected");
 assert.equal(adminReviewStatusBucket({
  status:"pending",manualReviewDecision:"rejected",
  requiresManualReview:true,identityVerified:false,targetEligible:true,
 }),"all");
 assert.equal(adminReviewStatusBucket({
  status:"pending",manualReviewDecision:"rejected",
  requiresManualReview:false,identityVerified:true,targetEligible:true,
 }),"verified");
});
test("staging web Admin and Resident show distinct Reject without relaxing Verify authority",()=>{
 const admin=fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
 const web=fs.readFileSync("app/identity-verification.web.tsx","utf8");
 const native=fs.readFileSync("app/identity-verification.tsx","utf8");
 assert.match(admin,/onReject=\{\(\) => void saveDecision\("reject"\)\}/);
 assert(admin.includes("Reject Submission"));
 assert(admin.includes("Inconclusive — preliminary similarity only (not calibrated)"));
 assert(admin.includes("Not validated — independent verification required"));
 assert(admin.includes('selected.targetEligible !== true'));
 assert(admin.includes('!issuerReviewAttested'));
 assert(admin.includes('!adminReviewDocumentEligible(selected.documentScreening)'));
 assert(web.includes('statusResult?.decision === "rejected"'));
 assert(web.includes("Rejected · Not Verified"));
 assert(web.includes("Identity Submission Rejected"));
 assert(native.includes('statusResult?.decision === "rejected"'));
 assert(native.includes("You are not Verified"));
 const gate=fs.readFileSync("lib/identityAdminReviewGate.ts","utf8");
 assert(gate.includes('row.manualReviewDecision === "rejected"'));
});
