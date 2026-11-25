'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createEmptyLedger,applyDecision}=require('../event-capacity-decision-ledger');
const {issueOwnerReceipt,createOwnerPinnedVault}
  =require('../event-capacity-owner-highwater');
const {buildHumanReviewChallenge}=require('../event-capacity-human-review');
const {stageReviewedDecision}=require('../event-capacity-reviewed-staging');
const {issueOwnerCommitPermit,verifyOwnerCommitPermit,
  commitOwnerApprovedDecision}
  =require('../event-capacity-owner-controlled-commit');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const CHANNEL='222222222222222222',BOT='999999999999999999';
const SUBMITTER='111111111111111111',REVIEWER='222222222222222222';
const EVIDENCE='777777777777777777',REVIEW='888888888888888888';
const COORD='333333333333333333',LEAD='444444444444444444';
const CEO='666666666666666666',OTHER='555555555555555555';
const THREAD='999999999999999999',RUN='45502949674';
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const REVIEW_SECRET='synthetic-isolated-review-code-secret-00000000001';
const approvalNonce='a'.repeat(32);
const config={guildId:SCOPE.guildId,channelId:CHANNEL,
  roles:{'Event Coordination':COORD,'Event Leadership':LEAD,CEO}};
const proposal={messageId:EVIDENCE,actorId:SUBMITTER,ref:'event:20270',
  field:'category',value:'Partner Convoy',sourceMatched:true,
  reviewStatus:'Needs Human Review',classificationApproved:false,
  capacityConfirmed:false};
