#!/usr/bin/env node
/**
 * Read-only route-by-route UI and input-validation audit.
 * Fail on syntax errors and on changes outside presentation styles in screens
 * modified by this live-protected design PR. Do NOT treat static inspection as
 * verified Auth/Firestore/server-side or authenticated browser behavior.
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ts = require("typescript");

const ROOT = process.cwd();
const BASE = process.env.VOLUNSERVE_LIVE_BASE || "8ea1d1a1f3a50ce7468180b948e94254416914bf";
const reports = path.join(ROOT, "reports");
fs.mkdirSync(reports, { recursive: true });

const routes = [];
function visit(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) visit(file);
    else if (item.name.endsWith(".tsx")) routes.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
}
visit(path.join(ROOT, "app"));
routes.sort();

function parse(file, content) {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (sf.parseDiagnostics.length) {
    throw new Error(file + ": TSX syntax failure: " + sf.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; "));
  }
  return sf;
}

function styleCall(sf) {
  let selected = null;
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(sf) === "StyleSheet" && node.expression.name.text === "create") {
      selected = { start: node.getStart(sf), end: node.getEnd() };
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return selected;
}

function git(args) {
  return cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}
const changes = git(["diff", "--name-only", BASE, "HEAD"]).trim().split("\n").filter(Boolean);
const allow = file => file.startsWith("app/") && file.endsWith(".tsx") ||
  file === "constants/volunserveLiveUi.ts" ||
  file === "scripts/audit-protected-live-ui-20261108.cjs" ||
  file === ".github/workflows/validate-protected-live-ui-20261108.yml" ||
  file === "docs/live-protected-all-module-ui-review-20261108.md";
const forbidden = changes.filter(file => !allow(file));
if (forbidden.length) throw new Error("Forbidden non-presentation files modified: " + forbidden.join(", "));
if (changes.includes("components/home/Home.web.tsx")) throw new Error("Original live Home changed.");
if (changes.includes("firestore.rules") || changes.includes(".firebaserc") || changes.includes("firebase.json")) {
  throw new Error("Production configuration/rules changed.");
}
let changedScreens = 0;
for (const file of changes.filter(file => file.startsWith("app/") && file.endsWith(".tsx"))) {
  const before = git(["show", BASE + ":" + file]);
  const after = fs.readFileSync(path.join(ROOT, file), "utf8");
  const scrubbed = after.replace(/^import \{ liveUi as designUi \} from "(?:\.\.\/){1,2}constants\/volunserveLiveUi";\r?\n/, "");
  const oldSf = parse(file + " (base)", before);
  const newSf = parse(file + " (candidate)", scrubbed);
  const a = styleCall(oldSf), b = styleCall(newSf);
  if (!a || !b) throw new Error("No expected StyleSheet.create in " + file);
  if (before.slice(0, a.start) !== scrubbed.slice(0, b.start) ||
      before.slice(a.end) !== scrubbed.slice(b.end)) {
    throw new Error("Non-style code has changed in " + file + " — require manual diff review.");
  }
  if (!after.includes("designUi.type.")) throw new Error("No shared typography in " + file);
  changedScreens++;
}

const inventory = [];
for (const file of routes) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const sf = parse(file, source);
  let inputs = 0, actionControls = 0, controlsWithHandlers = 0, inputWithChange = 0;
  const readAttrs = tag => {
    if (!tag.attributes || !tag.attributes.properties) return [];
    return tag.attributes.properties.map(p => (p.name && p.name.getText(sf)) || "...").filter(Boolean);
  };
  function scan(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf).split(".").pop();
      const attr = readAttrs(node);
      if (tag === "TextInput") {
        inputs++;
        if (attr.some(a => ["onChangeText", "onChange", "value", "defaultValue"].includes(a))) inputWithChange++;
      }
      if (["TouchableOpacity", "Pressable", "Button", "VolunServeButton", "TouchableHighlight"].includes(tag)) {
        actionControls++;
        if (attr.some(a => ["onPress", "onClick", "onLongPress", "onSubmit"].includes(a))) controlsWithHandlers++;
      }
    }
    ts.forEachChild(node, scan);
  }
  scan(sf);
  const possibleValidation = /\b(validate|validation|isValid|setError|formError|errors|\.trim\s*\(|Alert\.alert|AppAlert|setFormNotice|isRequired|regex)\b/i.test(source);
  inventory.push({
    route: file, activeControlCount: actionControls, explicitHandlerCount: controlsWithHandlers,
    textInputCount: inputs, stateBoundInputCount: inputWithChange,
    possibleValidationEvidence: possibleValidation,
    typographyUsesTokens: source.includes("designUi.type."),
    requiresManualFlowTest: true,
  });
}
const readOnly = {
  baseLiveCommit: BASE,
  scope: "static-source-only",
  changedRouteFiles: changedScreens,
  auditedRouteFiles: inventory.length,
  inputsReviewedStatically: inventory.reduce((a, x) => a + x.textInputCount, 0),
  controlsReviewedStatically: inventory.reduce((a, x) => a + x.activeControlCount, 0),
  pendingAuthenticatedBrowserAndServerValidation: true,
  disclaimer: "A field with possible validation evidence is NOT proven correct; this is not an end-to-end test.",
  inventory
};
fs.writeFileSync(path.join(reports, "live-protected-ui-audit.json"), JSON.stringify(readOnly, null, 2) + "\n");
const rows = inventory.map(x =>
  "| " + x.route.replace(/\|/g, "\\|") + " | " + x.textInputCount + " | " + x.stateBoundInputCount +
  " | " + x.activeControlCount + " | " + x.explicitHandlerCount +
  " | " + (x.possibleValidationEvidence ? "Detected (not verified)" : "Not detected / N/A") + " |"
);
fs.writeFileSync(path.join(reports, "live-protected-ui-audit.md"),
  "# VolunServe route-level UI & validation inventory\n\n" +
  "This is static source inspection only, NOT proof that every control, server validation, or route works live.\n\n" +
  "Protected live baseline: " + BASE + "\n\n" +
  "Updated TSX screens: " + changedScreens + ". Routes scanned: " + inventory.length + ".\n\n" +
  "| Route | Text inputs | Bound inputs | Controls | Explicit handlers | Validation signal |\n" +
  "|---|---:|---:|---:|---:|---|\n" + rows.join("\n") + "\n\n" +
  "Manual staging QA required: authentication, Firestore role permissions, validation errors, notifications, registration, review/approval, assignment, time-in/out, donations sandbox, certificate, GPS, all mobile breakpoints.\n"
);
console.log("Static audit PASS: " + inventory.length + " route files parsed, " +
  changedScreens + " style-only route modifications checked.");
console.log("Manual authenticated validation still required. See reports/live-protected-ui-audit.*");
