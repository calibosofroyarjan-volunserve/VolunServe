/** Run with FIRESTORE_EMULATOR_HOST=127.0.0.1:<isolated-port>. Synthetic demo data only. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/, 'Explicit localhost emulator required');
const root = path.resolve(__dirname, '..');
const results = [];
async function check(name, operation, denied = false) {
  try {
    await (denied ? assertFails(operation()) : assertSucceeds(operation()));
    results.push({ name, status: 'PASS' });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
async function main() {
  const env = await initializeTestEnvironment({ projectId: 'demo-volunserve', firestore: {
    rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8'),
  }});
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, role] of [['inbox-owner','resident'],['inbox-other','resident'],['inbox-admin','admin'],['inbox-super','superadmin']]) {
        await db.doc('users/' + uid).set({ uid, role, status:'approved', residentAccess:role==='resident', activeMode:'resident' });
      }
      const seed = (id, recipient) => db.doc('notifications/' + id).set({ ...recipient,
        title:'Fictional certificate update', message:'Synthetic emulator record', type:'certificate_issued',
        read:false, createdAt:firebase.firestore.Timestamp.now(), deliveryStatus:'pending',
      });
      for (const id of ['read','content','transfer','admin-read','admin-update','delete','delivery','bulk-1','bulk-2']) await seed(id,{userId:'inbox-owner'});
      await seed('admin-own',{userId:'inbox-admin'});
      await seed('super-own',{userId:'inbox-super'});
      await seed('legacy',{recipientUid:'inbox-owner'});
    });
    const own = env.authenticatedContext('inbox-owner').firestore();
    const other = env.authenticatedContext('inbox-other').firestore();
    const admin = env.authenticatedContext('inbox-admin').firestore();
    const superAdmin = env.authenticatedContext('inbox-super').firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    await check('Recipient userId query matches backend schema', () => own.collection('notifications').where('userId','==','inbox-owner').get());
    await check('Recipient may mark own notification read', () => own.doc('notifications/read').update({read:true}));
    await check('Repeated read acknowledgement is safe', () => own.doc('notifications/read').update({read:true}));
    await check('Anonymous cannot read notification', () => anonymous.doc('notifications/read').get(), true);
    await check('Other resident cannot read notification', () => other.doc('notifications/read').get(), true);
    await check('Other resident cannot mark notification read', () => other.doc('notifications/content').update({read:true}), true);
    await check('Recipient cannot forge authoritative content', () => own.doc('notifications/content').update({title:'Forged'}), true);
    await check('Recipient cannot transfer ownership', () => own.doc('notifications/transfer').update({userId:'inbox-other'}), true);
    await check('LGU Admin cannot read another recipient inbox', () => admin.doc('notifications/admin-read').get(), true);
    await check('LGU Admin cannot change another recipient notification', () => admin.doc('notifications/admin-update').update({message:'Forged'}), true);
    await check('LGU Admin cannot delete another recipient notification', () => admin.doc('notifications/delete').delete(), true);
    await check('Resident cannot create arbitrary notification', () => own.doc('notifications/spam').set({userId:'inbox-other',read:false}), true);
    await check('Recipient cannot delete authoritative notification', () => own.doc('notifications/delete').delete(), true);
    await check('Recipient cannot edit delivery metadata', () => own.doc('notifications/delivery').update({deliveryStatus:'sent'}), true);
    await check('Read acknowledgement must be boolean true', () => own.doc('notifications/content').update({read:'true'}), true);
    await check('LGU Admin can read own notification', () => admin.doc('notifications/admin-own').get());
    await check('LGU Admin can mark own notification read', () => admin.doc('notifications/admin-own').update({read:true}));
    await check('LGU Admin cannot edit own authoritative content', () => admin.doc('notifications/admin-own').update({message:'Forged'}), true);
    await check('Super Admin can read own governance notification', () => superAdmin.doc('notifications/super-own').get());
    await check('Super Admin can mark own notification read', () => superAdmin.doc('notifications/super-own').update({read:true}));
    await check('Super Admin cannot read another recipient notification', () => superAdmin.doc('notifications/read').get(), true);
    await check('Legacy recipientUid query still works', () => own.collection('notifications').where('recipientUid','==','inbox-owner').get());
    await check('Legacy recipientUid acknowledgement still works', () => own.doc('notifications/legacy').update({read:true}));
    await check('Mark-all batch can acknowledge multiple owned notifications', () => {
      const batch = own.batch();
      for (const id of ['bulk-1','bulk-2']) batch.update(own.doc('notifications/'+id),{read:true});
      return batch.commit();
    });
    await check('Mixed mark-all batch cannot include another recipient', () => {
      const batch = own.batch();
      batch.update(own.doc('notifications/bulk-1'),{read:true});
      batch.update(own.doc('notifications/admin-own'),{read:true});
      return batch.commit();
    }, true);
  } finally {
    await env.cleanup();
    const dir = process.env.VOLUNSERVE_TEST_RESULTS_DIR || require('node:os').tmpdir();
    fs.writeFileSync(path.join(dir,'notification-inbox-regression-results.json'),JSON.stringify(results,null,2));
  }
  console.log('Notification rules: '+results.filter(r=>r.status==='PASS').length+' passed, '+results.filter(r=>r.status==='FAIL').length+' failed.');
  if (results.some(r=>r.status==='FAIL')) process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
