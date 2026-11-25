'use strict';
// Kings Event Capacity — ISOLATED, SYNTHETIC-ONLY, ENCRYPTED SQLite drill.
// This is REAL local transactional disk persistence for QUARANTINED REVIEW
// METADATA, not an Event importer, backup service or production runtime.
// No Discord, GitHub, network, Event/slot writes or independent owner floor.
// Single protected local instance; cannot run from repository directories.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {isDeepStrictEqual}=require('node:util');
const {createKingsStagedImportQuarantinePlan}
  =require('./event-capacity-staged-import-quarantine-plan');
const {runKingsAtomicImportRehearsal}
  =require('./event-capacity-atomic-import-rehearsal');
const DOMAIN='kings-event-capacity-staged-import-sqlite-v1';
const FILE='kings-capacity-quarantine-drill.sqlite';
const ERROR='Kings encrypted offline import checkpoint store unavailable or unsafe.';
const PHASES=['SOURCE_SNAPSHOT_LOCKED','QUARANTINE_MANIFEST_REVIEWED',
  'RECOVERY_CONSISTENCY_INSPECTED','OFFLINE_DRILL_COMPLETE'];
const MAX=32*1024*1024,HEX=/^[a-f0-9]{64}$/,
  ID=/^[1-9]\d{16,21}$/;
const FAULTS=new Set(['BEFORE_BEGIN','AFTER_BEGIN',
  'AFTER_UPSERT_BEFORE_COMMIT','AFTER_COMMIT_BEFORE_ACK']);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&
  !Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,names){return plain(x)&&Object.keys(x).sort().join('\0')===
  names.slice().sort().join('\0');}
