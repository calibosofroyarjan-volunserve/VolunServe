/** Emulator-only synthetic defense logins. Never uses production credentials. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {initializeTestEnvironment} = require('@firebase/rules-unit-testing');
const {initializeApp, deleteApp} = require('firebase/app');
const {getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut} = require('firebase/auth');
const {getFirestore, connectFirestoreEmulator, doc, getDoc} = require('firebase/firestore');
const projectId = 'demo-volunserve';
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw Error('Requires localhost Auth 9099 and Firestore 8080 emulators; refusing other hosts.');
}
const password = 'DefenseDemo!2026';
const fixtures = ['resident', 'admin', 'volunteer', 'superadmin'];
async function main() {
  const env = await initializeTestEnvironment({projectId, firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    for (const name of fixtures) {
      const email = name + '.defense@example.test';
      const endpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';
      const request = async action => {
        const r = await fetch(endpoint + action + '?key=demo-volunserve-key', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(10000)});
        return {ok:r.ok,body:await r.json()};
      };
      let account = await request('signUp');
      if (!account.ok && account.body.error?.message === 'EMAIL_EXISTS') account = await request('signInWithPassword');
      assert(account.ok, account.body.error?.message || 'Auth emulator account failed');
      const uid = account.body.localId;
      const profile = {uid,email,fullName:'Defense Test ' + name,role:name === 'volunteer' ? 'resident':name,primaryRole:name === 'volunteer' ? 'resident':name,status:'approved',residentAccess:true,identityVerified:true,identityStatus:'verified',volunteerAccess:name === 'volunteer',volunteerStatus:name === 'volunteer'?'approved':'not_applied',activeMode:name === 'volunteer'?'volunteer':'resident',barangay:'Bagong Buhay III',city:'City of San Jose del Monte',adminStatus:name==='admin'?'active':'',syntheticDefenseFixture:true};
      await env.withSecurityRulesDisabled(async ctx => {await ctx.firestore().doc('users/'+uid).set(profile);});
      const app = initializeApp({projectId,apiKey:'demo-volunserve-key',authDomain:'demo-volunserve.firebaseapp.com'},'defense-'+name);
      try {
        const auth = getAuth(app); connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
        const db=getFirestore(app); connectFirestoreEmulator(db,'127.0.0.1',8080);
        await signInWithEmailAndPassword(auth,email,password);
        const own = await getDoc(doc(db,'users',uid));
        assert.equal(own.data().uid,auth.currentUser.uid);
        assert.equal(own.data().role,profile.role);
        console.log('PASS actual Auth emulator login and own-profile rules read: '+name);
        await signOut(auth);
      } finally { await deleteApp(app); }
    }
    console.log('READY: four synthetic accounts; password documented in local E2E checklist. No production writes.');
  } finally {await env.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
