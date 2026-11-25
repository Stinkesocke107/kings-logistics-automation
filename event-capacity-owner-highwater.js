'use strict';
// OFFLINE-OWNER-SIGNED checkpoint receipt; the signing private key must NEVER
// be present on GitHub Actions, in either GitHub repository or Discord.
// Public verification key is sufficient on the read/approval worker.
// This is a pinned independent highwater FLOOR; it cannot attest unseen later
// revisions or protect against a compromised owner signing key.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity independently held owner receipt could not be verified.';
const DOMAIN='kings-event-capacity-owner-receipt-v1';
const SNOWFLAKE=/^\d{17,22}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const SIGNATURE=/^[A-Za-z0-9+/]{86}==$/;
function fail(){throw new Error(ERROR);}
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
    !DIGEST.test(x.digest))fail();
  return {revision:x.revision,digest:x.digest};
}
function canonical(scope,proof,issuedAt){
  return Buffer.from([
    DOMAIN,scope.guildId,scope.forumId,
    String(proof.revision),proof.digest,issuedAt
  ].join('\0'),'utf8');
}
function validIssuedAt(at){
  if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(at)||
    Number.isNaN(Date.parse(at))||new Date(at).toISOString()!==at)fail();
  return at;
}
function publicKeyOf(value){
  let key;
  try{key=crypto.createPublicKey(value);}catch{fail();}
  if(key.asymmetricKeyType!=='ed25519')fail();
  return key;
}
function privateKeyOf(value){
  let key;
  try{key=crypto.createPrivateKey(value);}catch{fail();}
  if(key.asymmetricKeyType!=='ed25519')fail();
  return key;
}
function issueOwnerReceipt({scope,checkpoint,issuedAt,privateKey}={}){
  const checked=scopeOf(scope),proof=checkpointOf(checkpoint);
  const at=validIssuedAt(issuedAt),key=privateKeyOf(privateKey);
  const signature=crypto.sign(null,canonical(checked,proof,at),key)
    .toString('base64');
  return Object.freeze({version:1,scope:checked,checkpoint:proof,
    issuedAt:at,signature});
}
function verifyOwnerReceipt({receipt,scope,publicKey,nowMs=Date.now()}={}){
  const checked=scopeOf(scope);
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    Object.keys(receipt).sort().join(',')!==
      'checkpoint,issuedAt,scope,signature,version'||
    receipt.version!==1||!isDeepStrictEqual(scopeOf(receipt.scope),checked)||
    !SIGNATURE.test(receipt.signature)||
    !Number.isFinite(nowMs))fail();
  const proof=checkpointOf(receipt.checkpoint),
    at=validIssuedAt(receipt.issuedAt);
  if(Date.parse(at)>nowMs+60000)fail();
  const publicKeyObject=publicKeyOf(publicKey);
  const signature=Buffer.from(receipt.signature,'base64');
  if(signature.length!==64||signature.toString('base64')!==receipt.signature)fail();
  let good;
  try{good=crypto.verify(null,canonical(checked,proof,at),
    publicKeyObject,signature);}catch{fail();}
  if(good!==true)fail();
  return Object.freeze({scope:checked,checkpoint:proof,issuedAt:at});
}
function createOwnerPinnedVault({
  vault,witness,scope,ownerReceipt,ownerPublicKey,nowMs=()=>Date.now()
}={}){
  const checked=scopeOf(scope);
  if(!vault||!witness||
    ['read','commitDecision'].some(x=>typeof vault[x]!=='function')||
    typeof witness.load!=='function'||typeof nowMs!=='function')fail();
  function pin(){
    return verifyOwnerReceipt({receipt:ownerReceipt,scope:checked,
      publicKey:ownerPublicKey,nowMs:nowMs()}).checkpoint;
  }
  async function guard({exact=false}={}){
    const minimum=pin();
    let remote;
    try{remote=checkpointOf(await witness.load({scope:checked}));}
    catch{fail();}
    // This protects against a coordinated rollback of BOTH GitHub private
    // repositories to a revision below a separately retained owner's proof.
    if(remote.revision<minimum.revision||
      remote.revision===minimum.revision&&remote.digest!==minimum.digest)fail();
    // A new APPROVAL write is only allowed from the exact owner-pinned state;
    // after one write the owner must sign and retain a new independent receipt.
    if(exact&&!isDeepStrictEqual(remote,minimum))fail();
    return remote;
  }
  async function read(){
    const before=await guard();
    let result;
    try{result=await vault.read();}catch{fail();}
    const after=await guard();
    if(!isDeepStrictEqual(before,after)||
      !isDeepStrictEqual(checkpointOf(result?.checkpoint),after))fail();
    return result;
  }
  async function commitDecision(input){
    const before=await guard({exact:true});
    let result;
    try{result=await vault.commitDecision(input);}catch{fail();}
    const after=await guard();
    if(after.revision!==before.revision+1||
      !isDeepStrictEqual(checkpointOf(result?.checkpoint),after))fail();
    // The caller MUST retain a newly signed receipt outside both GitHub
    // repositories before approving another write. No auto-signing in CI.
    return Object.freeze({...result,ownerReceiptUpdateRequired:true});
  }
  return Object.freeze({guard,read,commitDecision});
}
module.exports={issueOwnerReceipt,verifyOwnerReceipt,createOwnerPinnedVault};
