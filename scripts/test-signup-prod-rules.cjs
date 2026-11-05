// Run only through firebase emulators:exec using firebase.signup-tests.json.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const files=['scripts/test-signup-prod-emulator.cjs','scripts/test-admin-volunteer-firestore.cjs','scripts/test-lgu-admin-rules.cjs','scripts/test-donation-lgu-role-isolation.cjs','scripts/test-community-events-rules.cjs','scripts/test-live-emergency-map-rules.cjs','scripts/test-community-organizer-gps-cleanup.cjs','scripts/test-pavia-admin-announcement-emulator.cjs'];
for (const variable of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env[variable] || '')) throw Error('Loopback emulators required: '+variable);
}
fs.mkdirSync('.expo',{recursive:true});
const results=[];
for(const file of files){console.log('\nRUN '+file);const run=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:180000});console.log(run.stdout||'');if(run.status!==0)console.error(run.stderr||run.error);results.push({file,status:run.status,stdout:run.stdout,stderr:run.stderr});}
fs.writeFileSync('.expo/signup-rules-results.json',JSON.stringify(results,null,2));
process.exitCode=results.some(r=>r.status!==0)?1:0;