function scopeOf(x){
  if(!exact(x,['guildId','forumId'])||
    typeof x.guildId!=='string'||typeof x.forumId!=='string'||
    !ID.test(x.guildId)||!ID.test(x.forumId))fail();
  return Object.freeze({...x});
}
function inspectDirectory(directory,repositoryRoot){
  if(typeof directory!=='string'||!path.isAbsolute(directory)||
    typeof repositoryRoot!=='string'||!path.isAbsolute(repositoryRoot))fail();
  const st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
  const resolved=fs.realpathSync(directory),repo=fs.realpathSync(repositoryRoot);
  const rel=path.relative(repo,resolved);
  if(rel===''||rel==='.'||
    (rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)))
    fail();
  return resolved;
}
function inspectFile(filename){
  if(!fs.existsSync(filename))return;
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||
    (process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
}
function createKingsAtomicStagedImportSqliteStore({
  directory,scope,encryptionSecret,reviewSecret,repositoryRoot=__dirname,
  externalMinimumRevision=null,mode
}={}){
  let db;
  try{
    if(mode!=='SYNTHETIC_OFFLINE_ONLY'||
      typeof encryptionSecret!=='string'||typeof reviewSecret!=='string'||
      Buffer.byteLength(encryptionSecret,'utf8')<32||
      Buffer.byteLength(reviewSecret,'utf8')<32||
      Buffer.byteLength(encryptionSecret,'utf8')>4096||
      Buffer.byteLength(reviewSecret,'utf8')>4096||
      encryptionSecret===reviewSecret||
      (externalMinimumRevision!==null&&
        typeof externalMinimumRevision!=='function'))fail();
    const checkedScope=scopeOf(scope);
    const dir=inspectDirectory(directory,repositoryRoot),
      filename=path.join(dir,FILE);
    inspectFile(filename);
    const key=crypto.createHash('sha256')
      .update(DOMAIN+'\0'+encryptionSecret).digest();
    // The lookup identifier MUST NOT depend on the encryption key:
    // after key loss/rotation, the old encrypted row must still be found
    // and fail AES-GCM validation, never masquerade as an empty database.
    const scopeKey=crypto.createHash('sha256')
      .update(DOMAIN+'\0'+checkedScope.guildId+
        '\0'+checkedScope.forumId).digest('hex');
    const aad=Buffer.from(DOMAIN+'\0'+checkedScope.guildId+
      '\0'+checkedScope.forumId,'utf8');
    function encrypt(value){
      const raw=Buffer.from(JSON.stringify(value),'utf8');
      if(raw.length>MAX)fail();
      const nonce=crypto.randomBytes(12),cipher=
        crypto.createCipheriv('aes-256-gcm',key,nonce);
      cipher.setAAD(aad);
      const data=Buffer.concat([cipher.update(raw),cipher.final()]);
      return Buffer.concat([nonce,cipher.getAuthTag(),data]);
    }
    function decrypt(bytes){
      if(!(bytes instanceof Uint8Array)||
        bytes.length<29||bytes.length>MAX+28)fail();
      try{
        const buffer=Buffer.from(bytes);
        const cipher=crypto.createDecipheriv('aes-256-gcm',key,
          buffer.subarray(0,12));
        cipher.setAAD(aad);
        cipher.setAuthTag(buffer.subarray(12,28));
        const raw=Buffer.concat([
          cipher.update(buffer.subarray(28)),cipher.final()
        ]);
        if(raw.length>MAX)fail();
        return JSON.parse(raw.toString('utf8'));
      }catch{fail();}
    }
    db=new DatabaseSync(filename,{timeout:1000});
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    db.exec('PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;');
    db.exec('CREATE TABLE IF NOT EXISTS staged_quarantine_drills ('+
      'scope_key TEXT PRIMARY KEY, envelope BLOB NOT NULL)');
    if(process.platform!=='win32')fs.chmodSync(filename,0o600);
    inspectFile(filename);
    let closed=false;
    function ensureOpen(){if(closed)fail();}
    function validatePlanInput(sourceInput){
      if(!plain(sourceInput)||sourceInput.reviewSecret!==reviewSecret||
        !plain(sourceInput.current)||
        sourceInput.current.guildId!==checkedScope.guildId||
        sourceInput.current.currentChannelId!==checkedScope.forumId)fail();
      const plan=createKingsStagedImportQuarantinePlan(sourceInput);
      if(plan.visibility!=='PRIVATE_ONLY'||plan.readOnly!==true||
        plan.stagingReadyForProduction!==false||
        plan.safeToActivate!==false||plan.freeSlotsCertified!==false||
        plan.importOperationsCommitted!==0||
        plan.quarantineItems.length!==plan.counts.total)fail();
      return plan;
    }
    function anchored(record){
      if(externalMinimumRevision===null)return;
      let floor;
      try{floor=externalMinimumRevision({scope:checkedScope});}
      catch{fail();}
      if(!Number.isSafeInteger(floor)||floor<0||floor>PHASES.length||
        (record?.revision??0)<floor)fail();
    }
    function localRecord(){
      const row=db.prepare('SELECT envelope FROM staged_quarantine_drills WHERE scope_key=?')
        .get(scopeKey);
      if(!row){
        anchored(null);
        return null;
      }
      const value=decrypt(row.envelope);
      if(!exact(value,['version','kind','revision','planSeal','counts',
        'quarantineItems','checkpoint','history'])||
        value.version!==1||value.kind!=='OFFLINE_QUARANTINE_DRILL'||
        !Number.isSafeInteger(value.revision)||value.revision<1||
        value.revision>PHASES.length||
        !/^staged-plan:[a-f0-9]{64}$/.test(value.planSeal)||
        !plain(value.counts)||!Array.isArray(value.quarantineItems)||
        value.counts.total!==value.quarantineItems.length||
        !Array.isArray(value.history)||
        value.history.length!==value.revision||
        !plain(value.checkpoint)||value.checkpoint.phaseIndex!==
          value.revision-1||
        value.checkpoint.planSeal!==value.planSeal||
        value.checkpoint.phase!==PHASES[value.revision-1]||
        value.history.some((h,i)=>
          !exact(h,['index','phase','proofSeal'])||
          h.index!==i||h.phase!==PHASES[i]||
          typeof h.proofSeal!=='string'||!HEX.test(h.proofSeal))||
        value.history.at(-1).proofSeal!==value.checkpoint.proofSeal)fail();
      anchored(value);
      return value;
    }
    function loadValidatedRecord(plan,sourceInput){
      const saved=localRecord();
      if(saved===null)return null;
      if(saved.planSeal!==plan.replaySeal||
        !isDeepStrictEqual(saved.counts,plan.counts)||
        !isDeepStrictEqual(saved.quarantineItems,plan.quarantineItems))
        fail();
      // Independently check the local checkpoint HMAC using the existing
      // phase machine; its next result is NOT persisted here.
      const inspected=runKingsAtomicImportRehearsal({
        sourceInput,checkpoint:saved.checkpoint
      });
      if(inspected.safeToActivate!==false||
        inspected.freeSlotsCertified!==false)fail();
      return saved;
    }
    function status(saved,state){
      const cp=saved?.checkpoint??null;
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,
        state,revision:saved?.revision??0,
        stage:cp?.phase??'NOT_STARTED',
        offlineDrillComplete:cp?.phaseIndex===PHASES.length-1,
        quarantinedRecordCount:saved?.counts.total??0,
        quarantinedEventCount:saved?.counts.events??0,
        lastLocalProofSeal:cp?.proofSeal??null,
        noOriginalPrivateEventDataPersisted:true,
        actualEncryptedSqliteTransactionCommitted:state==='STAGED_OFFLINE_PHASE_COMMITTED',
        independentOffsiteHighwaterProven:false,
        noProductionApprovalOrMigration:true,
        originalDiscordHistoryAuthenticated:false,
        realEventImportsOrDeletes:0,
        oldBookingsReleased:0,staffDecisionsCommitted:0,
        actualDiscordOrGitHubApiCalls:0,
        freeSlotsCertified:false,safeToActivate:false
      });
    }
    function read({sourceInput}={}){
      try{
        ensureOpen();
        const plan=validatePlanInput(sourceInput),
          saved=loadValidatedRecord(plan,sourceInput);
        return status(saved,saved===null?'EMPTY_PRIVATE_OFFLINE_STORE':
          'STAGED_OFFLINE_CHECKPOINT_READ');
      }catch{fail();}
    }
    function advance({sourceInput,expectedRevision,fault=null}={}){
      ensureOpen();
      if(!Number.isSafeInteger(expectedRevision)||
        expectedRevision<0||expectedRevision>PHASES.length||
        (fault!==null&&!FAULTS.has(fault)))fail();
      let inside=false;
      try{
        const plan=validatePlanInput(sourceInput);
        if(fault==='BEFORE_BEGIN')fail();
        db.exec('BEGIN IMMEDIATE');inside=true;
        if(fault==='AFTER_BEGIN')fail();
        const old=loadValidatedRecord(plan,sourceInput),
          revision=old?.revision??0;
        if(revision!==expectedRevision){
          if(revision===expectedRevision+1&&
            old.history.at(-1).index===expectedRevision)
            {db.exec('ROLLBACK');inside=false;
              return status(old,'ALREADY_STAGED_SAME_PHASE_REPLAY');}
          fail();
        }
        if(revision===PHASES.length){
          db.exec('ROLLBACK');inside=false;
          return status(old,'OFFLINE_DRILL_ALREADY_COMPLETE');
        }
        const result=runKingsAtomicImportRehearsal({
          sourceInput,checkpoint:old?.checkpoint??null
        });
        if(result.checkpoint?.phaseIndex!==revision||
          result.checkpoint?.planSeal!==plan.replaySeal||
          result.offlineReviewDrillCompleted!==
            (revision===PHASES.length-1)||result.safeToActivate!==false)
          fail();
        const saved={
          version:1,kind:'OFFLINE_QUARANTINE_DRILL',
          revision:revision+1,planSeal:plan.replaySeal,
          counts:plan.counts,quarantineItems:plan.quarantineItems,
          checkpoint:result.checkpoint,
          history:[...(old?.history??[]),{
            index:revision,phase:PHASES[revision],
            proofSeal:result.checkpoint.proofSeal
          }]
        };
        const envelope=encrypt(saved);
        db.prepare('INSERT INTO staged_quarantine_drills(scope_key,envelope) '+
          'VALUES(?,?) ON CONFLICT(scope_key) DO UPDATE SET envelope=excluded.envelope')
          .run(scopeKey,envelope);
        if(fault==='AFTER_UPSERT_BEFORE_COMMIT')fail();
        db.exec('COMMIT');inside=false;
        if(fault==='AFTER_COMMIT_BEFORE_ACK')fail();
        return status(saved,'STAGED_OFFLINE_PHASE_COMMITTED');
      }catch{
        if(inside)try{db.exec('ROLLBACK');}catch{}
        fail();
      }
    }
    function checkpointDigest({sourceInput}={}){
      try{
        ensureOpen();
        const plan=validatePlanInput(sourceInput),
          rec=loadValidatedRecord(plan,sourceInput);
        if(rec===null)return null;
        const row=db.prepare('SELECT envelope FROM staged_quarantine_drills WHERE scope_key=?')
          .get(scopeKey);
        if(!row||!(row.envelope instanceof Uint8Array))fail();
        const digest=crypto.createHash('sha256')
          .update(DOMAIN+'\0'+scopeKey+'\0')
          .update(Buffer.from(row.envelope)).digest('hex');
        return Object.freeze({revision:rec.revision,digest,
          independentExternalAnchorAlreadyWritten:false});
      }catch{fail();}
    }
    function close(){
      if(!closed){closed=true;db.close();}
    }
    return Object.freeze({read,advance,checkpointDigest,close});
  }catch{
    try{db?.close();}catch{}
    fail();
  }
}
module.exports={createKingsAtomicStagedImportSqliteStore};
