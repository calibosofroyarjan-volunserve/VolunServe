"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const {test} = require("node:test");
const read = path => fs.readFileSync(path, "utf8");
const web = read("app/identity-verification.web.tsx");
const native = read("app/identity-verification.tsx");
const client = read("lib/identityVerification.ts");
const backend = read("backend/server.js");
const py = read("identity-ai/main.py");
const signup = read("app/signup.tsx");
const email = read("components/auth/EmailFirstSignup.tsx");
const auth = read("lib/firebaseAuth.ts");
const rules = read("firestore.rules");

test("UI and API client agree on five supported government IDs",()=>{
  for(const id of ["national_id","drivers_license","passport","umid","prc_id"]){
    for(const code of [web,native,client])assert(code.includes(id), "missing "+id);
  }
  assert(!/^\s*\|\s*"other_government_id"/m.test(client));
});

test("web and native capture separate document sides before consented document precheck",()=>{
  for(const code of [web,native]){
    for(const required of [
      "idBackDocument","setIdBackDocument","precheckIdentityDocument",
      "documentConsent","checkIdentityEngineReady","submitIdentityVerification"
    ])assert(code.includes(required),"missing "+required);
    assert(!code.includes("setIdentityVerified(true)"));
  }
  assert(client.includes("idBackDocument"));
  assert(client.includes("/api/identity/document/precheck"));
  assert(client.includes("X-VolunServe-Document-Precheck-Consent"));
});

test("authenticated Node gateway forwards Firestore DOB and barangay only",()=>{
  assert(backend.includes('"/api/identity/document/precheck"'));
  assert(backend.includes("x-volunserve-document-precheck-consent"));
  assert(backend.includes("identityDocumentPrecheckThrottle"));
  assert(backend.includes("X-VolunServe-Profile-Date-Of-Birth"));
  assert(backend.includes("X-VolunServe-Profile-Barangay"));
  assert(backend.includes("dateOfBirth: profile.dateOfBirth ||"));
  assert(backend.includes("barangay: profile.barangay ||"));
  assert(backend.includes("enforceSelectedIdDecision("));
  assert(!client.includes('formData.append("dateOfBirth"'));
});

test("Python private routes require internal backend key and five-ID scan",()=>{
  assert(py.includes("from strict_document_screening import"));
  assert(py.includes("async def document_precheck("));
  assert(py.includes("require_internal_backend(x_volunserve_internal_key)"));
  assert(py.includes("async def verify_identity("));
  assert(py.includes('form.get("idBackDocument")'));
  assert(py.includes("profile_comparison("));
  assert(py.includes("hashlib.sha256"));
});

test("DOB is persisted only at registration, with restricted client mutations",()=>{
  assert(signup.includes("dateOfBirth: formData.dateOfBirth"));
  assert(email.includes("dateOfBirth: birth"));
  assert(auth.includes("dateOfBirth?: string"));
  assert(auth.includes("...(birthDate ? { dateOfBirth: birthDate } : {})"));
  const users = rules.indexOf("match /users/{uid} {");
  const staff = rules.indexOf("// Staff applications never receive",users);
  assert(users>=0 && staff>users);
  const create = rules.slice(users,staff);
  assert(create.includes("'dateOfBirth'"));
  assert(create.includes("!('dateOfBirth' in request.resource.data)"));
  const update = rules.slice(rules.indexOf("allow update: if signedIn()",staff),rules.indexOf("allow update: if signedIn()",staff)+680);
  assert(update.includes("affectedKeys()"));
  assert(!update.includes("'dateOfBirth'"));
});
