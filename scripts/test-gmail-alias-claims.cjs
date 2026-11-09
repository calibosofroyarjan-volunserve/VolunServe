#!/usr/bin/env node
"use strict";
// Offline, no Firebase clients or production writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const moduleLike = {exports:{}};
const tsSource=fs.readFileSync("lib/canonicalGmailAlias.ts","utf8");
new Function("exports","module",
  ts.transpileModule(tsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
)(moduleLike.exports,moduleLike);
const {canonicalGmailAlias} = moduleLike.exports;
for (const [email,want] of [
  ["sample.name@gmail.com","samplename@gmail.com"],
  ["s.a.m.p.l.e.n.a.m.e@gmail.com","samplename@gmail.com"],
  ["SAMPLEname@GOOGLEMAIL.COM","samplename@gmail.com"],
  ["sample.name+test@gmail.com","samplename@gmail.com"],
  ["sample.name@yahoo.com",null],
  ["sample.name@outlook.com",null],
  ["sample.name@gmail.com.fake.org",null],
  ["@gmail.com",null],
]) assert.equal(canonicalGmailAlias(email),want,email);
const code=fs.readFileSync("lib/firebaseAuth.ts","utf8");
assert(code.includes('doc(db, "gmailAliasClaims", gmailAlias)'),"Missing canonical index document");
assert(code.includes("const existingAlias = aliasRef ? await transaction.get(aliasRef) : null"),"Must read alias in transaction");
assert(code.includes("if (existingAlias?.exists())"),"Must reject existing alias, including same owner to avoid duplicate signup");
assert(code.includes("transaction.set(aliasRef, {uid, createdAt: serverTimestamp()})"),"Must atomically create immutable claim");
const txn=code.slice(code.indexOf("const aliasRef = gmailAlias ?"),code.indexOf("return user;",code.indexOf("const aliasRef = gmailAlias ?")));
assert(txn.indexOf("await transaction.get(profileRef)")<txn.indexOf("transaction.set(profileRef"));
assert(txn.indexOf("await transaction.get(aliasRef)")<txn.indexOf("transaction.set(aliasRef"));
assert(txn.indexOf("transaction.set(aliasRef")<txn.indexOf("transaction.set(profileRef"));
console.log("PASS canonical Gmail equivalence, non-Gmail isolation, and atomic signup-claim source contract (NO DEPLOY)");
