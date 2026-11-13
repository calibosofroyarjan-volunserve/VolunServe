'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { surgicalRules, validateDiff, validatePermissions, rollbackTarget, transaction, versionName, rulesetName, EXPECTED } = require('./release-announcements-pr500.cjs');
const { parseSessions, preflight } = require('./verify-announcements-pr500-roles.cjs');
const start = '    match /announcements/{announcementId} {';
const end = '    match /identityVerifications/{uid} {';
const before = 'header\n' + start + '\nold\n    }\n' + end + '\nunchanged';
const after = before.replace('old\n', 'new\n');
test('only the announcements block changes, preserving active unrelated policy', () => {
  const active = before.replace('header', 'active header');
  assert.equal(surgicalRules(active, before, after), after.replace('header', 'active header'));
  assert.throws(() => surgicalRules(active, before, after.replace('unchanged', 'changed')));
  assert.throws(() => surgicalRules(active.replace('old\n', 'drift\n'), before, after));
  assert.throws(() => surgicalRules(active + start, before, after));
});
test('exact source scope rejects development backlog, deleted paths and missing files', () => {
  validateDiff(EXPECTED);
  assert.throws(() => validateDiff([...EXPECTED, 'M\tbackend/server.js']));
  assert.throws(() => validateDiff([...EXPECTED.slice(1)]));
  assert.throws(() => validateDiff(EXPECTED.map(x => x.replace('M\tfirestore.rules', 'D\tfirestore.rules'))));
});
test('read-only credentials cannot pass production publisher IAM', () => {
  assert.throws(() => validatePermissions([]));
  assert.throws(() => validatePermissions(['firebasehosting.sites.update']));
  validatePermissions(['firebaserules.rulesets.create', 'firebaserules.releases.update', 'firebasehosting.sites.update']);
});
test('rollback restores only the owned deployment and rejects concurrent releases', () => {
  assert.equal(rollbackTarget('old', 'old', 'ours'), null);
  assert.equal(rollbackTarget('ours', 'old', 'ours'), 'old');
  assert.throws(() => rollbackTarget('someone-else', 'old', 'ours'));
  assert.throws(() => versionName('sites/foreign/versions/v1'));
  assert.throws(() => rulesetName('projects/foreign/rulesets/a'));
  versionName('sites/volunserve-3aa5b/versions/abc_123');
});
test('QA access requires verified, unexpired, distinct production user sessions', () => {
  const now = Date.now();
  const token = (uid, extra = {}) => 'test.' + Buffer.from(JSON.stringify({ sub: uid, aud: 'volunserve-3aa5b', iss: 'https://securetoken.google.com/volunserve-3aa5b', email_verified: true, exp: now / 1000 + 3600, ...extra })).toString('base64url') + '.test';
  const sessions = Object.fromEntries(['admin', 'resident', 'volunteer'].map(r => [r, { idToken: token(r) }]));
  parseSessions(JSON.stringify(sessions), now);
  assert.throws(() => parseSessions('', now));
  assert.throws(() => parseSessions(JSON.stringify({ ...sessions, resident: { idToken: token('admin') } }), now));
  assert.throws(() => parseSessions(JSON.stringify({ ...sessions, resident: { idToken: token('resident', { email_verified: false }) } }), now));
  assert.throws(() => parseSessions(JSON.stringify({ ...sessions, resident: { idToken: token('resident', { exp: now / 1000 + 30 }) } }), now));
  assert.throws(() => parseSessions(JSON.stringify({ ...sessions, resident: { idToken: token('resident', { aud: 'another-project' }) } }), now));
});
function simulatedRelease(options = {}) {
  let host = 'old-host', rules = 'old-rules';
  const writes = [], report = {};
  return { report, writes, current: () => ({ host, rules }), args: {
    originalVersion: host, originalRuleset: rules, stagedVersion: 'our-host', stagedRuleset: 'our-rules',
    getHostingVersion: async () => host, getRulesName: async () => rules,
    publishHosting: async value => { writes.push('hosting:' + value); host = value; },
    patchRules: async value => { writes.push('rules:' + value); rules = value; if (options.lostRulesResponse && value === 'our-rules') throw Error('response lost after Rules applied'); },
    verify: async () => { if (options.concurrent) host = 'independent-host'; if (options.regression || options.concurrent) throw Error('feed regression'); },
    report, save: () => {}
  } };
}
test('a verified release keeps the new Hosting and Rules pair', async () => {
  const r = simulatedRelease(); await transaction(r.args);
  assert.equal(r.report.status, 'DEPLOYED_AND_VERIFIED');
  assert.deepEqual(r.current(), { host: 'our-host', rules: 'our-rules' });
});
test('post-release regression restores Hosting before Rules', async () => {
  const r = simulatedRelease({ regression: true });
  await assert.rejects(transaction(r.args), /feed regression/);
  assert.deepEqual(r.writes, ['rules:our-rules', 'hosting:our-host', 'hosting:old-host', 'rules:old-rules']);
  assert.equal(r.report.status, 'ROLLED_BACK');
});
test('lost API response still restores an applied Rules mutation', async () => {
  const r = simulatedRelease({ lostRulesResponse: true });
  await assert.rejects(transaction(r.args), /response lost/);
  assert.deepEqual(r.current(), { host: 'old-host', rules: 'old-rules' });
  assert.equal(r.report.status, 'ROLLED_BACK');
});
test('recovery preserves another publisher and records incomplete rollback', async () => {
  const r = simulatedRelease({ concurrent: true });
  await assert.rejects(transaction(r.args), /manual recovery required/);
  assert.equal(r.report.status, 'ROLLBACK_REQUIRES_OPERATOR');
  assert.deepEqual(r.writes, ['rules:our-rules', 'hosting:our-host']);
});
test('authorized role verification creates and removes only its unique QA record', async t => {
  const database = 'projects/volunserve-3aa5b/databases/(default)/documents';
  const oldName = database + '/announcements/existing';
  const old = { name: oldName, fields: { title: { stringValue: 'Historical announcement' }, audience: { stringValue: 'all' } }, updateTime: '2026-11-01T00:00:00Z' };
  const records = new Map([[oldName, old]]);
  const writes = [];
  const now = Date.now();
  const sessions = Object.fromEntries(['admin', 'resident', 'volunteer'].map(role => [role, { idToken: 'test.' + Buffer.from(JSON.stringify({ sub: role, aud: 'volunserve-3aa5b', iss: 'https://securetoken.google.com/volunserve-3aa5b', email_verified: true, exp: now / 1000 + 3600 })).toString('base64url') + '.test' }]));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const token = options.headers.Authorization.slice(7);
    const role = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub;
    const route = url.slice('https://firestore.googleapis.com/v1/'.length);
    const json = x => new Response(JSON.stringify(x), { status: 200 });
    if (route.includes('/users/')) return json({ fields: { role: { stringValue: role }, status: { stringValue: 'approved' }, adminStatus: { stringValue: 'active' } } });
    if (route.endsWith(':runQuery')) {
      assert.equal(JSON.parse(options.body).structuredQuery.where.fieldFilter.value.stringValue, 'all');
      return json([...records.values()].map(document => ({ document })));
    }
    if (route.endsWith(':commit')) {
      assert.equal(role, 'admin');
      const write = JSON.parse(options.body).writes[0];
      assert.equal(write.currentDocument.exists, false);
      assert(write.updateTransforms.some(f => f.fieldPath === 'publishAt' && f.setToServerValue === 'REQUEST_TIME'));
      assert(write.update.name.startsWith(database + '/announcements/release-qa-pr500-'));
      writes.push(write.update.name);
      records.set(write.update.name, { ...write.update, updateTime: '2026-11-14T00:00:00Z' });
      return json({});
    }
    const name = route.split('?')[0];
    if (options.method === 'DELETE') {
      assert.notEqual(name, oldName);
      assert(route.includes('currentDocument.updateTime='));
      records.delete(name); return json({});
    }
    return records.has(name) ? json(records.get(name)) : new Response('{}', { status: 404 });
  });
  const qa = await preflight(JSON.stringify(sessions));
  assert.equal(writes.length, 0, 'preflight must not publish');
  const result = await qa.verify();
  assert.equal(result.adminPublish, 'PASS');
  assert.equal(result.residentHistoricalAndNewFeed, 'PASS');
  assert.equal(result.volunteerHistoricalAndNewFeed, 'PASS');
  assert.equal(writes.length, 1);
  assert.deepEqual([...records.values()], [old]);
});
