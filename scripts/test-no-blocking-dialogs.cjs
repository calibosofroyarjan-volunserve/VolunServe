"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const dirs = ["app", "components", "lib"];
const offenses = [];
let checked = 0;
function visit(directory) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    const info = fs.statSync(file);
    if (info.isDirectory()) { visit(file); continue; }
    if (!/\.(tsx?|jsx?)$/.test(file) || /\.d\.ts$/.test(file)) continue;
    checked++;
    const code = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function check(node) {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        let bad = false;
        if (ts.isIdentifier(expr)) bad = ["alert", "confirm", "prompt"].includes(expr.text);
        if (ts.isPropertyAccessExpression(expr)) {
          const owner = expr.expression;
          const action = expr.name.text;
          if (ts.isIdentifier(owner)) {
            if (owner.text === "Alert" && ["alert", "prompt"].includes(action)) bad = true;
            if (["window", "globalThis"].includes(owner.text) &&
              ["alert", "confirm", "prompt"].includes(action)) bad = true;
          }
        }
        if (bad) {
          const loc = source.getLineAndCharacterOfPosition(node.getStart(source));
          offenses.push(path.relative(root, file) + ":" + (loc.line + 1));
        }
      }
      ts.forEachChild(node, check);
    }
    check(source);
  }
}
dirs.forEach(folder => visit(path.join(root,folder)));
test("Every app, component and library screen uses in-app dialogs rather than blocking browser/native alert APIs", () => {
  assert.deepEqual(offenses, [], "Blocking calls remain at " + offenses.join(", "));
  assert.ok(checked > 120, "The scan should cover all VolunServe screen sources");
});
test("The root layout mounts the shared modal above all protected and public routes", () => {
  const layout = fs.readFileSync(path.join(root,"app/_layout.tsx"),"utf8");
  assert.match(layout, /<AppDialogHost\s*\/>/);
  const host = fs.readFileSync(path.join(root,"components/ui/AppDialogHost.tsx"),"utf8");
  assert.match(host, /accessibilityRole="alert"/);
  assert.match(host, /onRequestClose/);
  assert.match(host, /button\.style === "destructive"/);
});
test("Confirmation dialogs execute destructive callbacks only after explicit choice", async () => {
  const code = fs.readFileSync(path.join(root,"lib/appDialog.ts"),"utf8");
  const js = ts.transpileModule(code, {compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module = { exports: {} };
  new Function("module", "exports", js)(module,module.exports);
  const {AppAlert,closeAppDialog,subscribeAppDialog} = module.exports;
  let current=null, acted=0;
  const unsubscribe=subscribeAppDialog(dialog=>{current=dialog;});
  try {
    AppAlert.alert("Delete record", "This operation cannot be undone.", [
      {text:"Cancel",style:"cancel"},
      {text:"Delete",style:"destructive",onPress:()=>{acted++;}},
    ]);
    assert.equal(acted,0);
    assert.equal(current.title,"Delete record");
    closeAppDialog(current.id,current.buttons[0]);
    assert.equal(acted,0);
    AppAlert.alert("Delete record", "Confirm again.", [
      {text:"Cancel",style:"cancel"},
      {text:"Delete",style:"destructive",onPress:()=>{acted++;}},
    ]);
    assert.equal(acted,0);
    closeAppDialog(current.id,current.buttons[1]);
    assert.equal(acted,1);
    const pending=AppAlert.confirm("Log Out","Are you sure?", "Log Out");
    assert.equal(current.title,"Log Out");
    closeAppDialog(current.id,current.buttons[0]);
    assert.equal(await pending,false);
    const confirmed=AppAlert.confirm("Log Out","Are you sure?", "Log Out");
    closeAppDialog(current.id,current.buttons[1]);
    assert.equal(await confirmed,true);
  } finally { unsubscribe(); }
});
