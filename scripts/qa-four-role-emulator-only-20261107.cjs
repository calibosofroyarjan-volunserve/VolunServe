"use strict";

/**
 * Firestore/Auth Emulator-only integration smoke tests.
 * Not an authenticated UI E2E test and not connected to any cloud account.
 * Must run via: firebase emulators:exec --only auth,firestore --project demo-volunserve
 */
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");

const requiredFirestore = "127.0.0.1:8080";
const requiredAuth = "127.0.0.1:9099";
const hostFirestore = process.env.FIRESTORE_EMULATOR_HOST || "";
const hostAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const project = process.env.VOLUNSERVE_EMULATOR_PROJECT || "";
assert.equal(hostFirestore, requiredFirestore,
  "STOP: Firestore must be 127.0.0.1:8080 emulator; never use live Firestore");
assert.equal(hostAuth, requiredAuth,
  "STOP: Auth must be 127.0.0.1:9099 emulator; never use live Auth");
assert.equal(project, "demo-volunserve", "STOP: only the local demo Firebase project is allowed");
assert.equal(process.env.CI, "true", "STOP: run only in isolated GitHub CI");
for (const k of [
  "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN",
  "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_SERVICE_ACCOUNT_JSON",
  "PAYMONGO_SECRET_KEY", "PAYMONGO_WEBHOOK_SECRET",
  "CLOUDINARY_API_SECRET",
]) assert.ok(!process.env[k], "STOP: forbidden cloud credential in emulator test: " + k);
for (const k of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID"]) {
  const v = process.env[k] || "";
  assert.ok(!v || v.startsWith("demo-"),
    "STOP: non-demo cloud project present in environment: " + k);
}
assert.ok(!Object.values(process.env).some(v=>
  typeof v === "string" && /^https:\/\/volunserve\.onrender\.com\/?$/.test(v)),
  "STOP: detected production Render URL as an environment setting");

const suite = [
  ["LGU Admin permissions", "scripts/test-lgu-admin-rules.cjs"],
  ["Admin / Volunteer assignments", "scripts/test-admin-volunteer-firestore.cjs"],
  ["Community events & attendance", "scripts/test-community-events-rules.cjs"],
  ["Donation receipt role privacy", "scripts/test-donation-lgu-role-isolation.cjs"],
  ["Emergency and evacuation map rules", "scripts/test-live-emergency-map-rules.cjs"],
  ["Admin community announcements", "scripts/test-pavia-admin-announcement-emulator.cjs"],
];

const fail = [];

async function authSmokeTest() {
  const root = "http://" + requiredAuth + "/identitytoolkit.googleapis.com/v1/accounts:";
  const key = "?key=emulator-only-test-key";
  const email = "staging-qa-" + Date.now() + "@example.test";
  const password = "Synthetic-Testing-Password-123!";
  async function request(method, fields) {
    const response = await fetch(root + method + key, {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify(fields), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    return {status: response.status, data};
  }
  const created = await request("signUp", {email, password, returnSecureToken: true});
  assert.equal(created.status, 200, "Emulator must allow synthetic email signup");
  assert.ok(created.data.localId && created.data.idToken, "Missing local synthetic identity");
  const lookup = await request("lookup", {idToken: created.data.idToken});
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.users?.[0]?.emailVerified, false,
    "Email verification must not be granted automatically");
  const wrong = await request("signInWithPassword", {
    email, password: "definitely-wrong", returnSecureToken: true,
  });
  assert.equal(wrong.status, 400, "Wrong password must be rejected");
  const duplicate = await request("signUp", {email, password, returnSecureToken: true});
  assert.equal(duplicate.status, 400, "Duplicate synthetic signup must be rejected");
  const signedIn = await request("signInWithPassword", {
    email, password, returnSecureToken: true,
  });
  assert.equal(signedIn.status, 200, "Synthetic email/password login failed");
  assert.equal(signedIn.data.localId, created.data.localId);
  const reset = await request("sendOobCode", {requestType: "PASSWORD_RESET", email});
  assert.equal(reset.status, 200, "Emulator-only password reset request failed");
  console.log("PASS Auth EMULATOR: signup, unverified default, bad-password rejection, duplicate rejection, login, password reset request");
}

(async () => {
  console.log("LOCAL EMULATORS ONLY: " + project +
    " | Firestore " + hostFirestore + " | Auth " + hostAuth);
  try { await authSmokeTest(); }
  catch (error) { fail.push("Auth emulator smoke: " + error.message); console.error("FAIL Auth emulator", error.message); }

  for (const [label, script] of suite) {
    console.log("\nBEGIN local-only Firestore suite:",label);
    const result = spawnSync(process.execPath, [script], {
      stdio: "inherit", encoding: "utf8", timeout: 120000,
      env: {...process.env},
    });
    if (result.error || result.status !== 0) {
      fail.push(label + " (exit " + result.status + ")");
      console.error("FAIL:", label, result.error?.message || "status " + result.status);
    } else console.log("PASS local-only suite:",label);
  }
  console.log("\nLocal-only checks:", suite.length + 1 - fail.length,
    "passed;", fail.length, "failed.");
  if (fail.length) {
    for (const v of fail) console.error("QA BLOCKER:", v);
    process.exitCode = 1;
  } else {
    console.log("ALL EMULATOR CHECKS PASS. Real hosted staging, real UI clicks, PayMongo and uploads STILL UNTESTED.");
  }
})().catch(e => {console.error("EMULATOR QA FATAL", e);process.exitCode = 1;});
