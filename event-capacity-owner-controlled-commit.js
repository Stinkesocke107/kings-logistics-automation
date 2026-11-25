'use strict';
// OFFLINE OWNER-APPROVED ONE-DECISION PRIVATE COMMIT (DRAFT).
// Never wired to production GitHub Actions or raw Discord commands.
// Owner Ed25519 signing private key remains OFFLINE: CI only verifies.
// A verified GitHub source callback and owner-pinned private vault are
// independently required; this wrapper does NOT authenticate injected stubs.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {verifyOwnerReceipt}=require('./event-capacity-owner-highwater');
const {stageReviewedDecision}=require('./event-capacity-reviewed-staging');
const ERROR='Kings Event Capacity owner-controlled commit blocked; reconcile privately.';
const DOMAIN='kings-event-capacity-owner-single-commit-v1';
const SNOWFLAKE=/^\d{17,22}$/;
const RUN=/^[1-9]\d{5,19}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
const SIG=/^[A-Za-z0-9+/]{86}==$/;
const TIME_WINDOW=15*60*1000;
function fail(){throw new Error(ERROR);}
function iso(x){
  if(typeof x!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)||
    !Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)fail();
  return x;
}
function scopeOf(x){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    !SNOWFLAKE.test(String(x.guildId||''))||
    !SNOWFLAKE.test(String(x.forumId||'')))fail();
  return {guildId:String(x.guildId),forumId:String(x.forumId)};
}
function checkpointOf(x){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).sort().join(',')!=='digest,revision'||
    !Number.isSafeInteger(x.revision)||x.revision<0||
    !DIGEST.test(String(x.digest||'')))fail();
  return {revision:x.revision,digest:x.digest};
}
function keys(input,kind){
  try{
    const key=kind==='public'?crypto.createPublicKey(input):
      crypto.createPrivateKey(input);
    if(key.asymmetricKeyType!=='ed25519')fail();
    return key;
  }catch{fail();}
}
function payloadFor({staged,scope,checkpoint,issuedAt,expiresAt,nonce}={}){
  const s=scopeOf(scope),cp=checkpointOf(checkpoint);
  if(!staged||typeof staged!=='object'||
    staged.state!=='ReadyForOwnerControlledCommit'||
    staged.readOnly!==true||staged.decisionCommitted!==false||
    staged.availabilityCertified!==false||
    staged.ownerReceiptRequired!==true||
    !staged.command||!staged.actor||
    staged.actor.source!=='trusted-server-gateway'||
    !Array.isArray(staged.actor.verifiedRoles)||
    staged.actor.verifiedRoles.length!==1||
    !['CEO','Event Leadership'].includes(staged.actor.verifiedRoles[0])||
    !SNOWFLAKE.test(String(staged.actor.id||''))||
    !DIGEST.test(String(staged.sourceDigest||''))||
    !Number.isSafeInteger(staged.expectedRevision)||
    staged.expectedRevision!==cp.revision||
    !['classification','departure','end'].includes(staged.command.action)||
    staged.command.expectedRevision!==staged.expectedRevision)fail();
  const command=staged.command,p=command.reviewProof;
  if(!p||typeof p!=='object'||p.version!==1||
    !SNOWFLAKE.test(String(p.evidenceMessageId||''))||
    !SNOWFLAKE.test(String(p.reviewMessageId||''))||
    !SNOWFLAKE.test(String(p.submitterId||''))||
    !SNOWFLAKE.test(String(p.reviewerId||''))||
    p.submitterId===p.reviewerId||
    p.reviewerId!==staged.actor.id||
    !RUN.test(String(p.sourceRunId||''))||
    !Number.isSafeInteger(p.sourceAttempt)||p.sourceAttempt<1||
    !DIGEST.test(String(p.sourceDigest||''))||
    p.sourceDigest!==staged.sourceDigest||
    command.evidenceRef!=='discord:'+p.evidenceMessageId+
      ':review:'+p.reviewMessageId||
    typeof command.ref!=='string'||
    !/^(?:event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/.test(command.ref)||
    typeof command.value!=='string'||command.value.length>64||
    !NONCE.test(String(nonce||'')))fail();
  const from=Date.parse(iso(issuedAt)),until=Date.parse(iso(expiresAt));
  if(until<=from||until-from>TIME_WINDOW)fail();
  return {
    version:1,scope:s,checkpoint:cp,
    ref:command.ref,action:command.action,value:command.value,
    evidenceRef:command.evidenceRef,
    submitterId:p.submitterId,reviewerId:p.reviewerId,
    sourceRunId:p.sourceRunId,sourceAttempt:p.sourceAttempt,
    sourceDigest:p.sourceDigest,expectedRevision:cp.revision,
    issuedAt,expiresAt,nonce
  };
}
function message(p){return Buffer.from(DOMAIN+'\0'+JSON.stringify(p),'utf8');}
function issueOwnerCommitPermit({staged,scope,checkpoint,
  issuedAt,expiresAt,nonce,ownerPrivateKey}={}){
  const payload=payloadFor({staged,scope,checkpoint,
    issuedAt,expiresAt,nonce});
  const signature=crypto.sign(null,message(payload),
    keys(ownerPrivateKey,'private')).toString('base64');
  return Object.freeze({version:1,payload,signature});
}
function verifyOwnerCommitPermit({permit,staged,scope,checkpoint,
  ownerPublicKey,nowMs=Date.now()}={}){
  if(!permit||typeof permit!=='object'||Array.isArray(permit)||
    Object.keys(permit).sort().join(',')!=='payload,signature,version'||
    permit.version!==1||!SIG.test(permit.signature)||
    !Number.isFinite(nowMs))fail();
  const p=permit.payload;
  if(!p||typeof p!=='object'||Array.isArray(p)||
    Object.keys(p).sort().join(',')!==
      'action,checkpoint,evidenceRef,expectedRevision,expiresAt,issuedAt,nonce,ref,reviewerId,scope,sourceAttempt,sourceDigest,sourceRunId,submitterId,value,version')fail();
  const expected=payloadFor({staged,scope,checkpoint,
    issuedAt:p.issuedAt,expiresAt:p.expiresAt,nonce:p.nonce});
  if(!isDeepStrictEqual(p,expected)||nowMs<Date.parse(p.issuedAt)-60000||
    nowMs>Date.parse(p.expiresAt))fail();
  const sig=Buffer.from(permit.signature,'base64');
  if(sig.length!==64||sig.toString('base64')!==permit.signature||
    !crypto.verify(null,message(expected),keys(ownerPublicKey,'public'),sig))
    fail();
  return Object.freeze({verified:true,revision:expected.expectedRevision,
    sourceDigest:expected.sourceDigest});
}
function sameStage(a,b){
  // The runtime stamps reviewedAt; two stage passes in one invocation
  // deliberately use the same captured current time.
  return a&&b&&isDeepStrictEqual(a.command,b.command)&&
    isDeepStrictEqual(a.actor,b.actor)&&
    a.sourceDigest===b.sourceDigest&&
    a.expectedRevision===b.expectedRevision;
}
async function commitOwnerApprovedDecision({
  permit,ownerReceipt,ownerPublicKey,protectedVault,
  readVerifiedSource,client,config,scope,
  proposal,challenge,reviewMessageId,reviewSecret,nowMs=Date.now()
}={}){
  if(!protectedVault||typeof protectedVault.read!=='function'||
    typeof protectedVault.commitDecision!=='function'||
    typeof readVerifiedSource!=='function'||!Number.isFinite(nowMs))fail();
  const scoped=scopeOf(scope);
  try{
    const pin=verifyOwnerReceipt({
      receipt:ownerReceipt,scope:scoped,publicKey:ownerPublicKey,nowMs
    }).checkpoint;
    const initial=await protectedVault.read();
    if(!isDeepStrictEqual(checkpointOf(initial?.checkpoint),pin)||
      initial?.ledger?.revision!==pin.revision)fail();
    const inputs={readVerifiedSource,protectedVault,client,config,scope:scoped,
      proposal,challenge,reviewMessageId,secret:reviewSecret,nowMs};
    const prepared=await stageReviewedDecision(inputs);
    verifyOwnerCommitPermit({permit,staged:prepared,
      checkpoint:pin,scope:scoped,ownerPublicKey,nowMs});
    // Late recheck of source, original private messages, BOTH staff roles,
    // and exact owner-pinned encrypted ledger revision. Race-free source
    // snapshot / GitHub CAS must ultimately be implemented in the release.
    const last=await stageReviewedDecision(inputs);
    if(!sameStage(prepared,last))fail();
    verifyOwnerCommitPermit({permit,staged:last,checkpoint:pin,
      scope:scoped,ownerPublicKey,nowMs});
    const justBefore=await protectedVault.read();
    if(!isDeepStrictEqual(checkpointOf(justBefore?.checkpoint),pin)||
      !isDeepStrictEqual(initial.ledger,justBefore.ledger))fail();
    // A single durable private GitHub Contents CAS write and separately
    // signed witness are performed by owner-pinned vault internals. No
    // retries on ambiguous GitHub failure; require operator reconciliation.
    const result=await protectedVault.commitDecision({
      command:last.command,actor:last.actor,
      at:new Date(nowMs).toISOString()
    });
    if(result?.ownerReceiptUpdateRequired!==true||
      result?.checkpoint?.revision!==pin.revision+1||
      !DIGEST.test(String(result?.checkpoint?.digest||'')))fail();
    return Object.freeze({
      state:'StoredPendingOwnerResign',
      committed:true,availabilityCertified:false,
      ownerReceiptUpdateRequired:true,
      nextRevision:result.checkpoint.revision
    });
  }catch{fail();}
}
module.exports={issueOwnerCommitPermit,verifyOwnerCommitPermit,
  commitOwnerApprovedDecision};
