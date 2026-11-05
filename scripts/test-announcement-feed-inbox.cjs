"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {eligibleRecipient, normalizeScope} =
  require("../functions/announcementAudience");

const resident = (barangay, extras = {}) => ({
  role: "resident", status: "approved", barangay, ...extras,
});

assert.equal(normalizeScope(" MUZON "), "muzon");
assert.equal(eligibleRecipient(resident("Muzon"), "Muzon"), true);
assert.equal(eligibleRecipient(resident(" muzon "), " MUZON "), true);
assert.equal(eligibleRecipient(resident("Tungko"), "Muzon"), false);
assert.equal(eligibleRecipient(resident(""), "Muzon"), false);
assert.equal(eligibleRecipient(resident("Muzon"), ""), false);
assert.equal(eligibleRecipient(resident("Muzon"), "all"), true);
assert.equal(eligibleRecipient(resident("Tungko"), "ALL"), true);
assert.equal(eligibleRecipient(resident("Muzon", {status: "pending"}), "all"), false);
assert.equal(eligibleRecipient(resident("Muzon", {status: "suspended"}), "all"), false);
assert.equal(eligibleRecipient({role: "admin", status: "approved",
  barangay: "Muzon"}, "Muzon"), false);
assert.equal(eligibleRecipient({role: "superadmin", status: "approved",
  barangay: "Muzon"}, "all"), false);
assert.equal(eligibleRecipient({role: "applicant",
  barangay: "Muzon"}, "all"), false);
assert.equal(eligibleRecipient({role: "volunteer", status: "approved",
  barangay: "Muzon", volunteerAccess: true}, "Muzon"), true);
assert.equal(eligibleRecipient({role: "resident", status: "approved",
  barangay: "Muzon", residentAccess: true}, "Muzon"), true);

const file = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const home = file("components/home/Home.web.tsx");
const announcementPage = file("app/(tabs)/announcements.tsx");
const inbox = file("app/(tabs)/notifications.tsx");
const trigger = file("functions/announcementNotifications.js");
const server = file("functions/index.js");
const rules = file("firestore.rules");

assert.match(home, /const residentBarangay = String\(profile\?\.barangay \|\| ""\)/);
assert.doesNotMatch(home, /item\.audience === profile\?\.role/);
assert.match(home, /audience === "all"/);
assert.match(home, /announcementQueryTime/);
assert.match(home, /setAnnouncementsError\(true\)/);
assert.match(announcementPage, /announcementQueryTime/);
assert.match(inbox, /Announcements" \| "Account"/);
assert.match(inbox, /announc\|community_update\|advisory/);
assert.match(trigger, /document: "announcements\/\{announcementId\}"/);
assert.match(trigger, /eligibleRecipient\(userDoc\.data\(\), audience\)/);
assert.match(trigger, /batch\.create\(references\[index\]/);
assert.match(trigger, /if \(notificationSnapshot\.exists\) return;/);
assert.match(trigger, /userId: recipients\[index\]\.id/);
assert.match(trigger, /type: "community_announcement"/);
assert.match(server, /exports\.notifyAnnouncementAudience/);
assert.match(rules, /request\.resource\.data\.audience == profile\(\)\.barangay/);

console.log("PASS scoped local/global announcements, feed refresh, private inbox and retry safety");
