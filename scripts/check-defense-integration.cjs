/** Local integration gates. --rules requires the localhost Firestore emulator. */
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const root = path.resolve(__dirname, "..");
const rules = process.argv.includes("--rules");
if (rules && process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
  throw new Error("Only localhost Firestore emulator 8080 is allowed");
}

const files = rules ? [
  "scripts/test-lgu-admin-rules.cjs",
  "scripts/test-donation-lgu-role-isolation.cjs",
  "scripts/test-live-emergency-map-rules.cjs",
  "scripts/test-community-events-rules.cjs",
  "scripts/test-community-organizer-gps-cleanup.cjs",
] : [
  "scripts/test-vscode-typescript-jsx.cjs",
  "scripts/test-typescript-backup-excludes.cjs",
  "scripts/test-route-entrypoints.cjs",
  "scripts/audit-static-navigation.cjs",
  "scripts/test-lgu-admin-navigation-groups.cjs",
  "scripts/test-admin-overview-ui.cjs",
  "scripts/test-admin-navigation-contract.cjs",
  "scripts/test-admin-staff-login.cjs",
  "scripts/test-dashboard-overviews.cjs",
  "scripts/test-final-admin-scope.cjs",
  "scripts/test-premium-auth-portal.cjs",
  "scripts/test-event-map-route-ux.cjs",
  "scripts/test-event-pin-picker.cjs",
  "backend/test-communityCertificates.js",
  "backend/test-identityAiReadiness.js",
  "backend/tests/fundReleaseReconciliation.test.js",
];

const results = [];
for (const file of files) {
  const result = cp.spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const record = {
    file,
    status: result.status === 0 ? "PASSED" : "FAILED",
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
  };
  results.push(record);
  console.log(record.status + " " + file);
  if (result.status !== 0) console.error(result.stderr || result.error);
}

const outputDir = process.env.VOLUNSERVE_TEST_RESULTS_DIR
  ? path.resolve(root, process.env.VOLUNSERVE_TEST_RESULTS_DIR)
  : path.join(root, ".conflict-backups");
fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir,
  "defense-checks-" + (rules ? "rules" : "offline") + "-" + Date.now() + ".json");
fs.writeFileSync(output, JSON.stringify(results, null, 2));
console.log("RESULTS " + output);
if (results.some(result => result.status !== "PASSED")) process.exitCode = 1;
