"use strict";
// No production network or writes. Tests the exact live-source announcement fix.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {eligibleRecipient, normalizeScope} =
  require("../functions/announcementAudience");

const resident = (barangay, extra = {}) => ({
  role: "resident", status: "approved", barangay, ...extra,
});
assert.equal(normalizeScope(" MUZON "), "muzon");
assert.equal(eligibleRecipient(resident("Muzon"), "Muzon"), true);
assert.equal(eligibleRecipient(resident("  muzon "), "MUZON"), true);
assert.equal(eligibleRecipient(resident("Tungko"), "Muzon"), false);
assert.equal(eligibleRecipient(resident(""), "Muzon"), false);
assert.equal(eligibleRecipient(resident("Muzon"), "ALL"), true);
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
const file = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const home = file("components/home/Home.web.tsx");
const page = file("app/(tabs)/announcements.tsx");
const inbox = file("app/(tabs)/notifications.tsx");
const sender = file("functions/announcementNotifications.js");
const functions = file("functions/index.js");
const rules = file("firestore.rules");
const liveAdmin = file("app/(admin)/create-announcement.tsx");

assert.match(home, /const residentBarangay = String\(profile\?\.barangay \|\| ""\)/);
assert.doesNotMatch(home, /item\.audience === profile\?\.role/);
assert.match(home, /setAnnouncementsError\(true\)/);
assert.match(home, /announcementQueryTime/);
assert.match(home, /audience === "all"/);
assert.match(page, /where\("publishAt", "<=", Timestamp\.fromMillis\(nowMs\)\)/);
assert.match(page, /orderBy\("publishAt", "desc"\)/);
assert.doesNotMatch(page, /where\("audience", "in", allowedAudiences\)/);
assert.match(page, /normalizedBarangay/);
assert.match(inbox, /Announcement/);
assert.match(inbox, /where\("userId", "==", uid\)/);
assert.match(sender, /document: "announcements\/\{announcementId\}"/);
assert.match(sender, /eligibleRecipient\(userDoc\.data\(\), audience\)/);
assert.match(sender, /batch\.create\(references\[index\]/);
assert.match(sender, /if \(notificationSnapshot\.exists\) return;/);
assert.match(sender, /userId: recipients\[index\]\.id/);
assert.match(sender, /type: "community_announcement"/);
assert.match(functions, /exports\.notifyAnnouncementAudience/);
assert.match(rules, /resource\.data\.publishAt <= request\.time/);
assert.match(liveAdmin, /The announcement was published to your authorized community/);
console.log("PASS live-based announcements: correct barangay, published-only query, notification inbox and untouched Admin form");
