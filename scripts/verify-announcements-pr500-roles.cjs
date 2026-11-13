'use strict';
// Authorized Firebase user ID tokens only; never service-account bypass.
// Creates and removes one uniquely named QA announcement. Existing records are read only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const PROJECT = 'volunserve-3aa5b';
const ROOT = 'https://firestore.googleapis.com/v1/';
const DATABASE = 'projects/' + PROJECT + '/databases/(default)';
const DOCUMENTS = DATABASE + '/documents';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function parseSessions(raw, now = Date.now()) {
  let sessions;
  try { sessions = JSON.parse(raw || 'null'); }
  catch { throw Error('BLOCKED: malformed QA session secret; credential content omitted'); }
  assert(sessions, 'BLOCKED: authorized QA sessions required in production environment secret VOLUNSERVE_ANNOUNCEMENTS_QA_SESSIONS');
  const ids = new Set();
  for (const role of ['admin', 'resident', 'volunteer']) {
    const idToken = sessions[role]?.idToken;
    assert(typeof idToken === 'string' && idToken.split('.').length === 3, 'BLOCKED: missing QA ' + role + ' ID token');
    let claims;
    try { claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()); }
    catch { throw Error('BLOCKED: invalid QA ID token; credential content omitted'); }
    assert.equal(claims.aud, PROJECT, 'BLOCKED: QA session project mismatch');
    assert.equal(claims.iss, 'https://securetoken.google.com/' + PROJECT);
    assert(claims.email_verified === true, 'BLOCKED: QA session email not verified');
    assert(Number(claims.exp) * 1000 > now + 10 * 60 * 1000, 'BLOCKED: QA session needs at least ten minutes validity');
    assert(typeof claims.sub === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(claims.sub), 'BLOCKED: invalid QA UID');
    assert(!ids.has(claims.sub), 'BLOCKED: three distinct QA accounts required');
    ids.add(claims.sub); sessions[role] = { idToken, uid: claims.sub };
  }
  return sessions;
}
async function preflight(raw) {
  const sessions = parseSessions(raw);
  async function request(role, suffix, method = 'GET', body, allow404 = false) {
    const r = await fetch(ROOT + suffix, { method, headers: { Authorization: 'Bearer ' + sessions[role].idToken, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    if (r.status === 404 && allow404) return null;
    const data = await r.json().catch(() => ({}));
    assert(r.ok, 'QA ' + role + ' request failed: HTTP ' + r.status + ' (' + String(data.error?.status || 'unknown') + ')');
    return data;
  }
  for (const role of Object.keys(sessions)) {
    const profile = await request(role, DOCUMENTS + '/users/' + sessions[role].uid);
    assert.equal(profile.fields?.role?.stringValue?.toLowerCase(), role, 'BLOCKED: QA role mismatch');
    assert.equal(profile.fields?.status?.stringValue, 'approved', 'BLOCKED: QA profile not approved');
    if (role === 'admin') assert.equal(profile.fields?.adminStatus?.stringValue, 'active', 'BLOCKED: inactive QA Admin');
  }
  const feed = role => request(role, DOCUMENTS + ':runQuery', 'POST', { structuredQuery: { from: [{ collectionId: 'announcements' }], where: { fieldFilter: { field: { fieldPath: 'audience' }, op: 'EQUAL', value: { stringValue: 'all' } } } } });
  const documents = rows => rows.filter(x => x.document).map(x => x.document);
  const original = documents(await feed('admin'));
  assert(original.length > 0, 'BLOCKED: historical announcement baseline unexpectedly empty');
  const originalHashes = new Map(original.map(d => [d.name, digest(d.fields)]));
  return {
    async verify() {
      // Rules changes can take time to propagate to user-facing requests.
      for (let attempt = 0; attempt < 12; attempt++) {
        try { await feed('resident'); await feed('volunteer'); break; }
        catch (error) { if (attempt === 11) throw error; await new Promise(resolve => setTimeout(resolve, 10000)); }
      }
      const name = DOCUMENTS + '/announcements/release-qa-pr500-' + crypto.randomUUID();
      const title = 'Announcement release verification (temporary QA)';
      const uid = sessions.admin.uid;
      let created = false;
      try {
        await request('admin', DOCUMENTS + ':commit', 'POST', { writes: [{
          update: { name, fields: {
            title: { stringValue: title }, message: { stringValue: 'Temporary authorized verification of announcement publishing and Resident/Volunteer feeds.' },
            audience: { stringValue: 'all' }, priority: { stringValue: 'normal' }, linkUrl: { stringValue: '' }, imageUrl: { stringValue: '' }, createdBy: { stringValue: uid }
          } }, currentDocument: { exists: false }, updateTransforms: ['publishAt', 'createdAt', 'updatedAt'].map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }))
        }] });
        created = true;
        for (const role of ['resident', 'volunteer']) {
          const rows = documents(await feed(role));
          assert(rows.some(d => d.name === name), 'Regression: new Admin announcement absent from ' + role + ' feed');
          const hashes = new Map(rows.map(d => [d.name, digest(d.fields)]));
          for (const [oldName, oldHash] of originalHashes) assert.equal(hashes.get(oldName), oldHash, 'Regression: historical announcement missing or changed');
        }
      } finally {
        // Also clean up if the commit succeeded but its response was lost.
        const own = await request('admin', name, 'GET', undefined, true);
        if (own) {
          assert.equal(own.fields?.createdBy?.stringValue, uid, 'Refusing cleanup of a foreign record');
          assert.equal(own.fields?.title?.stringValue, title, 'Refusing cleanup of an unrelated record');
          await request('admin', name + '?currentDocument.updateTime=' + encodeURIComponent(own.updateTime), 'DELETE');
        }
      }
      assert(created, 'Regression: Admin announcement was not published');
      const finalRows = documents(await feed('admin'));
      const finalHashes = new Map(finalRows.map(d => [d.name, digest(d.fields)]));
      assert(!finalHashes.has(name), 'QA announcement cleanup not verified');
      for (const [oldName, oldHash] of originalHashes) assert.equal(finalHashes.get(oldName), oldHash, 'Existing announcement changed during verification');
      return { adminPublish: 'PASS', residentHistoricalAndNewFeed: 'PASS', volunteerHistoricalAndNewFeed: 'PASS', temporaryPostRemoved: true, existingAnnouncementsUnchanged: true, method: 'production Firestore API with authorized Firebase user ID tokens; browser interaction not exercised' };
    }
  };
}
module.exports = { parseSessions, preflight };
