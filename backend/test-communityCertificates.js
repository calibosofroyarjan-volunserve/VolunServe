"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const store = new Map();
let mutations = 0;
function ref(collection, id) {
  return {path: `${collection}/${id}`, id, async get() { return snap(this); }};
}
function snap(r) {
  const value = store.get(r.path);
  return {id: r.id, exists: !!value, data: () => value};
}
const db = {
  collection(name) {
    return {
      doc: (id) => ref(name, id),
      where(field, op, value) {
        assert.equal(op,"==");
        return {limit(max) {
          return {async get() {
            const docs = Array.from(store.entries()).filter(([k,v]) => k.startsWith(`${name}/`) && v[field] === value)
              .slice(0,max).map(([k]) => snap(ref(name,k.slice(name.length+1))));
            return {size:docs.length,docs};
          }};
        }};
      }
    };
  },
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      get: async r => snap(r),
      create: (r, v) => writes.push({type:"create",r,v}),
      set: (r, v) => writes.push({type:"set",r,v}),
    };
    const result = await fn(tx);
    for (const w of writes) {
      if (w.type === "create" && store.has(w.r.path)) throw new Error("already exists");
      store.set(w.r.path, w.v); mutations++;
    }
    return result;
  }
};
const FieldValue = {serverTimestamp: () => ({serverTimestamp: true})};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === "./firebaseAdmin" && parent?.filename.endsWith("communityCertificates.js")) return {db, FieldValue};
  return original.apply(this, arguments);
};
const modulePath = path.join(__dirname, "communityCertificates.js");
const service = require(modulePath);
Module._load = original;
const ts = n => ({toMillis: () => n});
const event = {publicationStatus:"published", status:"completed", date:"2026-10-20", title:"Community Cleanup",location:"Barangay Muzon",completedBy:"admin-123",proposedBy:"other-resident"};
function attend(minutes){return {uid:"vol-123",eventId:"evt-123",status:"joined",attendanceVerified:true,attendanceVerifiedBy:"admin-123",checkedInAt:ts(1_700_000_000_000),checkedOutAt:ts(1_700_000_000_000+minutes*60_000)};}
async function test() {
  store.set("communityEvents/evt-123",event);
  store.set("communityEventParticipants/evt-123_vol-123",attend(29));
  store.set("users/vol-123", {fullName:"Demo Volunteer"});
  let r=await service.reconcileCommunityEventCertificates({eventId:"evt-123"});
  assert.equal(r.dryRun,true); assert.equal(r.eligibleCount,0); assert.equal(mutations,0);
  r=await service.reconcileCommunityEventCertificates({eventId:"evt-123",execute:true});
  assert.equal(r.issuedCount,0); assert.equal(mutations,0);
  store.set("communityEventParticipants/evt-123_vol-123",attend(30));
  r=await service.reconcileCommunityEventCertificates({eventId:"evt-123"});
  assert.equal(r.eligibleCount,1); assert.equal(mutations,0);
  r=await service.reconcileCommunityEventCertificates({eventId:"evt-123",execute:true});
  assert.equal(r.issuedCount,1); assert.equal(mutations,3);
  const id=service.communityCertificateId("evt-123","vol-123","2026-10-20");
  assert.equal(store.get("certificates/"+id).verifiedServiceMinutes,30);
  assert.equal(store.get("publicCertificateVerifications/"+id).volunteerId,undefined);
  assert.equal(store.get("certificates/"+id).certificateType,"community_event_participation");
  r=await service.reconcileCommunityEventCertificates({eventId:"evt-123",execute:true});
  assert.equal(r.issuedCount,0); assert.equal(r.alreadyExistingCount,1); assert.equal(mutations,3);
  console.log("LOCAL PASS: 29m rejected; 30m issued; dry-run read-only; no duplicate; public data minimized.");
}
test().catch(e=>{console.error(e);process.exitCode=1;});
