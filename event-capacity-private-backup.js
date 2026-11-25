'use strict';
// DRAFT: private encrypted backup and isolated restore harness for Kings Events.
// The host must provision independent private storage, keys, audit, and an
// authorized independent checkpoint service. This code schedules/sends NOTHING.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity encrypted backup could not be verified.';
const DOMAIN='kings-event-capacity-private-backup-v1';
const NAME=/^kings-capacity-(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\.enc$/;
const SCOPE=/^\d{17,22}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX_ENVELOPE=48*1024*1024+28;
const MAX_FILE=80*1024*1024;
const RETAIN_DAYS=90;
function fail(){throw new Error(ERROR);}
function scopeOf(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    !SCOPE.test(String(scope.guildId||''))||
    !SCOPE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function validDay(value){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
  const ms=Date.parse(value+'T00:00:00.000Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
function fileName(day){
  if(!validDay(day))fail();
  return 'kings-capacity-'+day+'.enc';
}
function privateDir(directory,repoRoot){
  if(typeof directory!=='string'||!path.isAbsolute(directory))fail();
  const st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
  const real=fs.realpathSync(directory),repo=fs.realpathSync(repoRoot);
  const rel=path.relative(repo,real);
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))fail();
  return real;
}
function protectedFile(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<29||
    stat.size>MAX_FILE||(process.platform!=='win32'&&(stat.mode&0o077)!==0))fail();
}
function acceptable(record){
  if(!record||record.version!==1||!record.checkpoint||
    !Number.isSafeInteger(record.checkpoint.revision)||
    record.checkpoint.revision<1||!HEX.test(record.checkpoint.digest)||
    !(record.envelope instanceof Uint8Array)||
    record.envelope.length<29||record.envelope.length>MAX_ENVELOPE)fail();
  return {version:1,checkpoint:{...record.checkpoint},
    envelope:Buffer.from(record.envelope)};
}
function createPrivateBackupService({
  directory,scope,backupSecret,nowMs=()=>Date.now(),
  repositoryRoot=__dirname
}={}){
  const checked=scopeOf(scope);
  if(typeof backupSecret!=='string'||Buffer.byteLength(backupSecret,'utf8')<32||
    typeof nowMs!=='function')fail();
  const dir=privateDir(directory,repositoryRoot);
  const key=crypto.createHash('sha256').update(DOMAIN+'\0'+backupSecret).digest();
  const aad=Buffer.from(DOMAIN+'\0'+checked.guildId+'\0'+checked.forumId);
  function currentDate(){
    const now=nowMs();if(!Number.isFinite(now))fail();
    return new Date(now).toISOString().slice(0,10);
  }
  function seal(value){
    const plaintext=Buffer.from(JSON.stringify(value),'utf8');
    if(plaintext.length>MAX_FILE-28)fail();
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(aad);
    const raw=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),raw]);
  }
  function open(ciphertext){
    if(!Buffer.isBuffer(ciphertext)||ciphertext.length<29||
      ciphertext.length>MAX_FILE)fail();
    try{
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,ciphertext.subarray(0,12));
      decipher.setAAD(aad);decipher.setAuthTag(ciphertext.subarray(12,28));
      const body=Buffer.concat([
        decipher.update(ciphertext.subarray(28)),decipher.final()
      ]);
      const data=JSON.parse(body.toString('utf8'));
      if(!data||data.version!==1||
        data.scope?.guildId!==checked.guildId||
        data.scope?.forumId!==checked.forumId||
        !validDay(data.day)||!data.record||!data.record.envelopeBase64)fail();
      const bytes=Buffer.from(data.record.envelopeBase64,'base64');
      if(bytes.toString('base64')!==data.record.envelopeBase64)fail();
      const record=acceptable({version:1,
        checkpoint:data.record.checkpoint,envelope:bytes});
      return {day:data.day,record};
    }catch{fail();}
  }
  async function createDailyBackup({anchoredStore}={}){
    // This method deliberately requires the external-anchor wrapper, not a
    // raw local SQLite store. Every successful backup has a verified highwater.
    if(!anchoredStore||typeof anchoredStore.verifyCheckpoint!=='function'||
      typeof anchoredStore.exportEncryptedRecord!=='function')fail();
    const day=currentDate(),name=fileName(day);
    const final=path.join(dir,name);
    const initial=await anchoredStore.verifyCheckpoint().catch(()=>fail());
    if(!initial||!initial.local||!isDeepStrictEqual(initial.local,initial.remote))fail();
    let record,after;
    try{
      record=acceptable(await anchoredStore.exportEncryptedRecord());
      after=await anchoredStore.verifyCheckpoint();
    }catch{fail();}
    if(!isDeepStrictEqual(record.checkpoint,initial.local)||
      !isDeepStrictEqual(record.checkpoint,after?.local)||
      !isDeepStrictEqual(after.local,after.remote))fail();
    const cipher=seal({version:1,scope:checked,day,record:{
      checkpoint:record.checkpoint,envelopeBase64:record.envelope.toString('base64')
    }});
    if(cipher.length>MAX_FILE)fail();
    const temp=path.join(dir,'.kings-capacity-'+crypto.randomBytes(12).toString('hex')+'.tmp');
    let fd=null,linked=false;
    try{
      if(fs.existsSync(final))fail();
      fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
      fs.writeFileSync(fd,cipher);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      // Hard link creates final atomically WITHOUT overwriting same-day backup.
      fs.linkSync(temp,final);linked=true;
      if(process.platform!=='win32'){
        const dirfd=fs.openSync(dir,fs.constants.O_RDONLY);
        try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
      }
      return Object.freeze({fileName:name,day,
        checkpoint:{...record.checkpoint},encrypted:true});
    }catch{fail();}
    finally{
      if(fd!==null)try{fs.closeSync(fd);}catch{}
      try{fs.unlinkSync(temp);}catch{}
      // A failed directory fsync may leave an archive; it is never silently
      // treated as successful. Operator must verify and reconcile explicitly.
    }
  }
  function readVerifiedBackup(name){
    if(typeof name!=='string'||!NAME.test(name)||!validDay(NAME.exec(name)[1]))fail();
    const filename=path.join(dir,name);
    protectedFile(filename);
    let result;
    try{result=open(fs.readFileSync(filename));}catch{fail();}
    if(result.day!==NAME.exec(name)[1])fail();
    return result;
  }
  function proposeRetention({atMs=nowMs()}={}){
    if(!Number.isFinite(atMs))fail();
    const olderThan=atMs-RETAIN_DAYS*86400000;
    const candidates=[];
    for(const name of fs.readdirSync(dir)){
      const match=NAME.exec(name);
      if(!match||!validDay(match[1]))continue;
      const day=Date.parse(match[1]+'T00:00:00.000Z');
      if(day<olderThan)candidates.push(name);
    }
    // Planning only. Real deletion must respect retention, legal holds,
    // backup erasure propagation and an independently authorized service.
    return candidates.sort();
  }
  function monthlyRestoreDue(lastVerifiedRestoreAt=null){
    const day=currentDate();
    if(lastVerifiedRestoreAt===null)return true;
    if(typeof lastVerifiedRestoreAt!=='string'||
      !/^\d{4}-\d{2}-\d{2}T/.test(lastVerifiedRestoreAt)||
      !Number.isFinite(Date.parse(lastVerifiedRestoreAt)))fail();
    return lastVerifiedRestoreAt.slice(0,7)!==day.slice(0,7);
  }
  function restoreOnlyToEmptyIsolatedStore({fileName:requested,targetStore,
    isolatedTestMode=false}={}){
    if(isolatedTestMode!==true||!targetStore||
      typeof targetStore.restoreIntoEmptyIsolatedStore!=='function')fail();
    const record=readVerifiedBackup(requested).record;
    let recovered;
    try{recovered=targetStore.restoreIntoEmptyIsolatedStore(record);}catch{fail();}
    if(!isDeepStrictEqual(recovered,record.checkpoint))fail();
    // This is an isolated restore TEST, not approval to replace production.
    return Object.freeze({restoredCheckpoint:recovered,isolatedOnly:true});
  }
  return Object.freeze({
    createDailyBackup,readVerifiedBackup,proposeRetention,monthlyRestoreDue,
    restoreOnlyToEmptyIsolatedStore
  });
}
module.exports={createPrivateBackupService};
