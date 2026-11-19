"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createSignupEmailOtpService} = require("./signupEmailOtpCore");

function memoryDb() {
  const docs = new Map();
  return {
    docs,
    doc(path) {return {path};},
    async runTransaction(callback) {
      const pending = [];
      const tx = {
        async get(ref) {
          const raw = docs.get(ref.path);
          return {data: () => raw ? {...raw} : undefined};
        },
        set(ref, value) {pending.push(["set", ref.path, {...value}]);},
        update(ref, value) {pending.push(["update", ref.path, {...value}]);},
      };
      const outcome = await callback(tx);
      for (const [kind, key, value] of pending) {
        docs.set(key, kind === "update" ? {...docs.get(key), ...value} : value);
      }
      return outcome;
    },
  };
}

function harness({start=10000000, code="123456", failedDelivery=false}={}) {
  let time=start;
  const db=memoryDb();
  const sent=[];
  const users=new Map();
  const auth={
    async getUser(uid) {
      if (!users.has(uid)) throw new Error("No user with this UID");
      return {...users.get(uid)};
    },
    async updateUser(uid,patch) {
      users.set(uid,{...users.get(uid),...patch});
    },
  };
  const service=createSignupEmailOtpService({
    db, adminAuth:auth, pepper:"a secure 40-character test pepper not a prod secret",
    clock:()=>time, drawCode:()=>code,
    deliverEmail:async (message)=>{
      if (failedDelivery) throw new Error("Simulated provider failure");
      sent.push(message);
    },
  });
  return {
    service,users,db,sent,
    register(uid,email,emailVerified=false) {
      users.set(uid,{uid,email,emailVerified});
      return {uid,email};
    },
    advance(ms) {time+=ms;},
  };
}

test("send requires a signed-in UID, exact account mailbox and supported domain",async()=>{
  const h=harness();
  const user=h.register("uid-test","resident@gmail.com");
  await assert.rejects(h.service.send(null,"127.0.0.1"),{code:"unauthenticated"});
  await assert.rejects(h.service.send({...user,email:"different@gmail.com"},"127.0.0.1"),{code:"permission-denied"});
  h.register("blocked","resident@tempmail.co");
  await assert.rejects(h.service.send({uid:"blocked",email:"resident@tempmail.co"}),{code:"permission-denied"});
  assert.equal(h.sent.length,0);
  assert.equal(h.db.docs.size,0);
});

test("secure six digits are sent only to registered Auth mailbox; Firestore holds hash, never plaintext",async()=>{
  const h=harness();
  const user=h.register("one","resident@gmail.com");
  assert.deepEqual(await h.service.send(user,"10.0.0.1"),{
    expiresInSeconds:600,resendAfterSeconds:60,
  });
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].to,user.email);
  assert.equal(h.sent[0].code,"123456");
  const stored=h.db.docs.get("residentEmailOtpChallenges/one");
  assert.equal(stored.email,user.email);
  assert.match(stored.digest,/^[a-f0-9]{64}$/);
  assert.match(stored.salt,/^[a-f0-9]{32}$/);
  assert(!JSON.stringify(stored).includes("123456"),"No plaintext code in Firestore");
  assert.equal(stored.attempts,0);
  assert.equal(stored.usedAt,null);
});

test("one-time successful code sets Firebase Auth emailVerified and cannot be replayed",async()=>{
  const h=harness();
  const identity=h.register("two","resident@yahoo.com");
  await h.service.send(identity,"10.0.0.2");
  await assert.rejects(h.service.verify(identity,"12345"),{code:"invalid-argument"});
  await assert.rejects(h.service.verify(identity,"999999"),{code:"permission-denied"});
  assert.equal(h.users.get("two").emailVerified,false);
  assert.deepEqual(await h.service.verify(identity,"123456"),{verified:true});
  assert.equal(h.users.get("two").emailVerified,true);
  await assert.rejects(h.service.verify(identity,"123456"),{code:"failed-precondition"});
});

test("expired codes and 5 incorrect attempts cannot verify",async()=>{
  const h=harness();
  const user=h.register("three","resident@gmail.com");
  await h.service.send(user,"10.0.0.3");
  h.advance(600000);
  await assert.rejects(h.service.verify(user,"123456"),{code:"failed-precondition"});

  const second=h.register("four","another@yahoo.com");
  await h.service.send(second,"10.0.0.4");
  for(let i=0;i<5;i++) await assert.rejects(h.service.verify(second,"000000"),{code:"permission-denied"});
  await assert.rejects(h.service.verify(second,"123456"),{code:"resource-exhausted"});
  assert.equal(h.users.get("four").emailVerified,false);
});

test("resend cooldown, per UID daily quota, separate IP quota and new day reset",async()=>{
  const h=harness();
  const account=h.register("five","foo@gmail.com");
  await h.service.send(account,"20.0.0.1");
  await assert.rejects(h.service.send(account,"20.0.0.1"),{code:"resource-exhausted"});
  for(let i=1;i<5;i++){
    h.advance(60001);
    await h.service.send(account,"20.0.0.1");
  }
  h.advance(60001);
  await assert.rejects(h.service.send(account,"20.0.0.1"),{code:"resource-exhausted"});
  h.advance(86400000);
  await h.service.send(account,"20.0.0.1");
  assert.equal(h.sent.length,6);
});

test("sending failure invalidates challenge and never verifies an unsent code",async()=>{
  const h=harness({failedDelivery:true});
  const u=h.register("failed","resident@gmail.com");
  await assert.rejects(h.service.send(u,"127.0.0.1"),{code:"unavailable"});
  await assert.rejects(h.service.verify(u,"123456"),{code:"failed-precondition"});
  assert.equal(h.users.get("failed").emailVerified,false);
});

test("UID A cannot verify UID B or update their emailVerified claim",async()=>{
  const h=harness();
  const a=h.register("a","one@gmail.com");
  const b=h.register("b","two@yahoo.com");
  await h.service.send(a,"3.3.3.3");
  await assert.rejects(h.service.verify(b,"123456"),{code:"failed-precondition"});
  await h.service.verify(a,"123456");
  assert.equal(h.users.get("a").emailVerified,true);
  assert.equal(h.users.get("b").emailVerified,false);
});
