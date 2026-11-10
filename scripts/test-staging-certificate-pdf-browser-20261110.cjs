"use strict";
// Runs ONLY against synthetic in-memory certificate fixtures and a local browser.
// No Firebase credentials, network access, production resources, or Firestore writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..");

function extractFunctions(relativePath, names) {
  const sourcePath = path.join(projectRoot, relativePath);
  const content = fs.readFileSync(sourcePath, "utf8");
  const parsed = ts.createSourceFile(relativePath, content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found = new Map();
  const wanted = new Set(names);
  for (const node of parsed.statements) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text)) {
          found.set(declaration.name.text, "const " + declaration.getText(parsed) + ";");
        }
      }
    } else if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) {
      found.set(node.name.text, node.getText(parsed));
    }
  }
  assert.deepEqual([...found.keys()].sort(), names.slice().sort(),
    "Certificate functions missing from " + relativePath);
  const code = names.map(n => found.get(n)).join("\n") +
    "\nmodule.exports = {" + names.join(",") + "};";
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { module: { exports: {} }, Date, console };
  vm.runInNewContext(js, sandbox, { filename: relativePath, timeout: 5000 });
  return { functions: sandbox.module.exports, source: content };
}

async function main() {
  const certificateSource = extractFunctions("app/(tabs)/certificate.tsx", [
    "toMillis",
    "formatDate",
    "formatDuration",
    "formatCertificateService",
    "formatEventDate",
    "eventPlace",
    "escapeCertificateHtml",
    "printableCertificateHtml",
  ]);
  const verifySource = extractFunctions("app/(tabs)/verify-certificate.tsx", [
    "normalizeCertificateId",
    "extractCertificateId",
  ]);

  const printable = certificateSource.functions.printableCertificateHtml;
  const extractId = verifySource.functions.extractCertificateId;
  const certificateId = "VS-STAGING-TEST-0001";
  const evilVolunteerName = 'Synthetic <img src=x onerror="window.__injected=true">';
  const evilEventTitle = 'Staging & <svg/onload=alert(1)>';
  const fakeCertificate = {
    id: certificateId,
    certificateId,
    certificateType: "community_event_participation",
    volunteerName: evilVolunteerName,
    eventTitle: evilEventTitle,
    eventDate: "2026-11-10",
    eventLocation: "Test Barangay",
    eventBarangay: "SJDM",
    issuedByName: "Synthetic Staging Administrator",
    verificationStatus: "issued",
    verifiedServiceMinutes: 1,
    checkedInAt: new Date("2026-11-10T12:00:00Z"),
    checkedOutAt: new Date("2026-11-10T12:01:00Z"),
    issuedAt: new Date("2026-11-10T12:01:30Z"),
  };
  // Intentionally inline the badge so the browser test never requests an asset.
  const logo = "data:image/svg+xml;base64," +
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#087c71"/></svg>').toString("base64");
  const html = printable(fakeCertificate, logo);
  assert.match(html, /CERTIFICATE OF PARTICIPATION/);
  assert.match(html, /VS-STAGING-TEST-0001/);
  assert.match(html, /1 minute/);
  assert.match(html, /Synthetic &lt;img/);
  assert.match(html, /Staging &amp; &lt;svg/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<svg\/onload/);
  assert.match(html, /@page\{size:A4 portrait/);
  assert.match(html, /window\.print\(\)/);
  console.log("PASS 1: Real certificate HTML template contains issued 1-minute service and ID with escaped participant/event data");

  assert.equal(extractId(certificateId), certificateId);
  assert.equal(extractId("https://staging.invalid/verify-certificate?certificateId=" + certificateId), certificateId);
  assert.equal(extractId(" vs-staging-test-0001 "), certificateId);
  assert.equal(extractId("bad<script>alert(1)</script>"), "");
  assert.match(verifySource.source, /getDoc\(doc\(db,\s*"publicCertificateVerifications",\s*id\)\)/);
  assert.match(verifySource.source, /verificationStatus/);
  assert.match(verifySource.source, /revoked/);
  assert.doesNotMatch(verifySource.source, /\b(setDoc|deleteDoc|updateDoc|addDoc)\s*\(/);
  console.log("PASS 2: Actual public Verify Certificate ID parsing, read-only lookup, and revoked display contract");

  assert.match(certificateSource.source,
    /if \(certificate\.verificationStatus !== "issued"\)[\s\S]{0,140}Only issued, non-revoked certificates can be printed/);
  assert.match(certificateSource.source, /onPress=\{\(\) => onPrint\(certificate\)\}/);
  console.log("PASS 3: Print / Save PDF action remains restricted to issued certificates");

  const chrome = ["google-chrome", "chromium", "chromium-browser"].find(binary => {
    const result = spawnSync("which", [binary], { encoding: "utf8" });
    return result.status === 0;
  });
  assert.ok(chrome, "Chrome/Chromium must be installed on CI runner");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "volunserve-synthetic-cert-"));
  try {
    const htmlPath = path.join(temp, "certificate.html");
    const pdfPath = path.join(temp, "certificate.pdf");
    fs.writeFileSync(htmlPath, html, "utf8");
    const browser = spawnSync(chrome, [
      "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--no-first-run",
      "--no-pdf-header-footer",
      "--print-to-pdf=" + pdfPath,
      pathToFileURL(htmlPath).href,
    ], { encoding: "utf8", timeout: 60000 });
    assert.equal(browser.status, 0,
      "Chromium PDF render failed: " + String(browser.stderr || browser.error || "").slice(-1000));
    assert.ok(fs.existsSync(pdfPath), "Chromium must have generated a PDF");
    const pdf = fs.readFileSync(pdfPath);
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.length > 10000, "Browser-generated PDF must not be empty");
    console.log("PASS 4: Real Chromium generated a non-empty A4 certificate PDF (" + pdf.length + " bytes)");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log("PASS: isolated staging certificate printable-PDF and verification tests; no live writes");
}

main().catch(err => { console.error(err); process.exitCode = 1; });
