/**
 * Audit literal Expo Router navigation calls against physical route files.
 *
 * This supplements TypeScript checking by catching destinations where local
 * .expo/types route declarations have gone stale. No production Firebase or
 * backend services are accessed.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const app = path.join(root, "app");
const allSources = [];
const screens = [];
const excluded = new Set(["node_modules", ".expo", ".git", "dist", "web-build"]);
function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(item.name) || /^VolunServe-/i.test(item.name)) continue;
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) walk(filename);
    else if (/\.(tsx?|jsx?)$/i.test(item.name) && !/\.d\.ts$/i.test(item.name)) allSources.push(filename);
  }
}
walk(app);
walk(path.join(root, "components"));

function getRoutes() {
  for (const filename of allSources) {
    if (!filename.startsWith(app + path.sep)) continue;
    let relative = path.relative(app, filename).split(path.sep).join("/");
    if (!/\.(tsx?|jsx?)$/i.test(relative)) continue;
    relative = relative.replace(/\.(web|native|ios|android)?\.(tsx?|jsx?)$/i, "");
    if (/^\+/.test(path.posix.basename(relative)) || /(^|\/)\_layout$/.test(relative)) continue;
    const segments = relative.split("/");
    const withoutIndex = segments[segments.length - 1] === "index" ? segments.slice(0, -1) : segments;
    const pathWithGroups = "/" + withoutIndex.join("/");
    screens.push(pathWithGroups || "/");
    screens.push("/" + withoutIndex.filter(s => !/^\(.*\)$/.test(s)).join("/"));
  }
  return new Set(screens.map(r => r.replace(/\/$/, "") || "/"));
}
const routes = getRoutes();
let count = 0;
const missing = [];
const ignored = [];
const methods = new Set(["push", "replace", "navigate"]);
function inspect(node, filename) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      methods.has(node.expression.name.text) && node.arguments.length > 0) {
    const arg = node.arguments[0];
    const target = ts.isStringLiteral(arg) ? arg :
      ts.isAsExpression(arg) && ts.isStringLiteral(arg.expression) ? arg.expression : null;
    if (target && target.text.startsWith("/") && !target.text.startsWith("//")) {
      const dest = target.text.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      // Dynamic destinations are checked by the typed application routing layer.
      if (dest.includes("[") || dest.includes("]")) ignored.push(dest);
      else if (!routes.has(dest)) {
        const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
        const line = source.getLineAndCharacterOfPosition(target.getStart(source)).line + 1;
        missing.push(path.relative(root, filename) + ":" + line + " -> " + dest);
      } else count++;
    }
  }
  ts.forEachChild(node, child => inspect(child, filename));
}
for (const filename of allSources) {
  const contents = fs.readFileSync(filename, "utf8");
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  inspect(source, filename);
}
if (missing.length) {
  console.error("Unresolved static navigation calls (" + missing.length + "):");
  for (const item of missing.slice(0, 45)) console.error("  " + item);
  process.exit(1);
}
console.log("PASS: " + count + " direct static navigation calls have matching app routes");
if (ignored.length) console.log("Skipped " + ignored.length + " dynamic destinations for TypeScript checks");
