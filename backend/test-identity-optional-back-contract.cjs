"use strict";
// Static/synthetic integration guard. Does not import private AI models,
// upload images, open accounts, touch Firebase or use the network.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ui = fs.readFileSync("app/identity-verification.web.tsx", "utf8");
const api = fs.readFileSync("lib/identityVerification.ts", "utf8");
const py = fs.readFileSync("identity-ai/main.py", "utf8");
const screening = fs.readFileSync("identity-ai/document_screening.py", "utf8");
const backend = fs.readFileSync("backend/server.js", "utf8");

test("live original face scan and field name stay unchanged", () => {
  for (const key of ["const detectLoop = useCallback", "const captureFrame = useCallback",
    "const openFaceScan = async", "submitIdentityVerification({", "const ensureDetector = async"]) {
    assert(ui.includes(key), "Original live face flow must be preserved: " + key);
  }
  assert(api.includes('"idDocument",'), "Original front field cannot be renamed");
  assert(api.includes('"selfie",'), "Original selfie field cannot be renamed");
  assert(py.includes("run_face_verification,"));
  assert(backend.includes('"/api/identity/verify"'));
});

test("front/back ID controls use separate ephemeral in-memory media without persistence", () => {
  for (const marker of ['useState<CapturedIdentityMedia | null>(null);',
    "Front of National ID", "Back of National ID", "Use Camera",
    "Upload File", "setIdBackDocument(media)", "setIdDocument(media)",
    "idBackDocument: idType === \"passport\" ? null : idBackDocument",
    'idType !== "passport" && !idBackDocument']) {
    assert(ui.includes(marker), "Missing protected UI back capture: " + marker);
  }
  assert(!ui.includes("localStorage.setItem"), "Never cache private ID documents");
  assert(!ui.includes("sessionStorage.setItem"), "Never cache private ID documents");
});

test("optional ID back uses same secure authenticated multipart route", () => {
  assert(api.includes("idBackDocument?: CapturedIdentityMedia | null;"));
  assert(api.includes('appendMedia(formData, "idBackDocument", input.idBackDocument)'));
  assert(py.includes('form.get("idBackDocument")'));
  assert(py.includes("id_back_bytes = None"));
  assert(py.includes("combine_document_sides("));
  assert(py.includes("if id_back_bytes is not None else None"));
});

test("OCR precheck is Firebase-authenticated and never changes face attempts or records", () => {
  const handler = backend.slice(
    backend.indexOf('"/api/identity/document/precheck"'),
    backend.indexOf('"/api/identity/verify"'),
  );
  assert(handler.includes("requireFirebaseUser"));
  assert(handler.includes("getIdentityAiHeaders(request)"));
  assert(handler.includes('endpoint.replace(/\\/verify$/, "/document/precheck")'));
  assert(handler.includes('"Cache-Control", "no-store"'));
  assert(!handler.includes("db.runTransaction"));
  assert(!handler.includes(".collection("));
  assert(!handler.includes("FieldValue."));
  assert(!handler.includes("identityVerified: true"));
});

test("consent-only ID photo precheck cannot submit a selfie or bypass the OCR gate", () => {
  const first = api.indexOf("export async function precheckIdentityDocument");
  const last = api.indexOf("export const submitIdentityVerification", first);
  assert(first >= 0 && last > first);
  const client = api.slice(first, last);
  assert(client.includes('formData.append("consent", "true")'));
  assert(client.includes('/api/identity/document/precheck'));
  assert(!client.includes('appendMedia(formData, "selfie"'));
  const gate = ui.slice(ui.indexOf("const openFaceScan = async"), ui.indexOf("const retake ="));
  assert(gate.includes("await precheckIdentityDocument({"));
  assert(gate.indexOf('result.outcome !== "pass"') < gate.indexOf("setStep(2)"));
  assert(gate.includes("if (!consent)"));
  assert(ui.includes("Check ID, then Face Scan"));
});

test("private Python precheck requires internal key, consent, both ID sides and no face", () => {
  const ai = fs.readFileSync("identity-ai/main.py", "utf8");
  const start = ai.indexOf('async def document_precheck(');
  const end = ai.indexOf('@app.post(\n    "/verify"', start);
  assert(start >= 0 && end > start);
  const route = ai.slice(start, end);
  assert(route.includes("require_internal_backend("));
  assert(route.includes("validate_forwarded_user("));
  assert(route.includes('form.get("consent")'));
  assert(route.includes('form.get("idBackDocument")'));
  assert(!route.includes('form.get("selfie")'));
  assert(!route.includes("run_face_verification"));
  assert(!route.includes("db.collection"));
  assert(route.includes('"outcome": "rejected" if unsupported'));
});

test("School ID back is a guarded failed decision, not a verified resident", () => {
  assert(screening.includes('warning_codes.append("non_government_id_detected")'));
  assert(screening.includes('result["status"] = "mismatch"'));
  assert(backend.includes('documentScreening.warningCodes.includes("non_government_id_detected")'));
  assert(backend.includes('const decision = explicitlyUnsupportedId'));
  assert(screening.includes('result["manualReviewRequired"] = True'));
  assert(screening.includes('result["authenticityVerified"] = False'));
});
