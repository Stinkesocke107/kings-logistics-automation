'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const {createPrivateHistoricalBackupVault}
  =require('../event-capacity-historical-github-backup-vault');
const {createPrivateBackupContinuityAudit}
  =require('../event-capacity-historical-backup-continuity');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const DATA='kings-private-example/historical-decisions';
const WITNESS='kings-private-example/historical-witness';
const BACKUPS='kings-private-example/historical-backups';
const TOKEN='synthetic-private-offsite-backup-only-token';
const SOURCE_SECRET='synthetic private encryption secret for test only and never production';
const BACKUP_SECRET='synthetic unrelated backup vault encryption key material 12345';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const PATH='capacity-backups/2027-05-20.enc.json';
function sha(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function setupVault(){
  const x=setup();
  const envelope=createEncryptedOffsiteHistoricalBackup({
    archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE_SECRET,backupSecret:BACKUP_SECRET,nowMs:NOW
  }).envelope;
  const docs=new Map();
  const calls=[];
  let isPrivate=true,failAfterWrite=false,collision=false,
    mutateSecondRead=false,failRead=false;
  let fetches=0;
  function file(path,bytes){
    return {type:'file',path,encoding:'base64',sha:sha(bytes),
      size:bytes.length,content:bytes.toString('base64')};
  }
  function transport(url,options){
    const prefix='https://api.github.com/repos/'+BACKUPS;
    assert.ok(url.startsWith(prefix));
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    calls.push({method:options.method,route:url.slice(prefix.length)});
    const route=url.slice(prefix.length);
    if(route==='')return Response.json({
      full_name:BACKUPS,private:isPrivate,archived:false,
      disabled:false,default_branch:'main'
    });
    if(route==='/contents/'+PATH+'?ref=main'){
      if(failRead)throw Error('NO SECRET IN PUBLIC ERRORS');
      const blob=docs.get(PATH);
      if(!blob)return Response.json({message:'Not Found'},{status:404});
      fetches++;
      const chosen=mutateSecondRead&&fetches>=2?Buffer.from('changed'):blob;
      return Response.json(file(PATH,chosen));
    }
    if(route==='/contents/'+PATH&&options.method==='PUT'){
      if(collision||docs.has(PATH))return Response.json({message:'conflict'},{status:409});
      const payload=JSON.parse(options.body);
      assert.equal(payload.branch,'main');
      assert.equal('sha' in payload,false);
      const bytes=Buffer.from(payload.content,'base64');
      docs.set(PATH,bytes);
      if(failAfterWrite)return Response.json({message:'timeout'}, {status:500});
      return Response.json({content:{sha:sha(bytes)},commit:{sha:'e'.repeat(40)}},
        {status:201});
    }
    return Response.json({message:'Not Found'},{status:404});
  }
  const vault=(options={})=>createPrivateHistoricalBackupVault({
    repository:BACKUPS,dataRepository:DATA,witnessRepository:WITNESS,
    token:TOKEN,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE_SECRET,backupSecret:BACKUP_SECRET,
    transport,nowMs:()=>NOW,...options
  });
  return {x,envelope,vault,docs,calls,transport,
    setPrivate:v=>{isPrivate=v;},setCollision:v=>{collision=v;},
    setAmbiguous:v=>{failAfterWrite=v;},
    setMutateSecondRead:v=>{mutateSecondRead=v;},
    setFailRead:v=>{failRead=v;}};
}
test('Daily encrypted backup writes once in a separate verified private repository',async()=>{
  const x=setupVault();
  const result=await x.vault().writeDailyOnce({
    envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt
  });
  assert.equal(result.state,'StoredPendingIndependentRetentionAudit');
  assert.equal(result.encrypted,true);
  assert.equal(result.offsiteBackupStored,true);
  assert.equal(result.retentionEnforced,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(x.docs.has(PATH),true);
  const text=x.docs.get(PATH).toString();
  assert.doesNotMatch(text,/event:100|Partner Convoy|evidenceDigest/);
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
});
test('Read verifies original owner receipt and encrypted history from the private backup',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  const result=await x.vault().readDaily({day:'2027-05-20',
    ownerReceipt:x.x.nextOwnerReceipt});
  assert.equal(result.state,'EncryptedBackupVerified');
  assert.equal(result.revision,2);
  assert.equal(result.productionRestorePerformed,false);
  assert.equal(result.isolatedRestoreVerified,true);
  assert.equal(result.freeSlotsCertified,false);
});
test('Second backup on the same UTC day can never overwrite the first',async()=>{
  const x=setupVault(),v=x.vault();
  await v.writeDailyOnce({envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt});
  const before=x.docs.get(PATH);
  await assert.rejects(v.writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt}));
  assert.deepEqual(x.docs.get(PATH),before);
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
});
test('Public repo and any repo shared with source or witness are denied',async()=>{
  const x=setupVault();
  x.setPrivate(false);
  await assert.rejects(x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt}));
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);
  assert.throws(()=>x.vault({repository:DATA}));
  assert.throws(()=>x.vault({repository:WITNESS}));
  assert.throws(()=>x.vault({repository:'Stinkesocke107/kings-logistics-automation'}));
});
test('Bad receipt, wrong encryption key and stale day fail before any writes',async()=>{
  const x=setupVault(),bad=structuredClone(x.x.nextOwnerReceipt);
  bad.payload.tip='0'.repeat(64);
  await assert.rejects(x.vault().writeDailyOnce({
    envelope:x.envelope,ownerReceipt:bad}));
  await assert.rejects(x.vault({backupSecret:'different independent backup secret xyz'})
    .writeDailyOnce({envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt}));
  await assert.rejects(x.vault({nowMs:()=>NOW+86400000})
    .writeDailyOnce({envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt}));
  assert.equal(x.calls.length,0);
});
test('Concurrent same-day creation conflict does not retry or overwrite',async()=>{
  const x=setupVault();x.setCollision(true);
  await assert.rejects(x.vault().writeDailyOnce({
    envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt}));
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
  assert.equal(x.docs.size,0);
});
test('Ambiguous successful remote write still reports failure for manual reconciliation',async()=>{
  const x=setupVault();x.setAmbiguous(true);
  await assert.rejects(x.vault().writeDailyOnce({
    envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt}));
  assert.equal(x.docs.has(PATH),true);
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
  const proof=await x.vault().readDaily({day:'2027-05-20',
    ownerReceipt:x.x.nextOwnerReceipt});
  assert.equal(proof.state,'EncryptedBackupVerified');
});
test('Tampering or changing archived ciphertext during a read fails closed',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  const corrupted=Buffer.from(x.docs.get(PATH));
  corrupted[10]^=1;x.docs.set(PATH,corrupted);
  await assert.rejects(x.vault().readDaily({
    day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt}));
  const y=setupVault();
  await y.vault().writeDailyOnce({envelope:y.envelope,
    ownerReceipt:y.x.nextOwnerReceipt});
  y.setMutateSecondRead(true);
  await assert.rejects(y.vault().readDaily({
    day:'2027-05-20',ownerReceipt:y.x.nextOwnerReceipt}));
});
test('Transport errors cannot expose sensitive keys or backup contents',async()=>{
  const x=setupVault();x.setFailRead(true);
  await assert.rejects(x.vault().writeDailyOnce({
    envelope:x.envelope,ownerReceipt:x.x.nextOwnerReceipt}),err=>{
    assert.doesNotMatch(String(err),/NO SECRET|synthetic private|event:100/);
    return true;
  });
});

