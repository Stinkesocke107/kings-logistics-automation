'use strict';
// Isolated Kings Event Capacity encrypted SQLite snapshot store.
// NO production callers, Discord writes, real secrets, or network access.
// SQLite transaction protects snapshot + cursor together. Independent
// anti-rollback anchor, backup/restore, and verified service identity remain
// mandatory production launch gates.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {DatabaseSync}=require('node:sqlite');
const {verifyPrivateSnapshot}=require('./event-capacity-snapshot-attestation');
const {validateLedger}=require('./event-capacity-decision-ledger');
const {assertCursor}=require('./event-capacity-private-import');

const ERROR='Kings Event Capacity encrypted snapshot storage unavailable or unsafe.';
const DOMAIN='kings-event-capacity-private-sqlite-v1';
const MAX_PLAINTEXT=48*1024*1024;
const MAX_CIPHERTEXT=MAX_PLAINTEXT+28;
const SNOWFLAKE=/^\d{17,22}$/;
const FILE='event-capacity-snapshots.sqlite';
function fail(){throw new Error(ERROR);}
function checkedScope(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
     !SNOWFLAKE.test(String(scope.guildId||''))||
     !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function checkDir(directory,repoRoot){
  if(typeof directory!=='string'||!path.isAbsolute(directory))fail();
  const st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||
     (process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
  const real=fs.realpathSync(directory),repo=fs.realpathSync(repoRoot);
  const rel=path.relative(repo,real);
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))fail();
  return real;
}
function checkFile(filename){
  if(!fs.existsSync(filename))return;
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||
     (process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
}
function cursorShape(value){
  return !!(value&&typeof value==='object'&&!Array.isArray(value)&&
    /^[1-9]\d{5,19}$/.test(String(value.runId||''))&&
    Number.isSafeInteger(value.attempt)&&value.attempt>=1&&value.attempt<=1000&&
    Number.isSafeInteger(value.ledgerRevision)&&value.ledgerRevision>=0);
}
function createPrivateSqliteSnapshotStore({
  directory,scope,encryptionSecret,signingSecret,
  repositoryRoot=__dirname,nowMs=()=>Date.now(),
  externalMinimumRevision=null,enableIsolatedRestore=false
}={}){
  const checked=checkedScope(scope);
  if(typeof encryptionSecret!=='string'||
    Buffer.byteLength(encryptionSecret,'utf8')<32||
    typeof signingSecret!=='string'||Buffer.byteLength(signingSecret,'utf8')<32||
    encryptionSecret===signingSecret||typeof nowMs!=='function'||
    (externalMinimumRevision!==null&&typeof externalMinimumRevision!=='function'))fail();
  const dir=checkDir(directory,repositoryRoot);
  const filename=path.join(dir,FILE);
  checkFile(filename);
  const key=crypto.createHash('sha256').update(DOMAIN+'\0'+encryptionSecret).digest();
  const scopeKey=crypto.createHash('sha256')
    .update(DOMAIN+'\0'+checked.guildId+'\0'+checked.forumId).digest('hex');
  const aad=Buffer.from(DOMAIN+'\0'+checked.guildId+'\0'+checked.forumId);
  let db;
  function protect(value){
    const raw=Buffer.from(JSON.stringify(value),'utf8');
    if(raw.length>MAX_PLAINTEXT)fail();
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(aad);
    const bytes=Buffer.concat([cipher.update(raw),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),bytes]);
  }
  function unprotect(payload){
    if(!(payload instanceof Uint8Array)||payload.length<29||
      payload.length>MAX_CIPHERTEXT)fail();
    try{
      const iv=Buffer.from(payload.subarray(0,12));
      const tag=Buffer.from(payload.subarray(12,28));
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
      decipher.setAAD(aad);decipher.setAuthTag(tag);
      const raw=Buffer.concat([
        decipher.update(Buffer.from(payload.subarray(28))),decipher.final()
      ]);
      if(raw.length>MAX_PLAINTEXT)fail();
      return JSON.parse(raw.toString('utf8'));
    }catch{fail();}
  }
  function getUnverifiedRecord(){
    const row=db.prepare('SELECT envelope FROM capacity_snapshots WHERE scope_key=?').get(scopeKey);
    if(!row){
      // Missing local state cannot reset an independently anchored import.
      if(externalMinimumRevision!==null){
        let minimum;
        try{minimum=externalMinimumRevision({scope:checked});}catch{fail();}
        if(!Number.isSafeInteger(minimum)||minimum!==0)fail();
      }
      return null;
    }
    const record=unprotect(row.envelope);
    if(!record||record.version!==1||!cursorShape(record.cursor)||
      !Number.isSafeInteger(record.revision)||record.revision<1||
      !record.snapshot||!record.metadata||
      record.snapshot.attestation?.runId!==record.cursor.runId||
      record.snapshot.attestation?.attempt!==record.cursor.attempt||
      record.snapshot.ledger?.revision!==record.cursor.ledgerRevision||
      record.metadata.runId!==record.cursor.runId||
      record.metadata.attempt!==record.cursor.attempt||
      record.metadata.ledgerRevision!==record.cursor.ledgerRevision||
      record.metadata.sourceVerified!==true)fail();
    try{validateLedger(record.snapshot.ledger,checked);}catch{fail();}
    if(externalMinimumRevision!==null){
      let minimum;
      try{minimum=externalMinimumRevision({scope:checked});}catch{fail();}
      // An independent anchor can be ahead if local disk was rolled back.
      if(!Number.isSafeInteger(minimum)||minimum<0||
        record.revision<minimum)fail();
    }
    return record;
  }
  try{
    db=new DatabaseSync(filename,{timeout:1000});
    // All private event data is GCM encrypted before SQLite sees it.
    // DELETE journal avoids persistent WAL/SHM; FULL fsync durability.
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    db.exec('PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;');
    db.exec('CREATE TABLE IF NOT EXISTS capacity_snapshots ('+
      'scope_key TEXT PRIMARY KEY, envelope BLOB NOT NULL)');
    // The private 0700 parent protects new SQLite files during creation.
    // Apply 0600 before checking file mode; ordinary umask may create 0644.
    if(process.platform!=='win32')fs.chmodSync(filename,0o600);
    checkFile(filename);
  }catch{
    try{db?.close();}catch{}
    fail();
  }
  let closed=false;
  function ensureOpen(){if(closed)fail();}
  function readCursor(){
    ensureOpen();
    const rec=getUnverifiedRecord();
    return rec?structuredClone(rec.cursor):null;
  }
  function readLatest(){
    ensureOpen();
    const rec=getUnverifiedRecord();
    if(!rec)return null;
    try{
      if(!Number.isFinite(nowMs()))fail();
      verifyPrivateSnapshot(rec.snapshot,{scope:checked,secret:signingSecret,
        nowMs:nowMs()});
    }catch{fail();}
    return {snapshot:structuredClone(rec.snapshot),
      metadata:structuredClone(rec.metadata),
      cursor:structuredClone(rec.cursor),revision:rec.revision};
  }
  function commitSnapshot({scope:incoming,expected,next,snapshot,metadata}={}){
    ensureOpen();
    const requested=checkedScope(incoming);
    if(!isDeepStrictEqual(requested,checked)||!cursorShape(next)||
      !snapshot||typeof snapshot!=='object'||snapshot.integrityVerified!==true||
      !metadata||typeof metadata!=='object')fail();
    try{
      const now=nowMs();
      if(!Number.isFinite(now))fail();
      verifyPrivateSnapshot(snapshot,{scope:checked,secret:signingSecret,nowMs:now});
      validateLedger(snapshot.ledger,checked);
      if(snapshot.attestation.runId!==next.runId||
         snapshot.attestation.attempt!==next.attempt||
         snapshot.ledger.revision!==next.ledgerRevision||
         metadata.runId!==next.runId||metadata.attempt!==next.attempt||
         metadata.ledgerRevision!==next.ledgerRevision||
         metadata.sourceVerified!==true)fail();
      db.exec('BEGIN IMMEDIATE');
      try{
        const existing=getUnverifiedRecord();
        const prior=existing?.cursor||null;
        if(!isDeepStrictEqual(prior,expected)) {
          db.exec('ROLLBACK');
          return false;
        }
        const proposed=assertCursor(prior,
          {id:next.runId,attempt:next.attempt},next.ledgerRevision);
        if(!isDeepStrictEqual(proposed,next))fail();
        const nextRevision=(existing?.revision||0)+1;
        const encrypted=protect({version:1,revision:nextRevision,
          cursor:next,snapshot,metadata});
        db.prepare('INSERT INTO capacity_snapshots(scope_key,envelope) VALUES(?,?) '+
          'ON CONFLICT(scope_key) DO UPDATE SET envelope=excluded.envelope')
          .run(scopeKey,encrypted);
        db.exec('COMMIT');
        return true;
      }catch{
        try{db.exec('ROLLBACK');}catch{}
        fail();
      }
    }catch{fail();}
  }
  function checkpoint(){
    ensureOpen();
    const rec=getUnverifiedRecord();
    if(!rec)return null;
    // Commit to the EXACT encrypted record bytes, not only cursor/revision.
    // Two different records at the same cursor/revision must never share an
    // independently anchored checkpoint.
    const row=db.prepare('SELECT envelope FROM capacity_snapshots WHERE scope_key=?')
      .get(scopeKey);
    if(!row||!(row.envelope instanceof Uint8Array))fail();
    const digest=crypto.createHash('sha256')
      .update(DOMAIN+'\0'+scopeKey+'\0')
      .update(Buffer.from(row.envelope)).digest('hex');
    return Object.freeze({revision:rec.revision,digest});
  }
  function exportEncryptedRecord(){
    ensureOpen();
    const proof=checkpoint();
    if(!proof)return null;
    const row=db.prepare('SELECT envelope FROM capacity_snapshots WHERE scope_key=?')
      .get(scopeKey);
    if(!row||!(row.envelope instanceof Uint8Array))fail();
    // This is already AES-GCM ciphertext, not plaintext. Backup service must
    // add independent at-rest encryption and never return it to Discord/CI.
    return Object.freeze({version:1,checkpoint:proof,
      envelope:Buffer.from(row.envelope)});
  }
  function restoreIntoEmptyIsolatedStore(record){
    ensureOpen();
    // Deliberately non-production escape hatch for tested isolated restore.
    // A truthy flag alone is NOT operator authentication or authorization.
    if(enableIsolatedRestore!==true||!record||record.version!==1||
      !(record.envelope instanceof Uint8Array)||
      record.envelope.length<29||record.envelope.length>MAX_CIPHERTEXT||
      !record.checkpoint||!Number.isSafeInteger(record.checkpoint.revision)||
      !/^[a-f0-9]{64}$/.test(record.checkpoint.digest))fail();
    const saved=unprotect(record.envelope);
    if(!saved||saved.version!==1||saved.revision!==record.checkpoint.revision||
      !cursorShape(saved.cursor)||saved.snapshot?.integrityVerified!==true||
      saved.snapshot.attestation?.runId!==saved.cursor.runId||
      saved.snapshot.attestation?.attempt!==saved.cursor.attempt||
      saved.metadata?.runId!==saved.cursor.runId||
      saved.metadata?.ledgerRevision!==saved.cursor.ledgerRevision)fail();
    try{
      validateLedger(saved.snapshot.ledger,checked);
      verifyPrivateSnapshot(saved.snapshot,{scope:checked,secret:signingSecret,
        nowMs:nowMs()});
    }catch{fail();}
    const digest=crypto.createHash('sha256')
      .update(DOMAIN+'\0'+scopeKey+'\0')
      .update(Buffer.from(record.envelope)).digest('hex');
    if(digest!==record.checkpoint.digest)fail();
    db.exec('BEGIN IMMEDIATE');
    try{
      // NEVER overwrite existing state. Production restore requires
      // separate leadership approval and independent-anchor reconciliation.
      const existing=db.prepare('SELECT 1 AS found FROM capacity_snapshots WHERE scope_key=?')
        .get(scopeKey);
      if(existing)fail();
      if(externalMinimumRevision!==null){
        const min=externalMinimumRevision({scope:checked});
        if(min!==0)fail();
      }
      db.prepare('INSERT INTO capacity_snapshots(scope_key,envelope) VALUES(?,?)')
        .run(scopeKey,Buffer.from(record.envelope));
      db.exec('COMMIT');
    }catch{
      try{db.exec('ROLLBACK');}catch{}
      fail();
    }
    return checkpoint();
  }
  function close(){if(!closed){closed=true;db.close();}}
  return Object.freeze({readCursor,readLatest,commitSnapshot,checkpoint,
    exportEncryptedRecord,restoreIntoEmptyIsolatedStore,close});
}
module.exports={createPrivateSqliteSnapshotStore};
