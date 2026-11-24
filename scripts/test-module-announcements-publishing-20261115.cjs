"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");

const publisher = read("lib/publishModuleAnnouncement.ts");
const events = read("app/(admin)/community-events.tsx");
const donations = read("app/(admin)/donation-list.tsx");

// A single publication for a verified, already-public event or donation campaign.
assert(publisher.includes('"communityEvents" : "donationCampaigns"'));
assert(publisher.includes('data.publicationStatus !== "published"'));
assert(publisher.includes('data.status !== "upcoming"'));
assert(publisher.includes('data.status !== "published"'));
assert(publisher.includes('Number(data.monetaryGoal) > 0'));
assert(publisher.includes('community_event_'));
assert(publisher.includes('donation_campaign_'));
assert(publisher.includes('if (announcementSnapshot.exists()) return "already_published"'));
assert(publisher.includes('const announcementSnapshot = await tx.get(announcementRef)'));
assert(publisher.includes('tx.set(announcementRef, {'));
assert(!publisher.includes('tx.update(sourceRef,'));
assert(!publisher.includes('tx.set(sourceRef,'));

// Keep the currently authorized Announcements schema: no source ids or private metadata.
for (const s of [
  'title,', 'message,', 'linkUrl: ""', 'imageUrl: ""',
  'audience: "all"', 'priority: "normal"', 'publishAt: serverTimestamp()',
  'createdBy: adminUid', 'createdAt: serverTimestamp()', 'updatedAt: serverTimestamp()'
]) assert(publisher.includes(s), "Missing current Announcements schema field "+s);
for (const sensitive of [
  'reporterName','fullName','donorDisplayName','medical','identity','photoUrls',
  'homeAddress','phone','latitude','longitude','bank','paymongo','transactionReference',
  'sourceId,','campaignId:','eventId:'
]) assert(!publisher.includes("data."+sensitive), "Sensitive source field copied: "+sensitive);

// Community Events approval stays authoritative and has a deliberate opt-in.
assert(events.includes("tx.set(eventRef, {"));
assert(events.includes("tx.update(proposalRef, {"));
assert(events.includes('if (announceImportantEvents[item.id])'));
assert(events.includes('kind: "event", sourceId: item.id, adminUid: user.uid'));
assert(events.indexOf('const outcome = await publishModuleAnnouncement(') >
       events.indexOf('await runTransaction(db, async (tx) => {'));
assert(events.includes('Important event: automatically announce after Approve & Publish'));
assert(events.includes('Retry community announcement'));
assert(events.includes('const rejectProposal = async (item: Proposal) => {'));

// Donation campaign MUST be created and validated by backend first.
assert(donations.includes('const published = await secureAdminPost("/api/admin/donations/campaigns"'));
assert(donations.includes('const publishedCampaignId = typeof published?.campaignId === "string"'));
assert(donations.includes('kind: "donation", sourceId: publishedCampaignId, adminUid: user.uid'));
assert(donations.indexOf('kind: "donation", sourceId: publishedCampaignId') >
       donations.indexOf('const published = await secureAdminPost("/api/admin/donations/campaigns"'));
assert(donations.includes('Retry Public Campaign Announcement'));
assert(donations.includes('The campaign is live. Its public announcement was not posted'));
assert(donations.includes('Campaign Published — Announcement Failed'));
assert(!publisher.includes("collection(db, \"donations\")"));
console.log("PASS events + donations verified publication → one privacy-safe Announcements entry, with independent failure and no payment/attendance changes");