function continuity(x,options={}){
  return createPrivateBackupContinuityAudit({
    repository:BACKUPS,dataRepository:DATA,witnessRepository:WITNESS,
    token:TOKEN,scope:SCOPE,ownerPublicKey:x.x.ownerPublicKey,
    encryptionSecret:SOURCE_SECRET,backupSecret:BACKUP_SECRET,
    transport:x.transport,nowMs:()=>NOW,...options
  });
}
test('90-day continuity reports 90 missing signed receipts without network I/O',async()=>{
  const x=setupVault(),result=await continuity(x).audit();
  assert.equal(result.windowDays,90);
  assert.equal(result.counts.ownerReceiptMissingDays,90);
  assert.equal(result.counts.verifiedDailyBackups,0);
  assert.equal(result.allDailyReadChecksPassed,false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.actualIndependentStorageGovernanceVerified,false);
  assert.equal(x.calls.length,0);
});
test('Verified private encrypted backup and missing adjacent day are distinct',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  const readsBefore=x.calls.filter(a=>a.method==='GET').length;
  const audit=await continuity(x).audit({windowDays:2,receipts:[
    {day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt}
  ]});
  assert.equal(audit.counts.verifiedDailyBackups,1);
  assert.equal(audit.counts.ownerReceiptMissingDays,1);
  assert.equal(audit.counts.unverifiableDays,0);
  assert.equal(audit.allDailyReadChecksPassed,false);
  assert.equal(audit.days[0].backupVerified,false);
  assert.equal(audit.days[1].backupVerified,true);
  assert.equal(x.calls.filter(a=>a.method==='PUT').length,1);
  assert.ok(x.calls.filter(a=>a.method==='GET').length>readsBefore);
});
test('Missing remote bytes despite a supplied owner receipt are not valid proof',async()=>{
  const x=setupVault();
  const audit=await continuity(x).audit({windowDays:1,receipts:[
    {day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt}
  ]});
  assert.equal(audit.counts.unverifiableDays,1);
  assert.equal(audit.counts.ownerReceiptMissingDays,0);
  assert.equal(audit.allDailyReadChecksPassed,false);
  assert.equal(audit.freeSlotsCertified,false);
});
test('Forged signed receipts never become a verified daily backup',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  const forged=structuredClone(x.x.nextOwnerReceipt);
  forged.payload.tip='0'.repeat(64);
  const audit=await continuity(x).audit({windowDays:1,receipts:[
    {day:'2027-05-20',ownerReceipt:forged}
  ]});
  assert.equal(audit.counts.unverifiableDays,1);
  assert.equal(audit.counts.verifiedDailyBackups,0);
});
test('Duplicate, out-of-window or impossible-date receipt inventories fail closed',async()=>{
  const x=setupVault();
  const valid={day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt};
  for(const receipts of [
    [valid,valid],
    [{...valid,day:'2027-05-19'}],
    [{...valid,day:'2027-02-30'}],
    [{...valid,day:'2027-05-21'}],
    [{...valid,unexpected:'input'}]
  ])await assert.rejects(continuity(x).audit({windowDays:1,receipts}));
  for(const windowDays of [0,91,-1,1.5])
    await assert.rejects(continuity(x).audit({windowDays}));
});
test('A backup with a forged public repo metadata state is not independently verified',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  x.setPrivate(false);
  const audit=await continuity(x).audit({windowDays:1,receipts:[
    {day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt}
  ]});
  assert.equal(audit.counts.unverifiableDays,1);
  assert.equal(audit.actualIndependentStorageGovernanceVerified,false);
  assert.equal(audit.retentionEnforced,false);
  assert.equal(audit.automaticDeletions,0);
});
test('All sampled encrypted checks are not a certified historical source or external highwater',async()=>{
  const x=setupVault();
  await x.vault().writeDailyOnce({envelope:x.envelope,
    ownerReceipt:x.x.nextOwnerReceipt});
  const audit=await continuity(x).audit({windowDays:1,receipts:[
    {day:'2027-05-20',ownerReceipt:x.x.nextOwnerReceipt}
  ]});
  assert.equal(audit.allDailyReadChecksPassed,true);
  assert.equal(audit.counts.verifiedDailyBackups,1);
  assert.equal(audit.monthlyIsolatedHostRestoreVerified,false);
  assert.equal(audit.independentlyRetainedHighwaterContinuityVerified,false);
  assert.equal(audit.historicalCoverageCertified,false);
  assert.equal(audit.freeSlotsCertified,false);
});
