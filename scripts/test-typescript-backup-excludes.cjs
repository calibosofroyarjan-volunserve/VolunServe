/**
 * Check that the root TypeScript config does not compile local VolunServe
 * release/backup snapshots as if they were part of the actual application.
 * This test creates its own disposable fixture directory only.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "VolunServe-CompileGuard-Fixture");
if (fs.existsSync(fixture)) {
  throw new Error("Refusing to touch a pre-existing fixture directory");
}

try {
  fs.mkdirSync(fixture);
  fs.writeFileSync(
    path.join(fixture, "invalid-backup.ts"),
    'const deliberatelyInvalid: number = "must not compile";\n',
    "utf8",
  );
  const filename = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(filename, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    throw new Error(parsed.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n"));
  }
  const paths = parsed.fileNames.map(file => path.normalize(file));
  if (paths.some(file => file.startsWith(fixture + path.sep))) {
    throw new Error("tsconfig.json is mistakenly compiling nested VolunServe backup folders");
  }
  const source = path.join(root, "components", "home", "Home.native.tsx");
  if (!paths.includes(source)) {
    throw new Error("tsconfig.json incorrectly excludes the actual application source");
  }
  console.log("PASS: local VolunServe backup snapshots excluded; app sources preserved");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