function source(){
  const departureAtUtc='2027-03-21T16:00:00Z';
  return {
    sourceKind:'authenticated-kings-convoy-checker',runId:RUN,attempt:1,
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:39:00Z',
      finalization:{finalizedAt:'2027-03-20T11:40:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{eventId:'20270',threadId:THREAD,status:'Scheduled',
        name:'Synthetic event',
        validation:{parsed:{eventType:'Partner Convoy',departureAtUtc}}}]},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:41:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{source:'convoy-center',eventId:'20270',
        threadId:THREAD,status:'Scheduled',departureAtUtc}]}
  };
}
function harness({
  reviewerRoles=[LEAD],submitterRoles=[COORD],sourceChangesAt=null,
  ledgerChangesAt=null,commitCrashes=false
}={}){
  const kp=crypto.generateKeyPairSync('ed25519');
  const ownerPublicKey=kp.publicKey.export({format:'pem',type:'spki'});
  const ownerPrivateKey=kp.privateKey.export({format:'pem',type:'pkcs8'});
  let ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let checkpoint={revision:0,digest:'1'.repeat(64)};
  const originalCheckpoint=structuredClone(checkpoint);
  const ownerReceipt=issueOwnerReceipt({scope:SCOPE,
    checkpoint,issuedAt:'2027-03-20T11:45:00.000Z',
    privateKey:ownerPrivateKey});
  const challenge=buildHumanReviewChallenge({
    scope:SCOPE,proposal,sourceRunId:RUN,ledgerRevision:0,
    nowMs:NOW-15*60000,secret:REVIEW_SECRET
  });
  const evidence={id:EVIDENCE,channel_id:CHANNEL,
    author:{id:SUBMITTER,bot:false},
    timestamp:'2027-03-20T11:30:00.000Z',
    content:'!capacity evidence event:20270 category partner',
    edited_timestamp:null};
  const review={id:REVIEW,channel_id:CHANNEL,
    author:{id:REVIEWER,bot:false},
    timestamp:'2027-03-20T11:50:00.000Z',
    content:challenge.reviewCommand,edited_timestamp:null};
  let vaultReads=0,sourceReads=0,commits=0;
  const client={
    me:async()=>({id:BOT}),
    channel:async()=>({id:CHANNEL,guild_id:SCOPE.guildId,type:0,
      permission_overwrites:[
        {id:SCOPE.guildId,type:0,allow:'0',deny:'1024'},
        ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'}))
      ]}),
    roles:async()=>[SCOPE.guildId,COORD,LEAD,CEO,OTHER]
      .map(id=>({id,permissions:'66560'})),
    member:async(_,id)=>({user:{id},
      roles:id===SUBMITTER?submitterRoles:
        id===REVIEWER?reviewerRoles:[]}),
    message:async(_,id)=>id===EVIDENCE?evidence:id===REVIEW?review:null
  };
  const readVerifiedSource=async()=>{
    sourceReads++;
    const result=source();
    if(sourceChangesAt!==null&&sourceReads>=sourceChangesAt)
      result.report.threads[0].validation.parsed.eventType='External Convoy';
    return result;
  };
  const witness={load:async()=>structuredClone(checkpoint)};
  const vault={
    read:async()=>{
      vaultReads++;
      if(ledgerChangesAt!==null&&vaultReads>=ledgerChangesAt)
        checkpoint={revision:1,digest:'2'.repeat(64)};
      return {ledger:structuredClone(ledger),
        checkpoint:structuredClone(checkpoint)};
    },
    commitDecision:async({command,actor,at})=>{
      commits++;
      const updated=applyDecision(ledger,command,actor,at);
      ledger=updated;
      checkpoint={revision:updated.revision,
        digest:crypto.createHash('sha256')
          .update(JSON.stringify(updated)).digest('hex')};
      if(commitCrashes)throw Error('simulated ambiguous remote acknowledgement');
      return {checkpoint:structuredClone(checkpoint)};
    }
  };
  const protectedVault=createOwnerPinnedVault({
    vault,witness,scope:SCOPE,ownerReceipt,ownerPublicKey,nowMs:()=>NOW
  });
  const inputs={protectedVault,readVerifiedSource,client,config,
    scope:SCOPE,proposal,challenge,reviewMessageId:REVIEW,
    secret:REVIEW_SECRET,nowMs:NOW};
  const stage=()=>stageReviewedDecision(inputs);
  const sign=async()=>{
    const staged=await stage();
    return issueOwnerCommitPermit({
      staged,scope:SCOPE,checkpoint:originalCheckpoint,
      issuedAt:'2027-03-20T12:00:00.000Z',
      expiresAt:'2027-03-20T12:10:00.000Z',
      nonce:approvalNonce,ownerPrivateKey
    });
  };
  const commit=(permit,overrides={})=>commitOwnerApprovedDecision({
    permit,ownerReceipt,ownerPublicKey,
    protectedVault,readVerifiedSource,client,config,scope:SCOPE,
    proposal,challenge,reviewMessageId:REVIEW,
    reviewSecret:REVIEW_SECRET,nowMs:NOW,...overrides
  });
  return {sign,commit,stage,client,witness,protectedVault,
    ownerReceipt,ownerPrivateKey,ownerPublicKey,originalCheckpoint,
    current:()=>({ledger,checkpoint}),
    stats:()=>({commits,vaultReads,sourceReads})};
}
test('Offline owner permit authorizes exactly ONE revision with no extra bot host',async()=>{
  const f=harness();
  const permit=await f.sign();
  assert.equal(verifyOwnerCommitPermit({
    permit,staged:await f.stage(),scope:SCOPE,
    checkpoint:f.originalCheckpoint,
    ownerPublicKey:f.ownerPublicKey,nowMs:NOW
  }).verified,true);
  assert.equal(JSON.stringify(permit).includes('PRIVATE KEY'),false);
  const result=await f.commit(permit);
  assert.deepEqual(result,{
    state:'StoredPendingOwnerResign',committed:true,
    availabilityCertified:false,ownerReceiptUpdateRequired:true,
    nextRevision:1
  });
  assert.equal(f.stats().commits,1);
  const current=f.current();
  assert.equal(current.ledger.revision,1);
  assert.equal(current.ledger.history.length,1);
  assert.equal(current.ledger.history[0].reviewProof.evidenceMessageId,EVIDENCE);
  await assert.rejects(f.protectedVault.read());
  await assert.rejects(f.commit(permit));
  assert.equal(f.stats().commits,1);
});
test('Permit signature, signer, scope, value and source digest cannot be forged',async()=>{
  const f=harness(),permit=await f.sign();
  const staged=await f.stage();
  const args={staged,scope:SCOPE,checkpoint:f.originalCheckpoint,
    ownerPublicKey:f.ownerPublicKey,nowMs:NOW};
  for(const altered of [
    {...permit,payload:{...permit.payload,value:'External Convoy'}},
    {...permit,payload:{...permit.payload,sourceDigest:'b'.repeat(64)}},
    {...permit,payload:{...permit.payload,checkpoint:{
      revision:99,digest:permit.payload.checkpoint.digest}}},
    {...permit,payload:{...permit.payload,scope:{...SCOPE,
      forumId:'333333333333333333'}}},
    {...permit,signature:'A'.repeat(86)+'=='},
    {...permit,extra:'forged'}
  ])assert.throws(()=>verifyOwnerCommitPermit({...args,permit:altered}));
  assert.equal(f.stats().commits,0);
});
test('Expired, future, malformed and excessively long permits are refused',async()=>{
  const f=harness(),permit=await f.sign();
  const staged=await f.stage();
  const shared={staged,scope:SCOPE,checkpoint:f.originalCheckpoint,
    ownerPublicKey:f.ownerPublicKey};
  for(const nowMs of [
    NOW-120000,NOW+11*60000
  ])assert.throws(()=>verifyOwnerCommitPermit({
    ...shared,permit,nowMs
  }));
  for(const bad of [
    {expiresAt:'2027-03-20T12:20:00.000Z'},
    {expiresAt:'2027-03-20T11:59:00.000Z'},
    {nonce:'weak'}
  ])assert.throws(()=>issueOwnerCommitPermit({
    staged,scope:SCOPE,checkpoint:f.originalCheckpoint,
    issuedAt:'2027-03-20T12:00:00.000Z',
    expiresAt:'2027-03-20T12:10:00.000Z',
    nonce:approvalNonce,ownerPrivateKey:f.ownerPrivateKey,...bad
  }));
});
test('Two-person reviewer revocation between signing and commit fails closed',async()=>{
  const roles=[LEAD],f=harness({reviewerRoles:roles});
  const permit=await f.sign();
  roles.splice(0,roles.length,COORD);
  await assert.rejects(f.commit(permit));
  assert.equal(f.stats().commits,0);
});
test('Source can change between signing and commit and must deny authorization',async()=>{
  const f=harness({sourceChangesAt:3});
  const permit=await f.sign(); // source reads 1 and 2
  await assert.rejects(f.commit(permit)); // 3rd read is different
  assert.equal(f.stats().commits,0);
});
test('Owner-pinned ledger changing between checks denies write',async()=>{
  const f=harness({ledgerChangesAt:6});
  const permit=await f.sign();
  await assert.rejects(f.commit(permit));
  assert.equal(f.stats().commits,0);
});
test('Ambiguous commit response never triggers a blind retry or false approval',async()=>{
  const f=harness({commitCrashes:true}),permit=await f.sign();
  await assert.rejects(f.commit(permit));
  assert.equal(f.stats().commits,1);
  assert.equal(f.current().ledger.revision,1);
  await assert.rejects(f.commit(permit));
  assert.equal(f.stats().commits,1);
});
test('Commit rejects missing owner permit; untrusted direct Discord text cannot write',async()=>{
  const f=harness();
  await assert.rejects(f.commit(null));
  assert.equal(f.stats().commits,0);
});
