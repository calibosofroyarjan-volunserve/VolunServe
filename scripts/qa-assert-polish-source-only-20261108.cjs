"use strict";
const fs=require("fs"),cp=require("child_process"),ts=require("typescript");
const BASE="a6f832da13f89ef70bf7a19204dadf4f5c9cdb4e";
const git=(...a)=>cp.execFileSync("git",a,{encoding:"utf8",maxBuffer:25*1024*1024}).trim();
const changed=git("diff","--name-only",BASE,"HEAD").split("\n").filter(Boolean);
const qaAllowed=new Set([
 ".github/workflows/qa-final-polished-isolated-visual-20261108.yml",
 "scripts/qa-seed-demo-roles-20261108.cjs",
 "scripts/qa-screenshot-live-roles-20261108.cjs",
 "scripts/qa-assert-polish-source-only-20261108.cjs"
]);
let verified=0;
function make(sf,s){
 let found;
 function walk(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(sf)==="StyleSheet"&&n.expression.name.getText(sf)==="create")found=n;ts.forEachChild(n,walk);}
 walk(sf);if(!found)throw Error("Missing styles");return s.slice(0,found.getStart(sf))+s.slice(found.getEnd());
}
for(const p of changed){
 if(qaAllowed.has(p))continue;
 if(!p.startsWith("app/")||!p.endsWith(".tsx"))throw Error("BLOCKED non-UI changed: "+p);
 const original=git("show",BASE+":"+p),updated=fs.readFileSync(p,"utf8");
 const a=ts.createSourceFile(p,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const b=ts.createSourceFile(p,updated,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(a.parseDiagnostics.length||b.parseDiagnostics.length)throw Error("BLOCKED parse error "+p+": "+b.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")).join("; "));
 if(make(a,original)!==make(b,updated))throw Error("BLOCKED non-stylesheet logic change: "+p);
 verified++;
}
if(changed.includes("components/home/Home.web.tsx"))throw Error("BLOCKED original Resident Home overwritten");
if(verified<35)throw Error("Expected 35+ actual web route presentation improvements; got "+verified);
console.log("PASS: "+verified+" app screens are style-only; original Home, backend, auth, payments, and Firestore code unchanged");
