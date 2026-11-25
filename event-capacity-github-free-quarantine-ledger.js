'use strict';
// KINGS CAPACITY: GitHub Free-friendly ENCRYPTED QUARANTINE STATE contract.
// Strictly injected OFFLINE TEST API. No network client/token, no repo
// creation, no production workflow, no real Discord history or approvals.
// GitHub Free is NOT an independent off-provider/highwater backup service.
// Both private repositories have the SAME provider trust boundary.
// Two Contents API writes are NOT a distributed atomic transaction.
// If the second write fails, reads/writes fail-closed pending manual review.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {createKingsStagedImportQuarantinePlan}
  =require('./event-capacity-staged-import-quarantine-plan');
const {runKingsAtomicImportRehearsal}
  =require('./event-capacity-atomic-import-rehearsal');
const DOMAIN='kings-capacity-github-free-quarantine-v1';
const ERROR='Kings GitHub Free quarantined ledger unavailable or inconsistent.';
const ID=/^[1-9]\d{16,21}$/;
const SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const HEX=/^[a-f0-9]{64}$/;
const REPO=/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
const BASE64=/^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BYTES=850*1024,MAX_REV=4;
function fail(){throw new Error(ERROR);}
function exact(value,names){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    Object.getPrototypeOf(value)===Object.prototype&&
    Object.keys(value).sort().join('\0')===names.slice().sort().join('\0');
}
function secret(value){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')<32||
    Buffer.byteLength(value,'utf8')>4096)fail();
  return value;
}
function scopeOf(scope){
  if(!exact(scope,['guildId','forumId'])||
    typeof scope.guildId!=='string'||!ID.test(scope.guildId)||
    typeof scope.forumId!=='string'||!ID.test(scope.forumId))fail();
  return Object.freeze({...scope});
}
function parseJson(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>MAX_BYTES)fail();
  try{
    const obj=JSON.parse(raw);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))fail();
    return obj;
  }catch{fail();}
}
function hmac(key,parts){
  return crypto.createHmac('sha256',key).update(JSON.stringify(parts))
    .digest('hex');
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function safeEq(a,b){
  return typeof a==='string'&&typeof b==='string'&&
    HEX.test(a)&&HEX.test(b)&&
    crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function createKingsGithubFreeQuarantineLedger({
  scope,stateRepository,witnessRepository,transport,
  encryptionSecret,witnessSecret,reviewSecret,
  mode
}={}){
  try{
    const checked=scopeOf(scope);
    if(mode!=='INJECTED_GITHUB_FREE_TEST_ONLY'||
      !REPO.test(stateRepository)||!REPO.test(witnessRepository)||
      stateRepository===witnessRepository||
      stateRepository.split('/')[0]!==witnessRepository.split('/')[0]||
      !transport||typeof transport.describe!=='function'||
      typeof transport.read!=='function'||typeof transport.put!=='function')
      fail();
    secret(encryptionSecret);secret(witnessSecret);secret(reviewSecret);
    if(encryptionSecret===witnessSecret||
      encryptionSecret===reviewSecret||witnessSecret===reviewSecret)
      fail();
    const scopeDigest=hash(DOMAIN+'\0'+checked.guildId+'\0'+checked.forumId);
    const path='quarantine/'+scopeDigest+'.json';
    const witnessPath='witness/'+scopeDigest+'.json';
    const aad=Buffer.from(DOMAIN+'\0'+scopeDigest);
    const encryptionKey=crypto.createHash('sha256')
      .update(DOMAIN+'\0encrypt\0'+encryptionSecret).digest();
    const witnessKey=crypto.createHash('sha256')
      .update(DOMAIN+'\0witness\0'+witnessSecret).digest();
    function checkedInput(sourceInput){
      if(!sourceInput||sourceInput.reviewSecret!==reviewSecret||
        sourceInput.current?.guildId!==checked.guildId||
        sourceInput.current?.currentChannelId!==checked.forumId)fail();
      const p=createKingsStagedImportQuarantinePlan(sourceInput);
      if(p.safeToActivate!==false||p.freeSlotsCertified!==false||
        p.stagingReadyForProduction!==false||p.importOperationsCommitted!==0||
        p.quarantineItems.length!==p.counts.total)fail();
      return p;
    }
    async function verifyPrivateRepositories(){
      for(const repository of [stateRepository,witnessRepository]){
        let metadata;
        try{metadata=await transport.describe({repository});}
        catch{fail();}
        if(!exact(metadata,['full_name','private'])||
          metadata.full_name!==repository||metadata.private!==true)fail();
      }
    }
    async function raw(repository,filePath){
      let result;
      try{result=await transport.read({repository,path:filePath});}
      catch{fail();}
      if(result===null)return null;
      if(!exact(result,['sha','content'])||
        typeof result.sha!=='string'||!SHA.test(result.sha)||
        typeof result.content!=='string'||
        Buffer.byteLength(result.content,'utf8')>MAX_BYTES)fail();
      return result;
    }
    function encode(plain){
      const bytes=Buffer.from(JSON.stringify(plain));
      if(bytes.length>MAX_BYTES*0.65)fail();
      const iv=crypto.randomBytes(12);
      const enc=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);
      enc.setAAD(aad);
      const payload=Buffer.concat([enc.update(bytes),enc.final()]);
      const wrapper={
        version:1,kind:'ENCRYPTED_OFFLINE_QUARANTINE_ONLY',
        scopeDigest,iv:iv.toString('base64'),
        tag:enc.getAuthTag().toString('base64'),
        ciphertext:payload.toString('base64')
      };
      const result=JSON.stringify(wrapper);
      if(Buffer.byteLength(result,'utf8')>MAX_BYTES)fail();
      return result;
    }
    function decode(rawValue){
      const value=parseJson(rawValue);
      if(!exact(value,['version','kind','scopeDigest','iv','tag','ciphertext'])||
        value.version!==1||value.kind!=='ENCRYPTED_OFFLINE_QUARANTINE_ONLY'||
        value.scopeDigest!==scopeDigest||
        typeof value.iv!=='string'||typeof value.tag!=='string'||
        typeof value.ciphertext!=='string'||
        !BASE64.test(value.iv)||!BASE64.test(value.tag)||
        !BASE64.test(value.ciphertext))fail();
      try{
        const iv=Buffer.from(value.iv,'base64'),tag=Buffer.from(value.tag,'base64');
        if(iv.length!==12||tag.length!==16)fail();
        const dec=crypto.createDecipheriv('aes-256-gcm',encryptionKey,iv);
        dec.setAAD(aad);dec.setAuthTag(tag);
        return parseJson(Buffer.concat([
          dec.update(Buffer.from(value.ciphertext,'base64')),dec.final()
        ]).toString('utf8'));
      }catch{fail();}
    }
    function verifyRecord(record,plan,sourceInput){
      if(!exact(record,['version','kind','revision','planSeal','counts',
        'quarantineItems','checkpoint'])||
        record.version!==1||record.kind!=='OFFLINE_QUARANTINE_ONLY'||
        !Number.isSafeInteger(record.revision)||
        record.revision<1||record.revision>MAX_REV||
        record.planSeal!==plan.replaySeal||
        !isDeepStrictEqual(record.counts,plan.counts)||
        !isDeepStrictEqual(record.quarantineItems,plan.quarantineItems)||
        !record.checkpoint||record.checkpoint.phaseIndex!==record.revision-1)
        fail();
      const audit=runKingsAtomicImportRehearsal({
        sourceInput,checkpoint:record.checkpoint
      });
      if(audit.safeToActivate!==false||audit.freeSlotsCertified!==false)fail();
    }
    function witnessValue(revision,stateDigest){
      const body={version:1,kind:'SAME_GITHUB_PROVIDER_WITNESS',
        scopeDigest,revision,stateDigest};
      return JSON.stringify({...body,mac:hmac(witnessKey,Object.values(body))});
    }
    function verifyWitness(value,revision,stateDigest){
      if(!exact(value,['version','kind','scopeDigest','revision','stateDigest','mac'])||
        value.version!==1||value.kind!=='SAME_GITHUB_PROVIDER_WITNESS'||
        value.scopeDigest!==scopeDigest||
        value.revision!==revision||!HEX.test(value.stateDigest)||
        value.stateDigest!==stateDigest||!HEX.test(value.mac))fail();
      const expected=hmac(witnessKey,[value.version,value.kind,
        value.scopeDigest,value.revision,value.stateDigest]);
      if(!safeEq(value.mac,expected))fail();
    }
    async function pair(sourceInput,plan){
      await verifyPrivateRepositories();
      const [state,witness]=await Promise.all([
        raw(stateRepository,path),raw(witnessRepository,witnessPath)
      ]);
      if((state===null)!==(witness===null))fail();
      if(state===null)return {state:null,witness:null,record:null};
      const record=decode(state.content);
      verifyRecord(record,plan,sourceInput);
      verifyWitness(parseJson(witness.content),record.revision,hash(state.content));
      return {state,witness,record};
    }
    async function inspect({sourceInput}={}){
      try{
        const plan=checkedInput(sourceInput);
        const before=await pair(sourceInput,plan);
        const after=await pair(sourceInput,plan);
        if(!isDeepStrictEqual(before.state,after.state)||
          !isDeepStrictEqual(before.witness,after.witness))fail();
        return Object.freeze({
          visibility:'PRIVATE_ONLY',readOnly:true,
          state:before.record?'MATCHING_PRIVATE_GITHUB_CLAIMS':
            'TWO_EMPTY_PRIVATE_GITHUB_REPOS',
          revision:before.record?.revision??0,
          quarantinedItemClaims:before.record?.counts.total??0,
          githubRepositoryPrivacyWasClaimedByProvider:true,
          twoPrivateGitHubRepositoriesAreNOTIndependentOffProviderBackup:true,
          actualIndependentHighwaterAuthenticated:false,
          originalDiscordSourcesAuthenticated:false,
          liveEventChanges:0,oldBookingsReleased:0,
          freeSlotsCertified:false,safeToActivate:false
        });
      }catch{fail();}
    }
    async function advance({sourceInput,expectedRevision}={}){
      try{
        if(!Number.isSafeInteger(expectedRevision)||
          expectedRevision<0||expectedRevision>MAX_REV)fail();
        const plan=checkedInput(sourceInput);
        const before=await pair(sourceInput,plan);
        const prior=before.record,rev=prior?.revision??0;
        if(rev!==expectedRevision){
          if(rev===expectedRevision+1)return Object.freeze({
            state:'ALREADY_WITNESSED_GITHUB_REPLAY',
            revision:rev,liveEventChanges:0,oldBookingsReleased:0,
            freeSlotsCertified:false,safeToActivate:false
          });
          fail();
        }
        if(rev===MAX_REV)return Object.freeze({
          state:'SYNTHETIC_DRILL_ALREADY_COMPLETE',revision:rev,
          liveEventChanges:0,oldBookingsReleased:0,
          freeSlotsCertified:false,safeToActivate:false
        });
        const result=runKingsAtomicImportRehearsal({
          sourceInput,checkpoint:prior?.checkpoint??null
        });
        if(result.checkpoint?.phaseIndex!==rev||
          result.checkpoint.planSeal!==plan.replaySeal||
          result.safeToActivate!==false)fail();
        const next={
          version:1,kind:'OFFLINE_QUARANTINE_ONLY',
          revision:rev+1,planSeal:plan.replaySeal,
          counts:plan.counts,quarantineItems:plan.quarantineItems,
          checkpoint:result.checkpoint
        };
        const encoded=encode(next);
        // Atomic optimistic update for ONE GitHub file only. This cannot
        // make a distributed two-repository commit atomic.
        try{
          await transport.put({
            repository:stateRepository,path,
            expectedSha:before.state?.sha??null,
            content:encoded,
            message:'chore(private): advance encrypted synthetic quarantine review'
          });
        }catch{fail();}
        const witnessContent=witnessValue(next.revision,hash(encoded));
        try{
          await transport.put({
            repository:witnessRepository,path:witnessPath,
            expectedSha:before.witness?.sha??null,
            content:witnessContent,
            message:'chore(private): witness encrypted synthetic quarantine revision'
          });
        }catch{fail();}
        const after=await pair(sourceInput,plan);
        if(after.record?.revision!==next.revision||
          after.state.content!==encoded||
          after.witness.content!==witnessContent)fail();
        return Object.freeze({
          state:'GITHUB_PRIVATE_QUARANTINE_CLAIMS_MATCH',
          revision:next.revision,quarantinedItemClaims:plan.counts.total,
          sameProviderCommitWasNotDistributedAtomic:true,
          independentBackupAndOwnerHighwaterNOTCertified:true,
          realEventImports:0,realEventDeletions:0,
          oldBookingsReleased:0,
          freeSlotsCertified:false,safeToActivate:false
        });
      }catch{fail();}
    }
    return Object.freeze({inspect,advance});
  }catch{fail();}
}
module.exports={createKingsGithubFreeQuarantineLedger};
