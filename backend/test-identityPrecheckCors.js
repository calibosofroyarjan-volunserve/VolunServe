"use strict";
// Guard the exact cross-origin National ID precheck request header.
// This is intentionally offline and contains no ID images, tokens or data.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const s = fs.readFileSync("backend/server.js","utf8");
test("CORS preflight allows the identity ID-document consent header",()=>{
  const corsStart=s.indexOf("app.use(\n  cors({");
  const corsEnd=s.indexOf("}),\n);",corsStart);
  assert.ok(corsStart>=0 && corsEnd>corsStart,"CORS middleware must remain configured");
  const corsBlock=s.slice(corsStart,corsEnd);
  const headerMatch=corsBlock.match(/allowedHeaders:\s*\[([\s\S]*?)\]/);
  assert.ok(headerMatch,"CORS allowedHeaders must be explicit");
  const headers=[...headerMatch[1].matchAll(/"([^"]+)"/g)].map(x=>x[1].toLowerCase());
  for(const value of ["authorization","x-volunserve-document-precheck-consent","content-type"]){
    assert.ok(headers.includes(value), "Missing preflight header: "+value);
  }
  assert.match(s,/request\.headers\["x-volunserve-document-precheck-consent"\] !== "true"/);
  assert.match(s,/app\.post\(\s*"\/api\/identity\/document\/precheck"/);
});
