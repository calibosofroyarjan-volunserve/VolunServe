const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const source = p => fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const app=source("app/admin-request.tsx");
const review=source("app/(superadmin)/admin-accounts.tsx");
const panel=source("components/admin/LguApplicantEvidencePanel.tsx");
const policy=source("lib/lguStaffApplicationPolicy.ts");
const firestore=source("firestore.rules");
const storage=source("storage.rules");
const config=JSON.parse(source("firebase.json"));
assert(config.emulators?.storage?.port===9199,"Local Storage emulator must be configured");
for(const value of ["ph_national_id","ph_drivers_license","ph_passport"]) {
  assert(policy.includes(value),"Government ID allowlist missing "+value);
  assert(firestore.includes(value),"Firestore government ID allowlist missing "+value);
}
for(const value of ["school_id","company_id","other_government_id"]) {
  assert(!policy.includes('value: "'+value+'"'),"Unsupported applicant ID is offered "+value);
}
assert(policy.includes('lguIdRequiresBack'),"Document back-side policy missing");
for(const token of ["front","back","selfie","lgu_proof"]) {
  assert(app.includes('"'+token+'"'),"Applicant evidence field missing "+token);
}
for(const token of ["Live face capture","LGU employment confirmation","STEP ","OF 5",
"Submit for independent review","connectStorageEmulator","getStorage(app)"]) {
  assert(app.includes(token),"Intake UI or secure emulator flow missing "+token);
}
assert(app.includes('role:"applicant",status:"pending_review"') &&
  app.includes('residentAccess:false,volunteerAccess:false') &&
  app.includes('aiStatus:"not_run"') &&
  app.includes('officialOfficeStatus:"unconfirmed"'),
  "No privileged role or fake AI decision at applicant creation");
assert(app.includes('autoComplete={options?.off?"off"') &&
  app.includes('importantForAutofill={options?.off?"no"'),
  "Appointment reference must resist email/password autofill");
assert(app.includes('front:undefined,back:undefined') &&
  app.includes('meta.customMetadata?.idType!==declaredIdType') &&
  app.includes('idType:declaredIdType') &&
  panel.includes('meta.customMetadata?.idType!==item.idType') &&
  storage.includes("request.resource.metadata.idType in ["),
  "Changing ID type or resuming uploads must never silently mix ID types");
assert(app.includes('requestCameraPermissionsAsync') &&
  app.includes('launchCameraAsync'),"Live camera capture must be available");
assert(app.includes('Upload')===false || app.includes('uploadBytes'),
  "No pretend uploads without restricted Storage writes");
assert(storage.includes("lguEvidenceIntakeReleased()") &&
  storage.includes("lguIdentityIntake/release") &&
  firestore.includes("allow create: if lguEvidenceIntakeReleased() && validIntake();") &&
  firestore.includes("match /lguIdentityIntake/{configId}") &&
  firestore.includes("allow read, write: if false;"),
  "Sensitive intake must be server-gated in both rules; client flags alone are bypassable");
assert(storage.includes("match /lguStaffEvidence/{uid}/{filename}") &&
  storage.includes("profile().role == 'applicant'") &&
  storage.includes("isSuperAdmin()") &&
  storage.includes("allow update, delete: if false;"),
  "Storage rules must enforce private restricted evidence");
assert(firestore.includes("match /lguApplicantEvidence/{uid}") &&
  firestore.includes("allow create: if lguEvidenceIntakeReleased() && validIntake()") &&
  firestore.includes("data.reviewStatus == 'pending_manual_review'") &&
  firestore.includes("data.aiStatus == 'not_run'"),
  "Firestore record must be immutable with manual review and not-run AI");
assert(review.includes("applicantPageCount") &&
  review.includes("pagedLguApplications") &&
  review.includes("setApplicantPage") &&
  review.includes('const ADMIN_PAGE_SIZE = 5'),
  "Super Admin lists must paginate staff applications in batches of five");
assert(review.includes("LguApplicantEvidencePanel") &&
  review.includes("lguEmploymentConfirmed && evidenceReady"),
  "Super Admin promotion must require protected evidence access AND independent LGU confirmation");
assert(panel.includes("onLoad={()=>setDecodedImages(") &&
  panel.includes("onError={()") &&
  panel.includes("images.every(item=>decodedImages.includes(item.path))") &&
  panel.includes("onReady(previewsDecoded)") &&
  !panel.includes("onReady(true)"),
  "Super Admin role promotion must wait for all private image previews to decode; broken media fails closed");
assert(panel.includes("getMetadata(reference)") &&
  panel.includes("getBlob(reference)") &&
  panel.includes("URL.revokeObjectURL(url)") &&
  panel.includes("onReady(false)") &&
  !panel.includes("getDownloadURL("),
  "Private evidence viewer must avoid public bearer URLs and fail closed");
assert(app.includes("signInWithEmailAndPassword(candidateAuth,email,form.password)") &&
  app.includes('profile?.role!=="applicant"') &&
  app.includes('profile?.status!=="pending_review"') &&
  app.includes('getDoc(doc(candidateDb,"lguApplicantEvidence",uid))'),
  "A failed upload must resume ONLY for its authenticated pending applicant, never overwrite an existing user's profile");
assert(app.includes('getMetadata(storageRef(storage,priorPath))') &&
  app.includes('e?.code!=="storage/object-not-found"') &&
  app.includes('return priorPath;') &&
  app.includes('newlyCreated && !profileCreated'),
  "Immutable private Storage uploads require fail-closed idempotent retries without deleting pre-existing accounts");
assert(app.includes('const emulatorRequested = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true"') &&
  app.includes('(!emulatorRequested &&') &&
  app.includes('emulatorRequested && !usingFirebaseEmulators') &&
  app.includes('Mobile test devices must never upload synthetic IDs to the production Firebase project.'),
  "Android/native emulator mode MUST fail closed instead of uploading government ID photos to production");
console.log("PASS LGU government ID intake, 5-step wizard, private data rules, 5-item queue and promotion evidence gate");
