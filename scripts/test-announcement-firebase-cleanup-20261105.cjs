"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const create=fs.readFileSync("app/(admin)/create-announcement.tsx","utf8");
const feed=fs.readFileSync("app/(tabs)/announcements.tsx","utf8");
const root=fs.readFileSync("app/_layout.tsx","utf8");
for(const token of [
  'import { AppAlert } from "../../lib/appDialog";',
  'publishingRef.current = true;',
  'if (publishingRef.current || submitting) return;',
  'publishingRef.current = false;',
  "audience: publishBarangay",
  'const publishBarangay = barangay;',
  'setPublishError(message)',
  'code === "permission-denied"',
  'code === "unavailable"',
  'The announcement was published to your authorized community.',
]) assert(create.includes(token),"Missing safe LGU post handling: "+token);
assert(!/(^|[^.])Alert\.alert\(/m.test(create.replaceAll("AppAlert.alert(","")), "No raw React Native Alert calls");
assert(!create.includes("error?.message ||"),"Never display raw Firebase technical exceptions");
assert(create.includes("Complete My Official Barangay"),"Keep legacy authorized-area setup");
for(const token of [
  "canReadAnnouncements = Boolean(user && isApprovedProfile(profile))",
  "if (sessionLoading) return;",
  "if (!canReadAnnouncements)",
  "setInterval(() => setRefreshKey(value => value + 1), 30_000)",
  'where("publishAt", "<=", Timestamp.now())',
  'orderBy("publishAt", "desc")',
  'onPress={() => setRefreshKey(value => value + 1)}',
  "unsubscribe();",
  'code === "failed-precondition"',
  'audience === normalizedBarangay',
]) assert(feed.includes(token),"Missing Firestore feed safety: "+token);
assert(root.includes("<AppDialogHost />"),"Branded dialog host must be present");
console.log("PASS: guarded LGU publishing with cross-platform dialogs + draft retention, authenticated retryable feed, rotating published-only listener.");
