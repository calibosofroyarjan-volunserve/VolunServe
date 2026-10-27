/** Ensure VS Code and npm tsc discover TSX files using the project's React JSX config. */
const ts = require("typescript");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert(!config.error, ts.flattenDiagnosticMessageText(config.error?.messageText || "", "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {}, configPath);
assert.equal(parsed.errors.length, 0, "Invalid Expo tsconfig: " + parsed.errors
  .map(e => ts.flattenDiagnosticMessageText(e.messageText, " ")).join("; "));
assert.equal(parsed.options.jsx, ts.JsxEmit.ReactJSX,
  "TS17004 risk: jsx must be explicitly set to react-jsx in tsconfig.json");
const included = new Set(parsed.fileNames.map(p => path.normalize(p).toLowerCase()));
const mustInclude = [
  "app/(admin)/_layout.tsx",
  "app/(superadmin)/_layout.tsx",
  "app/(tabs)/community-events.tsx",
  "app/(tabs)/disaster-response.tsx",
];
for (const file of mustInclude) {
  assert(included.has(path.join(root, file).toLowerCase()),
    "Missing TSX from TypeScript project: " + file);
}
console.log("PASS: Expo JSX emit:", ts.JsxEmit[parsed.options.jsx]);
console.log("PASS: all critical TSX files are included in project tsconfig");
const settings = JSON.parse(fs.readFileSync(path.join(root, ".vscode/settings.json"), "utf8"));
assert.equal(settings["typescript.tsdk"], "node_modules/typescript/lib",
  "VS Code must resolve project-local TypeScript SDK");
console.log("PASS: VS Code configured for local node_modules TypeScript");
