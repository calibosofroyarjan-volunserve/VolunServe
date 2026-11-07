"use strict";
/**
 * Read-only code audit for all Super Admin, Admin, Resident and Volunteer routes.
 * This produces an inventory; it does NOT certify end-to-end behavior.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const groups = [
  { name: "Super Admin", dir: "app/(superadmin)" },
  { name: "Admin", dir: "app/(admin)" },
  { name: "Resident and Volunteer", dir: "app/(tabs)" },
  { name: "Authentication", dir: "app" },
];
const authFiles = new Set([
  "login.tsx", "login.web.tsx", "signup.tsx", "signup.web.tsx",
  "admin-login.tsx", "identity-verification.tsx", "identity-verification.web.tsx",
  "account-security.tsx",
]);
const actionTags = new Set(["TouchableOpacity", "Pressable", "Button", "TouchableHighlight", "TouchableWithoutFeedback"]);
const inputTags = new Set(["TextInput", "Switch", "Picker"]);
const attrs = node => {
  const map = new Set();
  for (const attr of node.attributes?.properties || []) {
    if (ts.isJsxAttribute(attr)) map.add(attr.name.text);
    if (ts.isJsxSpreadAttribute(attr)) map.add("...spread");
  }
  return map;
};
const fileList = dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(ent => {
    const full=path.join(dir,ent.name);
    if(ent.isDirectory()) return fileList(full);
    return full.endsWith(".tsx") ? [full.replaceAll(path.sep, "/")] : [];
  });
};
const reports = [];
for (const group of groups) {
  const files = group.name === "Authentication"
    ? fileList(group.dir).filter(x => !x.slice(group.dir.length + 1).includes("/") && authFiles.has(path.basename(x)))
    : fileList(group.dir);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const info = {
      group: group.name, file, buttons: 0, withoutPress: 0,
      withoutAccessibleRole: 0, textInputs: 0, unlabeledInputs: 0,
      hasValidationIndicator: /setError|fieldErrors|validate|formValid|Alert\.alert|AppAlert|setFormNotice|errorText/i.test(source),
      hardcodedHexCount: (source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
      redirected: /<Redirect\b/.test(source) && !/<(?:TouchableOpacity|Pressable|TextInput)\b/.test(source),
      issueLines: [],
    };
    function visit(node) {
      if(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag=node.tagName.getText(ast);
        const a=attrs(node);
        const line=ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1;
        if(actionTags.has(tag)) {
          info.buttons++;
          if(!a.has("onPress")&&!a.has("onClick")&&!a.has("onLongPress")&&!a.has("...spread")){
            info.withoutPress++;
            info.issueLines.push("Control without direct action at line "+line+" (manual review)");
          }
          if(!a.has("accessibilityRole") && tag !== "Button") info.withoutAccessibleRole++;
        }
        if(inputTags.has(tag)) {
          info.textInputs++;
          if(!a.has("accessibilityLabel")&&!a.has("aria-label")&&!a.has("...spread")) info.unlabeledInputs++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    reports.push(info);
  }
}

const safe = value => String(value).replaceAll("|", "/");
const byGroup = {};
for(const row of reports) {
 const g=byGroup[row.group] ||= { screens:0,actions:0,unwired:0,unlabeledControls:0,fields:0,unlabeledFields:0,hardcodedColors:0 };
 g.screens++;g.actions+=row.buttons;g.unwired+=row.withoutPress;g.unlabeledControls+=row.withoutAccessibleRole;
 g.fields+=row.textInputs;g.unlabeledFields+=row.unlabeledInputs;g.hardcodedColors+=row.hardcodedHexCount;
}
const md=[
"# VolunServe — comprehensive UI source inventory",
"",
"> READ-ONLY STATIC AUDIT. A missing explicit accessibility role/label does not always mean the UI is broken; user-visible text or wrappers may provide it. Source inventory cannot verify whether runtime handlers work, APIs succeed, or an authenticated role can complete a real workflow.",
"",
"## Coverage by role",
"",
"| Workspace | Route files | Clickable controls | Controls needing action review | Controls lacking explicit role | Inputs | Inputs lacking explicit label | Hex color literals |",
"| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
...Object.entries(byGroup).map(([g,v])=>`| ${g} | ${v.screens} | ${v.actions} | ${v.unwired} | ${v.unlabeledControls} | ${v.fields} | ${v.unlabeledFields} | ${v.hardcodedColors} |`),
"",
"## Per-module inspection ledger",
"",
"| Workspace | Route / file | Controls | No direct handler | No explicit role | Inputs | No explicit input label | Color literals | Needs validation review |",
"| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
...reports.map(r=>`| ${r.group} | \`${safe(r.file)}\` | ${r.buttons} | ${r.withoutPress} | ${r.withoutAccessibleRole} | ${r.textInputs} | ${r.unlabeledInputs} | ${r.hardcodedHexCount} | ${r.textInputs > 0 && !r.hasValidationIndicator ? "Yes — source check" : "Manual QA"} |`),
"",
"## Manual QA still required before production",
"",
"1. Four real authorized staging roles across desktop and narrow mobile browser.",
"2. Click every action, verify expected destination, disabled/loading state, and modal close/confirm behavior.",
"3. For every editable form, test empty values, min/max length, invalid formats, server rejects, duplicate submission and offline recovery.",
"4. Verify no session logout on UI taps, notifications visible, community events joining and attendance, assistance evidence, donation sandbox, and certificate downloads.",
"5. Check keyboard focus order and 44pt minimum hit areas; this audit only catalogs likely work.",
"",
"## Suspected missing direct handlers (inspect, do not auto-delete)",
"",
...reports.flatMap(r=>r.issueLines.slice(0,12).map(i=>`- \`${r.file}\`: ${i}`)),
"",
"Generated from source with `node scripts/audit-volunserve-module-controls-20261107.cjs` on the live-derived review branch.",
""
].join("\n");
fs.mkdirSync("reports", {recursive: true});
fs.writeFileSync("reports/volunserve-ui-controls-inventory.md", md);
fs.writeFileSync("reports/volunserve-ui-controls-inventory.json", JSON.stringify({summary:byGroup,files:reports},null,2));
console.log("VOLUNSERVE STATIC UI INVENTORY (not end-to-end verification)");
console.log(JSON.stringify(byGroup,null,2));
console.log("TOP 12 MODULES BY ACTION COUNT");
console.log(reports.slice().sort((a,b)=>b.buttons-a.buttons).slice(0,12)
  .map(r=>[r.group,r.file,r.buttons,r.withoutPress,r.textInputs,r.hardcodedHexCount].join(" | ")).join("\n"));
console.log("Report output: reports/volunserve-ui-controls-inventory.md");
if(reports.length<55) throw Error("Audit unexpectedly missed the active module routes");
