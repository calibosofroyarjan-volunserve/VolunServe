"use strict";
/**
 * Scope one unchanged, previously ROOT-defined isSuperAdmin helper to ONLY
 * match blocks which actually call it. Firebase compiler otherwise inherits
 * root-scope helpers into all descendant match blocks, expanding the compiled
 * executable size for large rulesets.
 *
 * This is a semantics-preserving relocation, never an authorization rewrite:
 * original helper body is byte-identical after adjusting indentation.
 * No other rule is permitted to change (verified by a full inverse transform).
 *
 * Usage: node scripts/scope-superadmin-helper.cjs existing.rules scoped.rules
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw Error("Usage: scope-superadmin-helper.cjs <candidate.rules> <scoped.rules>");
const original = fs.readFileSync(sourcePath, "utf8");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
// Preserve mixed original line endings byte-for-byte; only new helper copies use LF.
const nl = "\n";
const rootDefinition = /(^[ \t]*function isSuperAdmin\(\) \{(?:\r?\n(?!(?:[ \t]*function|[ \t]*match)\b)[^\r\n]*)*\r?\n[ \t]*\}\r?\n)/m;
// More reliable: isolate the exact root helper between its header and next known
// root helper comment, using its original braces and indentation.
const rootStart = original.indexOf("    function isSuperAdmin() {");
const rootEnd = original.indexOf("    // One role test, not isAdmin() || isSuperAdmin().", rootStart);
assert.ok(rootStart > 0 && rootEnd > rootStart && rootEnd-rootStart < 700,
  "Unexpected root Super Admin helper boundaries");
let rootBlock = original.slice(rootStart, rootEnd);
assert.equal((original.match(/function isSuperAdmin\(\)/g)||[]).length, 1,
  "Only one original Super Admin helper definition is supported.");
assert.match(rootBlock,/^\s*function isSuperAdmin\(\) \{/);
assert.match(rootBlock,/p\.get\('role', ''\) == 'superadmin'/);
assert.match(rootBlock,/p\.get\('status', 'approved'\) == 'approved'/);
assert.ok(rootBlock.includes("return signedIn()"),"Original Super Admin approval test missing.");
assert.ok(!/\b(match|allow)\s+[a-z]+\s*:/.test(rootBlock),"Cannot move a match or rule statement");
assert.ok(!rootBlock.includes("function isAdminOrSuperAdmin("),"Unexpected root fragment");
const noRoot = original.slice(0,rootStart)+original.slice(rootEnd);
// Using the unchanged helper text and indentation (just four spaces deeper)
const cloned = rootBlock.trimEnd().split(/\r?\n/).map(x => "    "+x).join(nl)+nl;
const prefix = "      // Security-equivalent local Super Admin helper (relocated from root)."+nl;
const insertion = prefix + cloned;
const calls = [];
let depth=0;
const stack=[];
const lines=noRoot.match(/[^\n]*\n|[^\n]+$/g) || [];
function braceDelta(line) {
  let quote=null, escape=false, delta=0;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (quote) {
      if (escape) { escape=false; continue; }
      if (ch==="\\") { escape=true; continue; }
      if (ch===quote) quote=null;
      continue;
    }
    if (ch==="'"||ch==='"') {quote=ch;continue;}
    if (ch==="/"&&line[i+1]==="/") break;
    if (ch==="{") delta++;
    if (ch==="}") delta--;
  }
  return delta;
}
for (let i=0;i<lines.length;i++) {
  const line=lines[i].replace(/\r?\n$/,"");
  const match=line.match(/^[ \t]*match (.+?) \{[ \t]*$/);
  if (match) stack.push({path:match[1],header:i,d:depth+1});
  if (/\bisSuperAdmin\s*\(/.test(line) &&
      !/\bfunction isSuperAdmin\s*\(/.test(line) &&
      !line.trim().startsWith("//")) {
    const nearest=stack[stack.length-1];
    assert.ok(nearest&&stack.length>=2,
      "Super Admin helper call exists outside a specific match block: line "+(i+1));
    calls.push({line:i+1,path:nearest.path,header:nearest.header});
  }
  depth+=braceDelta(line);
  assert.ok(depth>=0,"Malformed rules braces at "+(i+1));
  while (stack.length && stack[stack.length-1].d>depth) stack.pop();
}
assert.equal(depth,0,"Malformed rules brace structure");
assert.ok(calls.length>=5 && calls.length<=30, "Unexpected Super Admin helper call count");
const headers=[...new Set(calls.map(x=>x.header))];
assert.ok(headers.length>=4&&headers.length<=15,"Unexpected Super Admin match count");
for (const header of headers) assert.ok(
  lines[header].includes("match /") &&
  !lines[header].includes("match /databases/{database}/documents"),
  "Cannot add a root helper clone at a noncollection match"
);
// The helper belongs inside exactly those matches that reference it.
// Insert in descending line order so prior indices cannot shift.
for (const header of [...headers].sort((a,b)=>b-a)) {
  lines.splice(header+1,0,insertion);
}
const output = lines.join("");
assert.equal((output.match(/function isSuperAdmin\(\)/g)||[]).length,
  headers.length,"All and only authorized collection scopes receive the same helper.");
// Remove the exact repeated insertion and restore original root helper.
// If any unrelated byte changed, including line endings, fail closed.
const injectedSegment=insertion;
const n = output.split(injectedSegment).length-1;
assert.equal(n,headers.length, "Scoped helper marker count mismatch");
const reverseNoRoot=output.split(injectedSegment).join("");
assert.equal(reverseNoRoot,noRoot,"Helper relocation unexpectedly modified unrelated rules.");
const restored=reverseNoRoot.slice(0,rootStart)+rootBlock+reverseNoRoot.slice(rootStart);
assert.equal(restored,original,"Full reversible byte-exact policy equality failed");
fs.writeFileSync(outputPath,output);
console.log("PASS moved exactly the unchanged isSuperAdmin function from root to "+headers.length+" authorized match blocks.");
console.log("PASS all "+calls.length+" previous Super Admin callsites retain a lexically available matching helper.");
console.log("PASS full inverse transformation restores identical original candidate bytes SHA256 "+sha(original));
console.log("CANDIDATE_SCOPED_SHA256",sha(output));
