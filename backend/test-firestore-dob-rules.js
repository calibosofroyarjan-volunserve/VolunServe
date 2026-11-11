"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const source = fs.readFileSync("firestore.rules", "utf8");

test("Resident birth date is optional, canonical, create-only, and does not alter other roles", () => {
  assert.equal((source.match(/rules_version\\s*=\\s*'2';/g) || []).length, 1);
  assert.equal((source.match(/service cloud\\.firestore/g) || []).length, 1);
  assert(source.length > 190000 && source.length < 210000,
    "Unintended duplicate/truncated Firestore rules detected");
  const userStart = source.indexOf("match /users/{uid}");
  const residentCreate = source.indexOf("allow create:", userStart);
  const staffCreate = source.indexOf("Staff applications", residentCreate);
  assert(userStart >= 0 && residentCreate >= 0 && staffCreate > residentCreate);
  const allowedFields = source.slice(residentCreate,staffCreate);
  assert.match(allowedFields, /'dateOfBirth'/);
  assert.match(allowedFields, /!\\('dateOfBirth' in request\\.resource\\.data\\)/);
  assert.match(allowedFields, /request\\.resource\\.data\\.dateOfBirth\\.matches\\('\^\[0-9\]/);
  assert(!source.slice(staffCreate,staffCreate+300).includes("'dateOfBirth'"),
    "Staff signup must not gain DOB mutation authority");
  const ownerProfileUpdate = source.slice(staffCreate).match(/allow update: if signedIn\\(\\)/);
  assert(ownerProfileUpdate, "Existing user restrictions must remain present");
});

test("Firebase rules delimiters are balanced outside strings and comments", () => {
  const stack = [];
  const opens = new Set(["{","(","["]);
  const closes = {"}":"{",")":"(","]":"["};
  let mode = "code", quote = "", escape = false;
  for(let i=0;i<source.length;i++){
    const c=source[i], n=source[i+1];
    if(mode==="line"){if(c==="\\n")mode="code";continue}
    if(mode==="block"){if(c==="*" && n==="/"){mode="code";i++}continue}
    if(mode==="string"){
      if(escape){escape=false;continue}
      if(c==="\\\\"){escape=true;continue}
      if(c===quote)mode="code";
      continue;
    }
    if(c==="/"&&n==="/"){mode="line";i++;continue}
    if(c==="/"&&n==="*"){mode="block";i++;continue}
    if(c==="'"||c==='"'){mode="string";quote=c;continue}
    if(opens.has(c))stack.push(c);
    else if(Object.hasOwn(closes,c)){
      assert.equal(stack.pop(),closes[c],"Unbalanced Firestore rules near offset "+i);
    }
  }
  assert.equal(mode,"code","Unclosed quote or block comment");
  assert.equal(stack.length,0,"Unbalanced Firestore rules blocks");
});
