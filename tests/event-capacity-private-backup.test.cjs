'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {signPrivateSnapshot}=require('../event-capacity-snapshot-attestation');
const {createPrivateSqliteSnapshotStore}=require('../event-capacity-private-sqlite');
const {createExternallyAnchoredSnapshotStore}=require('../event-capacity-external-anchor');
const {createPrivateBackupService}=require('../event-capacity-private-backup');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-03-20T12:00:00Z'),RUN='45502949674';
const ENC='synthetic-encrypted-sqlite-secret-only-for-offline-tests-abc123';
const SIGN='synthetic-snapshot-signature-secret-only-for-offline-tests-def456';
const BACKUP='synthetic-independent-backup-secret-only-for-offline-tests-ghi789';
function prepared(){
  const source={integrityVerified:true,
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:0,actualConvoys:0},threads:[]},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{convoyReadErrors:0,realConvoySubmissions:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[]},
    ledger:createEmptyLedger(SCOPE,'2027-03-20T11:40:00Z')};
  source.attestation=signPrivateSnapshot(source,{scope:SCOPE,secret:SIGN,
    runId:RUN,attempt:1,nowMs:NOW,trustedProducer:true});
  return {scope:SCOPE,expected:null,
    next:{runId:RUN,attempt:1,ledgerRevision:0},snapshot:source,
    metadata:{runId:RUN,attempt:1,ledgerRevision:0,sourceVerified:true}};
}
async function isolated(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kings-backup-offline-'));
  fs.chmodSync(root,0o700);
  const dirs={};
  for(const n of ['db','backups','restore']){
    dirs[n]=path.join(root,n);fs.mkdirSync(dirs[n],{mode:0o700});
  }
  const opened=[];
  function make(directory,opts={}){
    const s=createPrivateSqliteSnapshotStore({directory,scope:SCOPE,
      encryptionSecret:ENC,signingSecret:SIGN,nowMs:()=>NOW,...opts});
    opened.push(s);return s;
  }
  try{
    const store=make(dirs.db);
    let highwater=null;
    const anchor={
      load:async()=>highwater,
      compareAndAdvance:async({expected,next})=>{
        if(JSON.stringify(expected)!==JSON.stringify(highwater))return false;
        highwater=next;return true;
      }
    };
    const anchored=createExternallyAnchoredSnapshotStore({
      store,scope:SCOPE,anchor});
    assert.equal(await anchored.commitSnapshot(prepared()),true);
    const backup=createPrivateBackupService({directory:dirs.backups,
      scope:SCOPE,backupSecret:BACKUP,nowMs:()=>NOW});
    return await fn({root,dirs,make,store,anchored,backup,
      corruptAnchor:()=>{highwater={revision:1,digest:'f'.repeat(64)};}});
  }finally{
    for(const s of opened.reverse())try{s.close();}catch{}
    fs.rmSync(root,{recursive:true,force:true});
  }
}
test('Independent anchored daily backup encrypts source and is non-overwriting',async()=>{
  await isolated(async h=>{
    const info=await h.backup.createDailyBackup({anchoredStore:h.anchored});
    assert.equal(info.fileName,'kings-capacity-2027-03-20.enc');
    assert.deepEqual(info.checkpoint,h.store.checkpoint());
    const bytes=fs.readFileSync(path.join(h.dirs.backups,info.fileName));
    assert.equal(bytes.includes(Buffer.from(SCOPE.guildId)),false);
    assert.equal(bytes.includes(Buffer.from('registeredConvoys')),false);
    assert.equal(bytes.includes(Buffer.from(RUN)),false);
    await assert.rejects(h.backup.createDailyBackup({anchoredStore:h.anchored}));
    assert.deepEqual(h.backup.readVerifiedBackup(info.fileName).record.checkpoint,info.checkpoint);
  });
});
test('Isolated restore reopens same encrypted source and never overwrites existing state',async()=>{
  await isolated(async h=>{
    const info=await h.backup.createDailyBackup({anchoredStore:h.anchored});
    const dest=h.make(h.dirs.restore,{enableIsolatedRestore:true});
    assert.throws(()=>h.backup.restoreOnlyToEmptyIsolatedStore({
      fileName:info.fileName,targetStore:dest}));
    const restored=h.backup.restoreOnlyToEmptyIsolatedStore({
      fileName:info.fileName,targetStore:dest,isolatedTestMode:true});
    assert.deepEqual(restored.restoredCheckpoint,info.checkpoint);
    assert.deepEqual(dest.readCursor(),prepared().next);
    assert.throws(()=>h.backup.restoreOnlyToEmptyIsolatedStore({
      fileName:info.fileName,targetStore:dest,isolatedTestMode:true}));
  });
});
test('Independent rollback mismatch, incorrect backup key and tampering fail closed',async()=>{
  await isolated(async h=>{
    const info=await h.backup.createDailyBackup({anchoredStore:h.anchored});
    const wrong=createPrivateBackupService({directory:h.dirs.backups,
      scope:SCOPE,backupSecret:'synthetic-wrong-backup-key-more-than-32-characters',
      nowMs:()=>NOW});
    assert.throws(()=>wrong.readVerifiedBackup(info.fileName));
    const name=path.join(h.dirs.backups,info.fileName);
    const bytes=fs.readFileSync(name);bytes[40]^=255;
    fs.writeFileSync(name,bytes);
    assert.throws(()=>h.backup.readVerifiedBackup(info.fileName));
    h.corruptAnchor();
    await assert.rejects(h.backup.createDailyBackup({anchoredStore:h.anchored}));
  });
});
test('Historical backup tests verify original signed data but cannot claim current freshness',async()=>{
  await isolated(async h=>{
    const info=await h.backup.createDailyBackup({anchoredStore:h.anchored});
    const old=h.make(h.dirs.restore,{enableIsolatedRestore:true,
      nowMs:()=>NOW+33*86400000});
    h.backup.restoreOnlyToEmptyIsolatedStore({
      fileName:info.fileName,targetStore:old,isolatedTestMode:true});
    assert.ok(old.readCursor());
    assert.throws(()=>old.readLatest());
  });
});
test('90 day retention and monthly restore cadence are proposals, not automatic deletion',async()=>{
  await isolated(async h=>{
    const old='kings-capacity-2026-01-01.enc';
    fs.writeFileSync(path.join(h.dirs.backups,old),'old',{mode:0o600});
    assert.deepEqual(h.backup.proposeRetention(),[old]);
    assert.equal(fs.existsSync(path.join(h.dirs.backups,old)),true);
    assert.equal(h.backup.monthlyRestoreDue('2027-03-01T09:00:00Z'),false);
    assert.equal(h.backup.monthlyRestoreDue('2027-02-01T09:00:00Z'),true);
    assert.throws(()=>h.backup.readVerifiedBackup('../secrets'));
  });
});
