'use strict';
// One-time, protected controller for the exact PR #500 artifact.
// No Firestore document or Firebase Auth mutations. Inspect is the default.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const PROJECT = 'volunserve-3aa5b';
const BASE = '2cd63d318ecb6b0dfc52706308e05d0b5806d874';
const CANDIDATE = '5b7f769d3db8a906309f962930306a4c863a026c';
const ORIGINAL_HASH = 'c0357e65000588269c92ef98e67d422eb19f1d3d889aab4f3a2d650924649296';
const RELEASE = 'projects/' + PROJECT + '/releases/cloud.firestore';
const RULES = 'https://firebaserules.googleapis.com/v1/';
const HOSTING = 'https://firebasehosting.googleapis.com/v1beta1/';
const SITE = 'sites/' + PROJECT;
const EXPECTED = [
  'A\t.github/workflows/validate-announcements-hotfix-no-deploy-20261114.yml',
  'M\tapp/(admin)/create-announcement.tsx', 'M\tapp/(tabs)/announcements.tsx',
  'M\tcomponents/home/Home.web.tsx', 'M\tfirestore.rules', 'M\tlib/announcementAlerts.ts',
  'A\tscripts/publish-announcements-rules-safely.cjs',
  'A\tscripts/test-announcements-published-audience-emulator.cjs'
].sort();
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function announcementBlock(s) {
  const start = '    match /announcements/{announcementId} {';
  const end = '    match /identityVerifications/{uid} {';
  const i = s.indexOf(start), j = s.indexOf(end, i);
  assert(i >= 0 && j > i && s.indexOf(start, i + 1) < 0, 'BLOCKED: unexpected announcement boundaries');
  return s.slice(i, j);
}
function surgicalRules(active, baseline, candidate) {
  const before = announcementBlock(baseline), after = announcementBlock(candidate);
  assert.notEqual(before, after, 'BLOCKED: missing announcement change');
  assert.equal(candidate, baseline.replace(before, after), 'BLOCKED: unrelated rules changed');
  assert.equal(announcementBlock(active), before, 'BLOCKED: active announcement policy drift');
  const next = active.replace(before, after);
  assert.equal(next.replace(after, before), active, 'BLOCKED: unrelated active rules changed');
  return next;
}
function validateDiff(lines) {
  assert.deepEqual([...lines].sort(), EXPECTED, 'BLOCKED: candidate differs from PR #500 scope');
}
function validatePermissions(permissions) {
  const required = ['firebaserules.rulesets.create', 'firebaserules.releases.update', 'firebasehosting.sites.update'];
  const missing = required.filter(x => !permissions.includes(x));
  assert.equal(missing.length, 0, 'BLOCKED: production deployment credential lacks IAM: ' + missing.join(', '));
}
function versionName(name) {
  assert.match(name || '', /^sites\/volunserve-3aa5b\/versions\/[A-Za-z0-9_-]+$/, 'BLOCKED: foreign Hosting version');
  return name;
}
function rulesetName(name) {
  assert.match(name || '', /^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/, 'BLOCKED: foreign ruleset');
  return name;
}
// Do not overwrite another deployment while rolling back a failed transaction.
function rollbackTarget(current, original, owned) {
  if (current === original) return null;
  assert.equal(current, owned, 'BLOCKED: concurrent deployment; manual recovery required');
  return original;
}
async function transaction({ originalVersion, originalRuleset, stagedVersion, stagedRuleset, getHostingVersion, getRulesName, publishHosting, patchRules, verify, report, save }) {
  try {
    await patchRules(stagedRuleset);
    assert.equal(await getRulesName(), stagedRuleset);
    await publishHosting(stagedVersion);
    assert.equal(await getHostingVersion(), stagedVersion);
    await verify();
    report.status = 'DEPLOYED_AND_VERIFIED';
  } catch (error) {
    report.failure = error.message;
    try {
      // Restore Hosting first; refuse to overwrite an independent deployment.
      const hostTarget = rollbackTarget(await getHostingVersion(), originalVersion, stagedVersion);
      if (hostTarget) await publishHosting(hostTarget);
      assert.equal(await getHostingVersion(), originalVersion);
      const ruleTarget = rollbackTarget(await getRulesName(), originalRuleset, stagedRuleset);
      if (ruleTarget) await patchRules(ruleTarget);
      assert.equal(await getRulesName(), originalRuleset);
      report.status = 'ROLLED_BACK';
    } catch (recoveryError) {
      report.status = 'ROLLBACK_REQUIRES_OPERATOR';
      report.rollbackFailure = recoveryError.message;
      throw Error(error.message + '; rollback incomplete: ' + recoveryError.message);
    }
    throw error;
  } finally { save(); }
}
async function main() {
  const mode = process.argv[2] || 'inspect';
  assert(['inspect', 'release'].includes(mode), 'BLOCKED: unknown release mode');
  assert.equal(process.env.GITHUB_REPOSITORY, 'calibosofroyarjan-volunserve/VolunServe');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/live-protected', 'BLOCKED: controller must run from protected branch');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'BLOCKED: manual dispatch required');
  assert.equal(process.env.EXPECTED_LIVE_SHA, BASE, 'BLOCKED: unexpected operator baseline');
  const controller = path.resolve(__dirname, '..');
  const site = path.resolve(process.env.ANNOUNCEMENTS_SITE_DIR || path.join(controller, '../site'));
  assert.equal(git(controller, 'rev-parse', 'HEAD'), process.env.GITHUB_SHA);
  assert.equal(git(controller, 'ls-remote', '--heads', 'origin', 'live-protected').split(/\s+/)[0], process.env.GITHUB_SHA, 'BLOCKED: stale protected controller');
  assert.equal(git(site, 'rev-parse', 'HEAD'), CANDIDATE, 'BLOCKED: wrong site source');
  cp.execFileSync('git', ['merge-base', '--is-ancestor', BASE, CANDIDATE], { cwd: site });
  validateDiff(git(site, 'diff', '--name-status', '--no-renames', BASE, CANDIDATE).split('\n'));
  const baseline = cp.execFileSync('git', ['show', BASE + ':firestore.rules'], { cwd: site, encoding: 'utf8' });
  const candidate = fs.readFileSync(path.join(site, 'firestore.rules'), 'utf8');
  let key;
  try { key = JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT || 'null'); }
  catch { throw Error('BLOCKED: malformed production credential; credential content omitted'); }
  assert.equal(key?.project_id, PROJECT, 'BLOCKED: missing matching production ENVIRONMENT credential');
  assert.equal(key.type, 'service_account', 'BLOCKED: service account required');
  // Never use ADC, a developer login, or a repository secret as fallback.
  const { GoogleAuth } = require(path.join(site, 'node_modules/google-auth-library'));
  const client = await new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  async function request(url, method = 'GET', body) {
    const token = await client.getAccessToken();
    assert(token.token, 'BLOCKED: deployment token unavailable');
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error('Production API ' + method + ' HTTP ' + r.status + ': ' + String(data.error?.message || 'request failed').slice(0, 350));
    return data;
  }
  async function marker(expected) {
    const r = await fetch('https://volunserve.com/volunserve-release.json', { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
    assert(r.ok, 'BLOCKED: live marker unavailable');
    const m = await r.json();
    assert.equal(m.app, 'VolunServe'); assert.equal(m.firebaseProject, PROJECT);
    assert.equal(m.revision, expected, 'BLOCKED: live revision changed');
  }
  const getRules = () => request(RULES + RELEASE);
  const getHosting = () => request(HOSTING + SITE + '/channels/live');
  const patchRules = name => request(RULES + RELEASE, 'PATCH', { release: { name: RELEASE, rulesetName: rulesetName(name) }, updateMask: 'rulesetName' });
  const publishHosting = name => request(HOSTING + SITE + '/releases?versionName=' + encodeURIComponent(versionName(name)), 'POST', { message: 'Scoped PR #500 announcements; controller run ' + process.env.GITHUB_RUN_ID });
  await marker(BASE);
  const originalRelease = await getRules();
  const originalRuleset = rulesetName(originalRelease.rulesetName);
  const originalSource = await request(RULES + originalRuleset);
  assert.equal(originalSource.source?.files?.length, 1, 'BLOCKED: unexpected rules source files');
  const active = originalSource.source.files[0].content;
  assert.equal(digest(active), ORIGINAL_HASH, 'BLOCKED: active Firestore source changed');
  const next = surgicalRules(active, baseline, candidate);
  const originalHosting = await getHosting();
  const originalVersion = versionName(originalHosting.release?.version?.name);
  const iam = await request('https://cloudresourcemanager.googleapis.com/v1/projects/' + PROJECT + ':testIamPermissions', 'POST', { permissions: ['firebaserules.rulesets.create', 'firebaserules.releases.update', 'firebasehosting.sites.update'] });
  validatePermissions(iam.permissions || []);
  // Empty tests compile the candidate without reading/writing production documents.
  const compilation = await request(RULES + 'projects/' + PROJECT + ':test', 'POST', { source: { files: [{ name: 'firestore.rules', content: next }] }, testSuite: { testCases: [] } });
  const errors = (compilation.issues || []).filter(i => i.severity === 'ERROR');
  assert.equal(errors.length, 0, 'BLOCKED: production Rules compiler: ' + errors.map(i => i.description).join('; '));
  const report = { mode, baseline: BASE, candidate: CANDIDATE, originalRuleset, originalVersion, originalRulesHash: digest(active), candidateRulesHash: digest(next), iamPermissions: iam.permissions, compilation: 'PASS', unrelatedRulesPreserved: true, credentialSource: 'production environment only', existingRecordsModified: false };
  const stateFile = path.join(process.env.RUNNER_TEMP, 'announcements-pr500-release.json');
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(report, null, 2) + '\n');
  save(); console.log(JSON.stringify(report, null, 2));
  if (mode === 'inspect') return;
  // A release cannot be called complete without authorized three-role verification.
  const qa = await require('./verify-announcements-pr500-roles.cjs').preflight(process.env.VOLUNSERVE_ANNOUNCEMENTS_QA_SESSIONS);
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'dist/volunserve-release.json'), 'utf8'));
  assert.equal(manifest.revision, CANDIDATE); assert.equal(manifest.firebaseProject, PROJECT);
  const credentialFile = path.join(process.env.RUNNER_TEMP, 'announcements-pr500-credential.json');
  const channelId = 'announcements-pr500-' + process.env.GITHUB_RUN_ID;
  fs.writeFileSync(credentialFile, JSON.stringify(key), { mode: 0o600 });
  try {
    cp.execFileSync(process.execPath, [path.join(site, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'hosting:channel:deploy', channelId, '--expires', '1d', '--project', PROJECT, '--non-interactive'], { cwd: site, stdio: 'inherit', env: { ...process.env, FIREBASE_TOKEN: '', GOOGLE_APPLICATION_CREDENTIALS: credentialFile } });
  } finally { fs.unlinkSync(credentialFile); }
  const preview = await request(HOSTING + SITE + '/channels/' + channelId);
  const stagedVersion = versionName(preview.release?.version?.name);
  const previewResponse = await fetch(preview.url + '/volunserve-release.json', { signal: AbortSignal.timeout(15000) });
  assert(previewResponse.ok, 'BLOCKED: staged Hosting marker inaccessible');
  assert.equal((await previewResponse.json()).revision, CANDIDATE, 'BLOCKED: staged artifact differs');
  const created = await request(RULES + 'projects/' + PROJECT + '/rulesets', 'POST', { source: { files: [{ name: originalSource.source.files[0].name, content: next }] } });
  const stagedRuleset = rulesetName(created.name);
  report.stagedVersion = stagedVersion; report.stagedRuleset = stagedRuleset; save();
  // Fail closed after staging if any independent release changed the baseline.
  await marker(BASE);
  assert.equal((await getRules()).rulesetName, originalRuleset, 'BLOCKED: concurrent Rules release');
  assert.equal((await getHosting()).release?.version?.name, originalVersion, 'BLOCKED: concurrent Hosting release');
  assert.equal(git(controller, 'ls-remote', '--heads', 'origin', 'live-protected').split(/\s+/)[0], process.env.GITHUB_SHA, 'BLOCKED: newer controller exists');
  await transaction({ originalVersion, originalRuleset, stagedVersion, stagedRuleset, getHostingVersion: async () => (await getHosting()).release?.version?.name, getRulesName: async () => (await getRules()).rulesetName, publishHosting, patchRules, report, save, verify: async () => {
    let verified = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await marker(CANDIDATE); verified = true; break; }
      catch (error) { if (attempt === 5) throw error; await new Promise(resolve => setTimeout(resolve, 10000)); }
    }
    assert(verified);
    const sourceAfter = await request(RULES + stagedRuleset);
    assert.equal(sourceAfter.source.files[0].content, next);
    assert.equal((await getRules()).rulesetName, stagedRuleset);
    // Public smoke checks are explicitly separate from the authorized role checks.
    for (const route of ['/', '/login', '/admin-login', '/announcements', '/create-announcement', '/community-events', '/disaster-response', '/map-tracking', '/my-cases']) {
      const r = await fetch('https://volunserve.com' + route, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
      assert(r.ok && (r.headers.get('content-type') || '').includes('text/html'), 'Regression: public route ' + route);
    }
    report.roleVerification = await qa.verify();
  } });
  console.log('Released exact PR #500; authorized production role checks passed and temporary QA post removed.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { surgicalRules, validateDiff, validatePermissions, rollbackTarget, transaction, versionName, rulesetName, EXPECTED, BASE, CANDIDATE };
