"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const {
  DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS,
  rateLimitWindow, enforceSignupIpRateLimit, RegistrationRateLimitError,
} = require("../functions/registrationIpRateLimiter");

const SECRET = "test-secret-that-is-definitely-longer-than-32-characters";
function mockDb() {
  const items = new Map();
  return {
    items,
    collection(name) {
      assert.equal(name,"authSignupRateLimits");
      return {doc(id) {return {id};}};
    },
    async runTransaction(fn) {
      const pending = [];
      const transaction = {
        async get(ref) {
          const d = items.get(ref.id);
          return {exists: !!d, data: () => d};
        },
        set(ref, data) {pending.push([ref.id,data]);},
      };
      const result = await fn(transaction);
      for (const [key,data] of pending) items.set(key,data);
      return result;
    }
  };
}
function args(db, n, ip="203.0.113.2", time=1762500000000) {
  return {db,ipAddress:ip,eventId:"event-"+n,secret:SECRET,nowMs:time,
    maxAttempts:3,windowMs:DEFAULT_WINDOW_MS};
}
test("verification resend cooldown uses last SUCCESSFUL send only",()=>{
  const code=ts.transpileModule(fs.readFileSync("lib/verificationCooldown.ts","utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const mod={exports:{}};
  new Function("module","exports",code)(mod,mod.exports);
  const fn=mod.exports.verificationCooldownSeconds;
  assert.equal(fn(0,1000),0);
  assert.equal(fn(100000,100000),60);
  assert.equal(fn(100000,101000),59);
  assert.equal(fn(100000,159001),1);
  assert.equal(fn(100000,160000),0);
  const ui=fs.readFileSync("components/auth/EmailFirstSignup.tsx","utf8");
  assert(ui.includes("recordSuccessfulVerificationSend()"));
  assert(ui.includes("verificationCooldownSeconds(lastVerificationSentAtMs.current, Date.now())"));
  assert(ui.includes("For inbox safety, resend is available in"));
  assert(ui.includes('if (!user.emailVerified)'));
});
test("signup IP key is salted hashed and changes for IPs and time buckets",()=>{
  const now=1762500000000;
  const a=rateLimitWindow("203.0.113.2",SECRET,now);
  const b=rateLimitWindow("203.0.113.3",SECRET,now);
  const c=rateLimitWindow("203.0.113.2",SECRET,now+DEFAULT_WINDOW_MS);
  assert.match(a.id,/^[a-f0-9]{64}$/);
  assert.notEqual(a.id,b.id);
  assert.notEqual(a.id,c.id);
  assert(!a.id.includes("203.0.113.2"));
  assert(a.expiresAt instanceof Date);
  assert.equal(DEFAULT_MAX_ATTEMPTS,30);
});
test("server transaction applies limit, deduplicates auth retries and expires window",async()=>{
  const db=mockDb();
  for(let i=1;i<=3;i++) {
    const r=await enforceSignupIpRateLimit(args(db,i));
    assert.equal(r.enforced,true);
    assert.equal(r.remaining,3-i);
  }
  await assert.rejects(
    enforceSignupIpRateLimit(args(db,4)),RegistrationRateLimitError
  );
  const dedupe=await enforceSignupIpRateLimit(args(db,2));
  assert.equal(dedupe.duplicate,true);
  const next=await enforceSignupIpRateLimit(args(db,5,"203.0.113.2",1762500000000+DEFAULT_WINDOW_MS));
  assert.equal(next.enforced,true);
  const separate=await enforceSignupIpRateLimit(args(db,5,"203.0.113.3"));
  assert.equal(separate.enforced,true);
  for(const [id,data] of db.items) {
    assert(!id.includes("203.0.113"));
    assert(!JSON.stringify(data).includes("203.0.113"));
    assert(!JSON.stringify(data).includes("person@"));
  }
});
test("unavailable Identity Platform IP metadata does not ban every signup",async()=>{
  const db=mockDb();
  const r=await enforceSignupIpRateLimit({...args(db,1),ipAddress:""});
  assert.equal(r.enforced,false);
  assert.equal(r.reason,"missing_provider_ip");
  assert.equal(db.items.size,0);
});
test("invalid limiter secret and abusive values fail rather than disabling protection",async()=>{
  const db=mockDb();
  await assert.rejects(enforceSignupIpRateLimit({...args(db,1),secret:"short"}),/Secret Manager/);
  await assert.rejects(enforceSignupIpRateLimit({...args(db,1),maxAttempts:0}),/Invalid signup limit/);
  await assert.rejects(enforceSignupIpRateLimit({...args(db,1),maxAttempts:70}),/Invalid signup limit/);
});
test("beforeCreate enforces screening + shared rate limit, with production opt-in only",()=>{
  const blocking=fs.readFileSync("functions/registrationBlocking.js","utf8");
  const index=fs.readFileSync("functions/index.js","utf8");
  assert(blocking.includes("classifyRegistrationEmail(event.data?.email)"));
  assert(blocking.includes("await enforceSignupIpRateLimit({"));
  assert(blocking.includes("ipAddress: event.ipAddress"));
  assert(blocking.includes("eventId: event.eventId"));
  assert(blocking.includes('defineSecret("VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET")'));
  assert(blocking.includes("secrets: [signupRateLimitSecret]"));
  assert(blocking.includes('new HttpsError("resource-exhausted"'));
  assert(index.includes('process.env.VOLUNSERVE_ENABLE_IDENTITY_BLOCKING === "true"'));
  assert(!index.slice(0,index.indexOf('process.env.VOLUNSERVE_ENABLE_IDENTITY_BLOCKING === "true"'))
    .includes("exports.volunserveBlockDisposableBeforeCreate"));
});

test("signup abuse guards remain opt-in; no app-managed CAPTCHA configuration",()=>{
  const index=fs.readFileSync("functions/index.js","utf8");
  const blocking=fs.readFileSync("functions/registrationBlocking.js","utf8");
  assert(index.includes('process.env.VOLUNSERVE_ENABLE_IDENTITY_BLOCKING === "true"'));
  assert(blocking.includes("enforceSignupIpRateLimit"));
  assert(!index.includes("configureRecaptchaAudit"));
  assert(!blocking.includes("recaptchaConfig"));
  assert(!fs.existsSync("functions/scripts/configureRecaptchaAudit.cjs"));
});
