"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../app/(tabs)/donation.tsx"), "utf8");

test("resident Donations no longer imports or renders presentation dog donation demo", () => {
  assert.doesNotMatch(source, /DogsCampaignDemo/);
  assert.doesNotMatch(source, /A deliberately isolated presentation sample/);
  assert.doesNotMatch(source, /View Dog Donation Details|PRESENTATION DEMO/);
});

test("only real Firestore campaigns appear in active and completed lists", () => {
  assert.match(source, /listedCampaigns\.map\(/);
  assert.match(source, /campaignsReady/);
  assert.match(source, /showCompletedCampaigns/);
  assert.match(source, /No verified campaigns are currently open for donations/);
});

test("premium donations hero, donation history, PayMongo checkout and details remain intact", () => {
  for (const feature of [
    "DonationHeroArt", "PremiumCampaignDetails",
    "myDonations.map", "verifiedRaisedTotal", "checkoutUrl",
    "How Donations Work", "Every act of giving starts somewhere",
  ]) assert.ok(source.includes(feature), "Missing original feature: " + feature);
});
