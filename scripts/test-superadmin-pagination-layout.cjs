"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Pagination uses two stable rows so paired dashboard table headers align", () => {
  const src = read("components/ui/ListPagination.tsx");
  assert.match(src, /<View style=\{styles\.summaryRow\}>/);
  assert.match(src, /<View style=\{styles\.controlsRow\}>/);
  assert.match(src, /container:\{width:"100%",flexDirection:"column"/);
  assert.match(src, /summaryRow:\{width:"100%",minHeight:18/);
  assert.match(src, /controlsRow:\{width:"100%",minHeight:44/);
  assert.match(src, /buttons:\{width:"100%",minHeight:44,flexDirection:"row",flexWrap:"wrap"/);
  assert.match(src, /justifyContent:"flex-end",gap:6/);
  assert.match(src, /marginBottom:10/);
});

test("One-page view is compact, while multi-page view keeps usable previous, numbered and next buttons", () => {
  const src = read("components/ui/ListPagination.tsx");
  assert.match(src, /pages === 1 \?/);
  assert.match(src, /<Text style=\{styles\.pageStatusText\}>Page \{safePage\} of \{pages\}<\/Text>/);
  assert.match(src, /Math\.ceil\(total \/ pageSize\)/);
  assert.match(src, /Math\.min\(safePage \* pageSize, total\)/);
  assert.match(src, /visiblePages\.map\(number =>/);
  assert.match(src, /disabled=\{safePage <= 1\}/);
  assert.match(src, /disabled=\{safePage >= pages\}/);
  assert.match(src, /onPress=\{\(\) => onChange\(number\)\}/);
  assert.match(src, /minHeight:44/);
});

test("All Super Admin records reuse exactly the five-record pagination component", () => {
  for (const file of [
    "app/(superadmin)/index.tsx",
    "app/(superadmin)/admin-accounts.tsx",
    "app/(superadmin)/admin-logs.tsx",
    "app/(superadmin)/all-records.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /import ListPagination from "\.\.\/\.\.\/components\/ui\/ListPagination";/, file);
    assert.match(src, /<ListPagination /, file);
    assert.match(src, /(?:PAGE_SIZE|ADMIN_PAGE_SIZE) = 5/, file);
  }
  const dashboard = read("app/(superadmin)/index.tsx");
  assert.match(dashboard, /title="Recent LGU Admin Activity"/);
  assert.match(dashboard, /title="System & Access Changes"/);
  assert.match(dashboard, /<ListPagination page=\{page\} total=\{total\}/);
});
