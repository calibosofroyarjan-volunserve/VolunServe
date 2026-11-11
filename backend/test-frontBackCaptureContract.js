"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const screen = fs.readFileSync("app/identity-verification.web.tsx","utf8");
const native = fs.readFileSync("app/identity-verification.tsx","utf8");
const helper = fs.readFileSync("lib/identityVerification.ts","utf8");
const server = fs.readFileSync("backend/server.js","utf8");

test("web, native, and backend require two ID sides except passport",()=>{
 assert.match(screen,/idType !== "passport" && !idBackDocument/);
 assert.match(screen,/idBackDocument: idType === "passport" \? null : idBackDocument/);
 assert.match(native,/idType !== "passport" && !idBackDocument/);
 assert.match(helper,/idBackDocument/);
 // Node forwards multipart bytes unchanged; the Python AI applies the back-side requirement.
 assert.match(server,/body: request\.body/);
 assert.match(server,/const aiResult = await callIdentityAiService\(request\)/);
});
test("webfront and back photos use separate camera captures and cannot silently reuse front",()=>{
 assert.match(screen,/setIdCameraSide\(side\)/);
 assert.match(screen,/setIdBackDocument\(media\)/);
 assert.match(screen,/Open Camera — \{label\}/);
 assert.match(screen,/idBackDocument=\{idBackDocument\}/);
 assert.match(screen,/onPickBack=\{\(\) => chooseIdDocument\("back"\)\}/);
});
test("user still explicitly submits identity photos with consent",()=>{
 assert.match(screen,/await checkIdentityEngineReady\(\)/);
 assert.match(screen,/await submitIdentityVerification\(/);
 assert.match(screen,/if \(!consent\)/);
 assert.doesNotMatch(screen,/setIdentityVerified\(true\)/);
});

test("camera permission guidance is valid on a deployed website",()=>{
 assert.match(screen,/Allow camera access for this website/);
 assert.doesNotMatch(screen,/Allow camera access for localhost/);
});

test("web ID quality assist preserves separate front/back captures and a manual fallback",()=>{
 assert.match(screen,/idAutoFramesRef/);
 assert.match(screen,/brightness >= 55 && brightness <= 210/);
 assert.match(screen,/edges \/ count >= 0\.12/);
 assert.match(screen,/if \(heldFor >= 1300\) void captureIdDocument\(\)/);
 assert.match(screen,/Capture manually: \{label\}/);
 assert.match(screen,/setIdCameraSide\(side\)/);
 assert.match(screen,/idCameraOpen \|\| !idCameraReady/);
});

test("randomized camera-movement prompt is not accepted as verified liveness",()=>{
 assert.match(screen,/Math\.random\(\) < 0\.5 \? "left" : "right"/);
 assert.match(screen,/movement\.stage === "center"/);
 assert.match(screen,/movement\.stage === "move"/);
 assert.match(screen,/movement\.stage === "return"/);
 assert.match(screen,/movement\.stage = "complete"/);
 assert.match(screen,/movementRef\.current\.stage !== "complete"/);
 assert.match(screen,/Movement prompt completed \(not proof of liveness\)/);
 assert.match(screen,/Never treat this as validated liveness/);
 assert.match(helper,/livenessVerified: false/);
 assert.match(helper,/manualReviewRequired: true/);
 assert.doesNotMatch(screen,/setIdentityVerified\(true\)/);
});

test("staging identity rejects production Firebase user tokens before contacting backend",()=>{
 assert.match(helper,/EXPO_PUBLIC_VOLUNSERVE_ENV === "staging"/);
 assert.match(helper,/auth\.app\.options\.projectId === "volunserve-3aa5b"/);
 assert.match(helper,/Staging identity verification is blocked/);
 assert.match(helper,/async function getAuthenticatedUser\(\)/);
 assert.match(helper,/Staging verification cannot use the production identity endpoint/);
});

test("all staging Firebase modules fail closed against production project",()=>{
 const firebaseSource = fs.readFileSync("lib/firebase.ts", "utf8");
 assert.match(firebaseSource,/EXPO_PUBLIC_VOLUNSERVE_ENV === "staging"/);
 assert.match(firebaseSource,/Object\.values\(stagingConfig\)\.some\(\(value\) => !value\)/);
 assert.match(firebaseSource,/stagingConfig\.projectId === productionConfig\.projectId/);
 assert.match(firebaseSource,/stagingConfig\.authDomain !==/);
 assert.match(firebaseSource,/stagingConfig\.storageBucket\.startsWith/);
 assert.match(firebaseSource,/usingStagingFirebase\s*\? stagingConfig\s*:\s*productionConfig/);
 assert.match(firebaseSource,/const app = existingApp \|\| initializeApp\(firebaseConfig\)/);
});

test("browser selfie blob is released when the selfie changes or page unmounts",()=>{
 assert.match(screen,/const uri = selfie\?\.uri;/);
 assert.match(screen,/\[selfie\?\.uri\]/);
 assert.match(screen,/URL\.revokeObjectURL\(uri\)/);
 assert.match(screen,/\[idDocument\?\.uri\]/);
 assert.match(screen,/\[idBackDocument\?\.uri\]/);
});


test("signup retains validated DOB and Firestore only accepts canonical date",()=>{
 const signup = fs.readFileSync("app/signup.tsx","utf8");
 const emailSignup = fs.readFileSync("components/auth/EmailFirstSignup.tsx","utf8");
 const auth = fs.readFileSync("lib/firebaseAuth.ts","utf8");
 const rules = fs.readFileSync("firestore.rules","utf8");
 assert.match(signup,/dateOfBirth:\s*formData\.dateOfBirth/);
 assert.match(emailSignup,/dateOfBirth:\s*birth/);
 assert.match(auth,/dateOfBirth\?: string/);
 assert.match(auth,/\.\.\.\(birthDate \? \{ dateOfBirth: birthDate \} : \{\}\)/);
 assert.match(rules,/request\.resource\.data\.dateOfBirth\.matches/);
 // The existing owner profile-update allowlist must not include dateOfBirth.
 const updateRules = rules.slice(rules.indexOf("allow update: if signedIn()",rules.indexOf("match \/users/{uid}")));
 assert.match(updateRules,/affectedKeys\(\)\.hasOnly/);
 assert.doesNotMatch(updateRules.split("affectedKeys()")[1].split("])")[0],/'dateOfBirth'/);
});

test("identity AI gets profile DOB and barangay only from trusted Firestore, not uploaded form",()=>{
 const ai = fs.readFileSync("lib/identityVerification.ts","utf8");
 assert.match(server,/dateOfBirth: profile\.dateOfBirth \|\| ""/);
 assert.match(server,/barangay: profile\.barangay \|\| ""/);
 assert.match(server,/X-VolunServe-Profile-Date-Of-Birth/);
 assert.match(server,/X-VolunServe-Profile-Barangay/);
 assert.match(server,/issuerAuthenticityStatus: "not_verified"/);
 assert.match(server,/presentationAttackStatus: "not_validated"/);
 assert.match(ai,/profileBirthDateCheck/);
 assert.match(ai,/profileAddressCheck/);
 assert.doesNotMatch(ai,/formData\.append\(["'](?:dateOfBirth|barangay)/);
});


test("web and native require consented document OCR precheck before opening selfie",()=>{
 assert.match(screen,/await precheckIdentityDocument\(/);
 assert.match(native,/await precheckIdentityDocument\(/);
 assert.match(screen,/if \(result\.outcome === "retry"\) return;/);
 assert.match(native,/if \(result\.outcome === "retry"\) return;/);
 assert.match(screen,/if \(!documentConsent\)/);
 assert.match(native,/if \(!documentConsent\)/);
 assert.match(screen,/documentPrecheckRevisionRef\.current \+= 1/);
 assert.match(native,/documentPrecheckRevisionRef\.current\+\+/);
 assert.match(helper,/X-VolunServe-Document-Precheck-Consent/);
 assert.match(helper,/\/api\/identity\/document\/precheck/);
 assert.match(screen,/No selfie is uploaded at this stage/);
});

test("Node uses protected, bounded, no-photo-storage document-only route",()=>{
 const routeIndex=server.indexOf('"/api/identity/document/precheck"');
 assert.ok(routeIndex > 0);
 const slice=server.slice(routeIndex,server.indexOf('"/api/identity/status"',routeIndex));
 assert.match(slice,/requireFirebaseUser/);
 assert.match(slice,/x-volunserve-document-precheck-consent/);
 assert.match(slice,/documentPrecheck: true/);
 assert.match(slice,/IDENTITY_DOC_PRECHECK_DAILY_LIMIT/);
 assert.match(slice,/identityDocumentPrecheckThrottle/);
 assert.match(slice,/selectedIdRecognized\(screening\)/);
 assert.match(slice,/blurryNationalIdNeedsReview\(screening\)/);
 assert.doesNotMatch(slice,/aiAttemptCount:|identityVerificationAttempts|\.save\(|\.upload\(/);
 assert.match(server,/options\.documentPrecheck/);
});
