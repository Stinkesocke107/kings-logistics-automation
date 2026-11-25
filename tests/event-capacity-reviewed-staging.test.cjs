'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildHumanReviewChallenge,verifyHumanReview}=require('../event-capacity-human-review');
const {checkedReport,sourceIdentity,assessment}
  =require('../event-capacity-github-decision-evidence');
const {stageReviewedDecision}=require('../event-capacity-reviewed-staging');
const {createEmptyLedger,applyDecision}
  =require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const CHANNEL='222222222222222222',BOT='999999999999999999';
const SUBMITTER='111111111111111111',REVIEWER='222222222222222222';
const EVIDENCE='777777777777777777',REVIEW='888888888888888888';
const COORD='333333333333333333',LEAD='444444444444444444';
const CEO='666666666666666666',OTHER='555555555555555555';
const THREAD='999999999999999999';
const RUN='45502949674',NOW=Date.parse('2027-03-20T12:00:00.000Z');
const SECRET='synthetic-private-human-review-code-secret-12345';
const config={guildId:SCOPE.guildId,channelId:CHANNEL,
  roles:{'Event Coordination':COORD,'Event Leadership':LEAD,CEO}};
const proposal={
  messageId:EVIDENCE,actorId:SUBMITTER,ref:'event:20270',
  field:'category',value:'Partner Convoy',
  reviewStatus:'Needs Human Review',sourceMatched:true,
  classificationApproved:false,capacityConfirmed:false
};
function source(){
  const departureAtUtc='2027-03-21T16:00:00Z';
  return {
    sourceKind:'authenticated-kings-convoy-checker',
    runId:RUN,attempt:1,
    report:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:39:00Z',
      finalization:{finalizedAt:'2027-03-20T11:40:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{
        eventId:'20270',threadId:THREAD,status:'Scheduled',
        name:'Synthetic Partner Event',
        validation:{parsed:{eventType:'Partner Convoy',departureAtUtc}}
      }]
    },
    overview:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:41:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{
        source:'convoy-center',threadId:THREAD,eventId:'20270',
        status:'Scheduled',departureAtUtc
      }]
    }
  };
}
function fixture({
  sourceChanged=false,sourceOverride={},
  ledgerChanged=false,reviewerRoles=[LEAD],
  sourceRunChanged=false,ownerReadThrows=false
}={}){
  const first=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const initialCheckpoint={revision:0,digest:'a'.repeat(64)};
  let readCount=0,sourceCount=0,commits=0;
  const challenge=buildHumanReviewChallenge({
    proposal,sourceRunId:RUN,ledgerRevision:0,
    nowMs:NOW-15*60000,secret:SECRET,scope:SCOPE
  });
  const original={
    id:EVIDENCE,channel_id:CHANNEL,author:{id:SUBMITTER,bot:false},
    timestamp:'2027-03-20T11:30:00.000Z',
    content:'!capacity evidence event:20270 category partner',
    edited_timestamp:null
  };
  const review={
    id:REVIEW,channel_id:CHANNEL,author:{id:REVIEWER,bot:false},
    timestamp:'2027-03-20T11:50:00.000Z',
    content:challenge.reviewCommand,edited_timestamp:null
  };
  const client={
    me:async()=>({id:BOT}),
    channel:async()=>({
      id:CHANNEL,guild_id:SCOPE.guildId,type:0,
      permission_overwrites:[
        {id:SCOPE.guildId,type:0,allow:'0',deny:'1024'},
        ...[COORD,LEAD,CEO].map(id=>({
          id,type:0,allow:'1024',deny:'0'
        }))
      ]
    }),
    roles:async()=>[SCOPE.guildId,COORD,LEAD,CEO,OTHER].map(id=>({
      id,permissions:'66560'
    })),
    member:async(_,id)=>({
      user:{id},roles:id===SUBMITTER?[COORD]:id===REVIEWER?reviewerRoles:[]
    }),
    message:async(_,id)=>id===EVIDENCE?original:id===REVIEW?review:null
  };
  const protectedVault={
    read:async()=>{
      if(ownerReadThrows)throw Error('signed owner receipt mismatch');
      readCount++;
      const changed=ledgerChanged&&readCount>1;
      return {
        checkpoint:changed?{revision:1,digest:'b'.repeat(64)}:
          initialCheckpoint,
        ledger:changed?{...first,revision:1}:first
      };
    },
    commitDecision:async()=>{commits++;throw Error('never called');}
  };
  const readVerifiedSource=async()=>{
    sourceCount++;
    const value={...source(),...sourceOverride};
    if(sourceRunChanged&&sourceCount>1)
      value.runId='45502949675';
    if(sourceChanged&&sourceCount>1)
      value.report={...value.report,
        generatedAt:'2027-03-20T11:38:00Z'};
    return value;
  };
  const stage=(overrides={})=>stageReviewedDecision({
    readVerifiedSource,protectedVault,client,config,scope:SCOPE,
    proposal,challenge,reviewMessageId:REVIEW,
    secret:SECRET,nowMs:NOW,...overrides
  });
  return {stage,stats:()=>({readCount,sourceCount,commits}),
    challenge,protectedVault,client};
}
test('A reviewer-confirmed source-bound decision is STAGED without any write',async()=>{
  const f=fixture(),staged=await f.stage();
  assert.equal(staged.state,'ReadyForOwnerControlledCommit');
  assert.equal(staged.decisionCommitted,false);
  assert.equal(staged.availabilityCertified,false);
  assert.equal(staged.readOnly,true);
  assert.equal(staged.ownerReceiptRequired,true);
  assert.equal(staged.command.action,'classification');
  assert.equal(staged.command.expectedRevision,0);
  assert.equal(staged.command.reviewProof.sourceRunId,RUN);
  assert.equal(staged.command.reviewProof.reviewerId,REVIEWER);
  assert.match(staged.command.reviewProof.sourceDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(staged.actor.verifiedRoles,['Event Leadership']);
  assert.deepEqual(f.stats(),{readCount:2,sourceCount:2,commits:0});
  // Even a later explicitly called domain operation would retain the
  // exact proof inside the encrypted audit history for replay denial.
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const next=applyDecision(ledger,staged.command,staged.actor,
    new Date(NOW).toISOString());
  assert.equal(next.history[0].reviewProof.reviewMessageId,REVIEW);
  assert.throws(()=>applyDecision(next,{
    ...staged.command,expectedRevision:1
  },staged.actor,new Date(NOW).toISOString()));
});
test('Changing source between proposal review and staged decision denies the candidate',async()=>{
  for(const args of [{sourceChanged:true},{sourceRunChanged:true}]){
    const f=fixture(args);
    await assert.rejects(f.stage());
    assert.equal(f.stats().commits,0);
  }
});
test('Owner-pinned ledger changing while review is checked refuses staging',async()=>{
  const f=fixture({ledgerChanged:true});
  await assert.rejects(f.stage());
  assert.equal(f.stats().commits,0);
});
test('Current reviewer no longer holds Event Leadership or CEO',async()=>{
  const f=fixture({reviewerRoles:[COORD]});
  await assert.rejects(f.stage());
  assert.equal(f.stats().commits,0);
});
test('Source conflicting category, missing event or forged source kind is refused',async()=>{
  const wrong=source();
  wrong.report.threads[0].validation.parsed.eventType='External Convoy';
  for(const args of [
    {sourceOverride:{report:wrong.report}},
    {sourceOverride:{sourceKind:'untrusted-webhook'}},
    {sourceOverride:{report:{...source().report,threads:[]}}}
  ]){
    const f=fixture(args);
    await assert.rejects(f.stage());
    assert.equal(f.stats().commits,0);
  }
});
test('Missing owner receipt or unverified current stored ledger cannot stage a decision',async()=>{
  const f=fixture({ownerReadThrows:true});
  await assert.rejects(f.stage());
  assert.equal(f.stats().commits,0);
});
test('No callable owner vault write is needed to preview a reviewed decision',async()=>{
  const f=fixture();
  const result=await f.stage({
    protectedVault:{read:f.protectedVault.read}
  });
  assert.equal(result.decisionCommitted,false);
  assert.equal(f.stats().commits,0);
});

test('Staging synthetic report independently passes Kings source validation and agreement',()=>{
  const x=source();
  checkedReport(x.report,x.overview,NOW);
  const item=sourceIdentity(x.report,proposal.ref);
  assert.equal(item.state,'Matched');
  assert.equal(assessment(proposal,item),'Needs Human Review');
});
test('Staging synthetic staff review independently verifies the second reviewer role',async()=>{
  const f=fixture();
  const r=await verifyHumanReview({
    client:f.client,config,scope:SCOPE,proposal,challenge:f.challenge,
    sourceRunId:RUN,ledgerRevision:0,reviewMessageId:REVIEW,
    nowMs:NOW,secret:SECRET
  });
  assert.equal(r.reviewerRole,'Event Leadership');
  assert.equal(r.decisionCommitted,false);
});
