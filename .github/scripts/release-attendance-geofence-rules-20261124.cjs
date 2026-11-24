const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
assert(process.env.FIREBASE_SA,'BLOCKED dedicated read-only production credential unavailable');
const sa=JSON.parse(process.env.FIREBASE_SA);
const mode=process.argv[2];
assert(['prepare','check','publish','rollback'].includes(mode));
const metaPath=process.env.RUNNER_TEMP+'/geofence-rules-release.json';
const originalHash='bbe6d3c1184ea6e7dcae253e56c34271acfb8260fd853614810aafcc550b8ed7';
const patchedHash='9291772f8b493ace946be9a601d7b84a4cfa8af9827030a2b667508312cc6c30';
const originalRuleset='projects/volunserve-3aa5b/rulesets/246f9fe3-57d1-43ca-9585-8093f6bddb37';
const releaseName='projects/volunserve-3aa5b/releases/cloud.firestore';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.equal(sa.project_id,'volunserve-3aa5b');
assert.equal(sa.type,'service_account');
assert(/^[a-z0-9-]+@volunserve-3aa5b\.iam\.gserviceaccount\.com$/.test(sa.client_email),'Unexpected service account principal');
console.log('READONLY_PRINCIPAL='+sa.client_email);
async function token(){
  const now=Math.floor(Date.now()/1000);
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const jwt=encode({alg:'RS256',typ:'JWT'})+'.'+encode({
    iss:sa.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+1800});
  const signature=crypto.sign('RSA-SHA256',Buffer.from(jwt),sa.private_key).toString('base64url');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt+'.'+signature}),
    signal:AbortSignal.timeout(15000)});
  assert(r.ok,'OAuth HTTP '+r.status);
  return (await r.json()).access_token;
}
async function main(){
  const access=await token();
  const get=async path=>{
    const r=await fetch('https://firebaserules.googleapis.com/v1/'+path,{
      headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(20000)});
    if(!r.ok){const body=await r.json().catch(()=>({})); const reason=(body.error?.details||[]).map(d=>String(d.reason||'')).filter(x=>/^[A-Z_]+$/.test(x)).join(','); throw Error('Rules API GET '+path+' HTTP '+r.status+' '+(body.error?.status||'')+' '+reason); }
    return r.json();
  };
  const api=async(path,method,body)=>{
    const r=await fetch('https://firebaserules.googleapis.com/v1/'+path,{
      method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw Error('Rules API '+method+' '+path+' HTTP '+r.status);
    return r.json();
  };
  const current=await get(releaseName);
  const currentSource=async r=>{
    const rs=await get(r.rulesetName);
    assert.equal(rs.source?.files?.length,1,'Unexpected rules source shape');
    return rs.source.files[0].content;
  };
  const liveMarker=async()=>{
    const r=await fetch('https://volunserve.com/volunserve-release.json?geofence='+Date.now(),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    assert(r.ok,'Live site unavailable');
    const m=await r.json(); assert.equal(m.firebaseProject,'volunserve-3aa5b'); return m.revision;
  };
  if(mode!=='prepare'){
    const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
    assert.equal(meta.original,originalRuleset);
    assert.equal(meta.patchedHash,patchedHash);
    if(mode==='rollback'){
      if(current.rulesetName===originalRuleset){assert.equal(sha(await currentSource(current)),originalHash);console.log('PASS original rules still active');return;}
      assert(meta.created&&current.rulesetName===meta.created,'BLOCKED unrelated rules release: manual review required');
      assert.equal(sha(await currentSource(current)),patchedHash);
      const marker=await liveMarker();
      assert([process.env.BASE_SHA,process.env.SOURCE_SHA].includes(marker),'BLOCKED unrelated live Hosting release');
      assert.equal((await get(releaseName)).rulesetName,meta.created);
      const restored=await api(releaseName,'PATCH',{release:{name:releaseName,rulesetName:originalRuleset}});
      assert.equal(restored.rulesetName,originalRuleset);
      assert.equal((await get(releaseName)).rulesetName,originalRuleset);
      console.log('PASS exact original rules restored');
      return;
    }
    assert.equal(current.rulesetName,originalRuleset,'BLOCKED rules changed since audit');
    assert.equal(sha(await currentSource(current)),originalHash,'BLOCKED rules content drift');
    assert.equal(sha(fs.readFileSync('firestore.rules','utf8')),patchedHash,'BLOCKED candidate changed after QA');
    if(mode==='check'){
      assert.equal(await liveMarker(),process.env.BASE_SHA,'BLOCKED live website drift');
      console.log('PASS exact rules and website baseline immediately before Hosting publish');
      return;
    }
    assert.equal(mode,'publish');
    assert.equal(await liveMarker(),process.env.SOURCE_SHA,'BLOCKED new website not confirmed');
    const created=await api('projects/volunserve-3aa5b/rulesets','POST',{source:{files:[{name:'firestore.rules',content:fs.readFileSync('firestore.rules','utf8')}]}});
    assert(/^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9_-]+$/.test(created.name||''));
    meta.created=created.name;
    fs.writeFileSync(metaPath,JSON.stringify(meta),{mode:0o600});
    assert.equal(sha(await currentSource({rulesetName:created.name})),patchedHash);
    assert.equal((await get(releaseName)).rulesetName,originalRuleset,'BLOCKED concurrent rules update');
    assert.equal(await liveMarker(),process.env.SOURCE_SHA);
    const updated=await api(releaseName,'PATCH',{release:{name:releaseName,rulesetName:created.name}});
    assert.equal(updated.rulesetName,created.name);
    const confirmed=await get(releaseName);
    assert.equal(confirmed.rulesetName,created.name);
    assert.equal(sha(await currentSource(confirmed)),patchedHash);
    console.log('PASS exact tested attendance-only rules published: '+created.name);
    return;
  }
  const release=current;
  assert.equal(release.rulesetName,originalRuleset,'BLOCKED active rules revision changed');
  const ruleset=await get(release.rulesetName);
  const content=(ruleset.source?.files||[]).filter(f=>f.name==='firestore.rules'||f.name==='cloud.firestore').map(f=>f.content).join('\n');
  assert(content.length>100000,'Active ruleset incomplete');
  assert.equal(sha(content),originalHash,'BLOCKED rules hash differs from passed audit');
  const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  const candidate=fs.readFileSync('firestore.rules','utf8');
  const previous=process.env.PREVIOUS_RULES_SHA256||'';
  console.log('ACTIVE_RULESET='+release.rulesetName);
  console.log('ACTIVE_RULES_SHA256='+hash(content));
  console.log('CANDIDATE_RULES_SHA256='+hash(candidate));
  console.log('ACTIVE_RULES_LENGTH='+content.length);
  console.log('CANDIDATE_RULES_LENGTH='+candidate.length);
  console.log('Render invited-only clause deployed already? '+content.includes("render_resident_created_all_volunteers"));
  const old="                && eventAfter().participantsCount == eventBefore().participantsCount + 1\n                && eventAfter().participantsCount <= eventBefore().capacity\n              )\n              ||\n              (\n                // Volunteer Time In/Out, cannot self-verify.\n                resource.data.status == 'joined'\n                && resource.data.attendanceVerified == false\n                && request.resource.data.attendanceVerified == false\n                && request.resource.data.diff(resource.data)\n                  .affectedKeys().hasOnly([\n                    'checkedInAt', 'checkedOutAt', 'updatedAt'\n                  ])\n                && request.resource.data.updatedAt == request.time\n                && eventBefore().status == 'active'\n                && (\n                  (\n                    resource.data.checkedInAt == null\n                    && resource.data.checkedOutAt == null\n                    && request.resource.data.checkedInAt == request.time\n                    && request.resource.data.checkedOutAt == null\n                  )\n                  ||\n                  (\n                    resource.data.checkedInAt is timestamp\n                    && resource.data.checkedOutAt == null\n                    && request.resource.data.checkedInAt == resource.data.checkedInAt\n                    && request.resource.data.checkedOutAt == request.time\n                  )\n                )\n              )\n            )\n          )\n          ||";
  const next="                && eventAfter().participantsCount == eventBefore().participantsCount + 1\n                && eventAfter().participantsCount <= eventBefore().capacity\n              )\n              // Self attendance is written only by the authenticated Render backend.\n\n            )\n          )\n          ||";
  // Match only the reviewed volunteer self-attendance OR arm, not its neighboring RSVP code.
  const marker='// Volunteer Time In/Out, cannot self-verify.';
  const oldStart=old.indexOf('              ||\n              (\n                '+marker);
  const oldEnd=old.lastIndexOf('\n            )');
  assert(oldStart>=0 && oldEnd>oldStart,'Invalid reviewed attendance patch');
  const arm=old.slice(oldStart,oldEnd);
  const sectionStart=content.indexOf('match /communityEventParticipants/{participantId}');
  assert(sectionStart>=0 && content.indexOf('match /communityEventParticipants/{participantId}',sectionStart+1)<0,'Participant match missing or ambiguous');
  const sectionEnd=content.indexOf('match /{document=**}',sectionStart);
  assert(sectionEnd>sectionStart,'Participant section boundary not found');
  const section=content.slice(sectionStart,sectionEnd);
  // Tokenize while ignoring formatting and comments, preserving literal strings.
  const tokenize=s=>Array.from(s.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*|\d+|&&|\|\||==|!=|<=|>=|[^\s]/g)).filter(m=>!m[0].startsWith('//')&&!m[0].startsWith('/*'));
  const target=tokenize(arm).map(t=>t[0]);
  const actual=tokenize(section);
  const hits=[];
  for(let i=0;i<=actual.length-target.length;i++){
    if(target.every((t,j)=>actual[i+j][0]===t))hits.push(i);
  }
  if(hits.length!==1){
    console.log('ACTIVE_PARTICIPANT_RULES_BEGIN');
    console.log('Scoped mismatch; do not publish.');
    console.log('ACTIVE_PARTICIPANT_RULES_END');
    throw Error('BLOCKED actual attendance predicate differs semantically; inspect scoped source before editing');
  }
  const start=sectionStart+actual[hits[0]].index;
  const last=actual[hits[0]+target.length-1];
  const end=sectionStart+last.index+last[0].length;
  const removed=content.slice(start,end);
  const replacement='// Self attendance is written only by the authenticated Render backend.';
  const patched=content.slice(0,start)+replacement+content.slice(end);
  assert.equal(patched.slice(0,start)+removed+patched.slice(start+replacement.length),content,'BLOCKED unrelated rules changes');
  console.log('PATCH_SCOPE=exact token-equivalent volunteer self-attendance arm only');
  console.log('REMOVED_BYTES='+Buffer.byteLength(removed));
  assert.equal(sha(patched),patchedHash,'BLOCKED patch differs from passed audit');
  fs.writeFileSync('firestore.rules',patched,{mode:0o600});
  fs.writeFileSync(metaPath,JSON.stringify({original:originalRuleset,patchedHash}),{mode:0o600});
  console.log('PATCHED_RULES_SHA256='+hash(patched));
  console.log('READ ONLY audit completed; candidate exists only on temporary runner.');
}
main().catch(e=>{console.error('RULES_AUDIT_BLOCKED:',e.message);process.exit(1)});
