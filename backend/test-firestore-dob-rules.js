"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const source = fs.readFileSync("firestore.rules", "utf8");

test("Resident birthday is optional and immutable after signup", () => {
  assert.equal((source.match(/rules_version\s*=\s*'2';/g) || []).length, 1);
  assert.equal((source.match(/service cloud\.firestore/g) || []).length, 1);
  assert(source.length > 190000 && source.length < 210000,
    "Duplicated or truncated Firestore rules detected");
  const users = source.indexOf("match /users/{uid}");
  const resident = source.indexOf("allow create:", users);
  const staff = source.indexOf("Staff applications", resident);
  assert(users >= 0 && resident > users && staff > resident);
  const residentRules = source.slice(resident, staff);
  assert(residentRules.includes("'dateOfBirth'"));
  // Optional legacy entry paths use a canonical default; present values
  // must still be strings with a YYYY-MM-DD pattern.
  assert(residentRules.includes("request.resource.data.get('dateOfBirth', '2000-01-01').matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')"));
  assert(!source.slice(staff, staff + 350).includes("'dateOfBirth'"));
  assert(source.includes("affectedKeys().hasOnly("),
    "Do not bypass existing restricted user-update field allowlist");
});

test("Firestore Rules delimiters balance outside strings and comments", () => {
  const stack = [], opens = new Set(["{", "(", "["]);
  const closes = {"}": "{", ")": "(", "]": "["};
  let mode = "code", quote = "", escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (mode === "line") { if (c === "\n") mode = "code"; continue; }
    if (mode === "block") {
      if (c === "*" && next === "/") { mode = "code"; i++; }
      continue;
    }
    if (mode === "string") {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === quote) mode = "code";
      continue;
    }
    if (c === "/" && next === "/") { mode = "line"; i++; continue; }
    if (c === "/" && next === "*") { mode = "block"; i++; continue; }
    if (c === "'" || c === '"') { mode = "string"; quote = c; continue; }
    if (opens.has(c)) stack.push(c);
    else if (Object.hasOwn(closes, c)) {
      assert.equal(stack.pop(), closes[c], "Unbalanced rules near offset " + i);
    }
  }
  assert.equal(mode, "code", "Unclosed string or block comment");
  assert.equal(stack.length, 0, "Unbalanced rules blocks");
});
