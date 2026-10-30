"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path, "utf8");

const emergency = read("app/(admin)/admin-cases.tsx");
const assistance = read("app/(admin)/assistance-requests.tsx");
const nav = read("app/(admin)/_layout.tsx");
const hero = read("components/admin/AdminReviewHero.tsx");

for (const [title, source, label] of [
  ["Emergency Reports", emergency, "Emergency Reports"],
  ["Assistance Requests", assistance, "Assistance Requests"],
]) {
  assert(source.includes('import AdminReviewHero from "../../components/admin/AdminReviewHero"'), title + " must use the shared LGU Admin component");
  assert(source.includes("<AdminReviewHero") && source.includes('title="' + label + '"'),
    title + " should have a correctly named, consistent operational header");
  assert(source.includes("ListPagination") && source.includes("pageSize={5}"),
    title + " must preserve five-record pagination");
  assert(source.includes("onSnapshot"),
    title + " must continue using real Firestore records");
  assert(nav.includes('label: "' + label + '"'), title + " must match the Admin sidebar and thesis workflow");
}
assert(hero.includes('backgroundColor: "#E5F5ED"') &&
  hero.includes('name="leaf-outline"') &&
  hero.includes("subtitle"), "Branded LGU Admin hero must retain its emerald/mint design");

assert(emergency.includes("setSelectedCaseId(item.id)") &&
  emergency.includes("filterSeverity") &&
  emergency.includes("filterStatus") &&
  emergency.includes("caseSearch") &&
  emergency.includes("ResponseAssignment"),
  "Emergency incident selection, filters and responder management must remain intact");

for (const filter of ["all", "pending", "under_review", "verified", "rejected", "completed"]) {
  assert(assistance.includes('setFilter("' + filter + '"); setRecordPage(1);'),
    "Assistance filter " + filter + " must reset the review queue to the first page");
}
assert(assistance.includes("saveVerificationDraft") &&
  assistance.includes("saveResourceAssessment") &&
  assistance.includes("renderDecisionRail") &&
  assistance.includes("openDocument"),
  "Private Admin evidence review and assisted-decision actions must remain intact");
assert(!nav.includes('label: "Relief Operations"'), "Retired standalone Relief Operations must not appear in Admin navigation");
assert(read("app/(admin)/relief-operations.tsx").includes('<Redirect href="/(admin)/command-center" />'),
  "Old Relief Operations URLs must redirect to the approved Command Center");
console.log("PASS: LGU Admin Emergency & Assistance headers, filter pagination, and retired Relief Operations route");
