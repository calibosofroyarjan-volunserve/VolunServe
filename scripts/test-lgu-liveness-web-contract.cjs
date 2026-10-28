"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const liveness=read("backend/lguStaffLiveness.js");
const client=read("backend/liveness-web/src/main.jsx");
const backend=read("backend/server.js");
const web=JSON.parse(read("backend/liveness-web/package.json"));
const node=JSON.parse(read("backend/package.json"));
const app=read("app/admin-request.tsx");
const panel=read("components/admin/LguApplicantEvidencePanel.tsx");
const rules=read("firestore.rules");
test("Real AWS Amplify camera streaming rather than fake selfie-liveness",()=>{
  assert(client.includes("FaceLivenessDetectorCore"));
  assert(client.includes("onAnalysisComplete={checkResult}"));
  assert(client.includes("config={{credentialProvider}}"));
  assert(client.includes('"/api/lgu-staff/liveness/credentials"'));
  assert(client.includes('"/api/lgu-staff/liveness/start"'));
  assert(client.includes('"/api/lgu-staff/liveness/result"'));
  assert(!client.includes("matchScore"));
  assert(!client.includes("livenessScore"));
  assert(!client.includes("confidence"));
  assert(web.dependencies["@aws-amplify/ui-react-liveness"]);
  assert(web.dependencies["aws-amplify"]);
  assert(web.scripts.build==="vite build");
});
test("Temporary browser streaming credentials are server-only and least-scoped",()=>{
  for(const term of [
    "AssumeRoleCommand","DurationSeconds:900",
    'rekognition:StartFaceLivenessSession',
    'LGU_STAFF_LIVENESS_STREAM_ROLE_ARN',
    'verifyApplicant(req)',
    'liveness_session_mismatch',
    'credentialsFactory=temporaryStreamingCredentials',
  ])assert(liveness.includes(term),"Missing "+term);
  assert(node.dependencies["@aws-sdk/client-sts"]);
  assert(!client.includes("AWS_SECRET_ACCESS_KEY"));
  assert(!client.includes("AWS_ACCESS_KEY_ID"));
  assert(!client.includes("RoleArn"));
});
test("Liveness result checks withdrawal inside the Firestore transaction",()=>{
  assert(liveness.includes('tx.get(privacyRef)'));
  assert(liveness.includes('tx.get(userRef)'));
  assert(liveness.includes('gate.data()?.enabled!==true'));
  assert(liveness.includes('identityDecision:"manual_review_required"'));
  assert(liveness.includes('adminAccessGranted:false'));
  assert(rules.includes("match /lguApplicantLivenessSessions/{uid}"));
  assert(rules.includes("allow read, write: if false;"));
});
test("Protected React camera challenge is not publicly deployed by default",()=>{
  assert(backend.includes('app.use("/lgu-face-check"'));
  assert(backend.includes('LGU_STAFF_ACTIVE_LIVENESS_ENABLED!=="true"'));
  assert(app.includes('EXPO_PUBLIC_LGU_STAFF_ACTIVE_LIVENESS_ENABLED==="true"'));
  assert(app.includes('https://volunserve.onrender.com/lgu-face-check/'));
  assert(backend.includes('X-Frame-Options'));
});

test("Super Admin sees only private, nonnumeric AWS presence status",()=>{
  assert(liveness.includes('"/api/lgu-staff/liveness/reviewer-status"'));
  assert(liveness.includes('reviewer.role!=="superadmin"'));
  assert(liveness.includes('state.state==="completed"'));
  assert(panel.includes("Review live camera check"));
  assert(panel.includes("/api/lgu-staff/liveness/reviewer-status"));
  assert(panel.includes("Live camera presence check completed"));
  assert(!panel.includes("livenessScore"));
  assert(!panel.includes("livenessConfidence"));
});
