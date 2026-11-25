'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildHumanReviewChallenge,parseReviewConfirmation,verifyHumanReview}
  =require('../event-capacity-human-review');
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const CHANNEL='222222222222222222',BOT='999999999999999999';
const AUTHOR='111111111111111111',REVIEWER='222222222222222222';
const EVIDENCE='777777777777777777',REVIEW='888888888888888888';
const COORD='333333333333333333',LEAD='444444444444444444',
  CEO='666666666666666666',OUTSIDER='555555555555555555';
const SECRET='private-synthetic-review-code-secret-1234567890';
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const RUN='45502949674';
const PROPOSAL={ref:'event:20270',field:'category',value:'Partner Convoy',
  messageId:EVIDENCE,actorId:AUTHOR,sourceMatched:true,
  reviewStatus:'Needs Human Review',
  classificationApproved:false,capacityConfirmed:false};
const ROLES={'Event Coordination':COORD,'Event Leadership':LEAD,CEO};
const CONFIG={guildId:SCOPE.guildId,channelId:CHANNEL,roles:ROLES};
function candidate(props={}){
  return buildHumanReviewChallenge({proposal:PROPOSAL,sourceRunId:RUN,
    ledgerRevision:3,nowMs:NOW-15*60000,secret:SECRET,scope:SCOPE,...props});
}
function fixture({
  proposal=PROPOSAL,reviewerId=REVIEWER,
  reviewerRoles=[LEAD],submitterRoles=[COORD],
  originalOverride={},reviewOverride={},channelOverride={},
  rolesOverride=[]
}={}){
  const challenge=candidate({proposal});
  const first={id:EVIDENCE,channel_id:CHANNEL,
    author:{id:AUTHOR,bot:false},
    content:'!capacity evidence event:20270 category partner',
    timestamp:'2027-03-20T11:30:00.000Z',edited_timestamp:null,
    ...originalOverride};
  const review={id:REVIEW,channel_id:CHANNEL,
    author:{id:reviewerId,bot:false},
    content:challenge.reviewCommand,
    timestamp:'2027-03-20T11:50:00.000Z',edited_timestamp:null,
    ...reviewOverride};
  const channel={id:CHANNEL,guild_id:SCOPE.guildId,type:0,
    permission_overwrites:[
      {id:SCOPE.guildId,type:0,allow:'0',deny:'1024'},
      ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'}))
    ],...channelOverride};
  const roles=[SCOPE.guildId,COORD,LEAD,CEO,OUTSIDER].map(id=>({
    id,permissions:'66560',...rolesOverride.find(x=>x.id===id)
  }));
  let reads=0,members=0;
  const client={
    me:async()=>({id:BOT}),
    channel:async()=>channel,
    roles:async()=>roles,
    message:async(_,id)=>{
      reads++;return id===EVIDENCE?first:id===REVIEW?review:null;
    },
    member:async(_,id)=>{
      members++;
      return {user:{id},roles:id===AUTHOR?submitterRoles:
        id===reviewerId?reviewerRoles:[]};
    }
  };
  const verify=(props={})=>verifyHumanReview({
    client,config:CONFIG,proposal,challenge,
    sourceRunId:RUN,ledgerRevision:3,reviewMessageId:REVIEW,
    nowMs:NOW,secret:SECRET,...props
  });
  return {verify,challenge,client,reads:()=>reads,members:()=>members};
}
test('Source-bound private approval challenge is deterministic for a single evidence and ledger revision',()=>{
  const x=candidate(),y=candidate();
  assert.equal(x.code,y.code);
  assert.deepEqual(parseReviewConfirmation(x.reviewCommand),{
    evidenceMessageId:EVIDENCE,code:x.code
  });
  assert.equal(x.readOnly,true);
  assert.equal(x.approvalApplied,false);
  assert.equal(x.reviewCommand.includes('@everyone'),false);
});
test('Two distinct currently authorized humans produce an audit candidate but NO persisted decision',async()=>{
  const f=fixture();
  const result=await f.verify();
  assert.equal(result.state,'HumanReviewVerified');
  assert.equal(result.privateOnly,true);
  assert.equal(result.readOnly,true);
  assert.equal(result.decisionCommitted,false);
  assert.equal(result.ownerReceiptRequired,true);
  assert.equal(result.availabilityCertified,false);
  assert.deepEqual(result.candidate,{
    ref:'event:20270',action:'classification',value:'Partner Convoy',
    expectedRevision:3,
    evidenceRef:'discord:'+EVIDENCE+':review:'+REVIEW
  });
  assert.equal(result.reviewerId,REVIEWER);
  assert.equal(f.members(),2);
});
test('Self-confirmation, Coordination-only reviewer and revoked staff are not approvals',async()=>{
  for(const args of [
    {reviewerId:AUTHOR,reviewerRoles:[COORD]},
    {reviewerRoles:[COORD]},
    {reviewerRoles:[]},
    {submitterRoles:[]}
  ])await assert.rejects(fixture(args).verify());
});
test('Changed or forged review code, text, identity or event evidence is refused',async()=>{
  for(const args of [
    {reviewOverride:{content:'!capacity review '+EVIDENCE+' '+'a'.repeat(32)}},
    {reviewOverride:{edited_timestamp:'2027-03-20T11:55:00.000Z'}},
    {originalOverride:{edited_timestamp:'2027-03-20T11:32:00.000Z'}},
    {originalOverride:{content:'!capacity evidence event:20270 category external'}},
    {originalOverride:{author:{id:REVIEWER,bot:false}}},
    {reviewOverride:{author:{id:BOT,bot:true}}},
    {reviewOverride:{channel_id:'999999999999999998'}},
    {originalOverride:{timestamp:'2027-03-20T11:50:00.000Z'}}
  ])await assert.rejects(fixture(args).verify());
});
test('Source changes and concurrent ledger revisions invalidate previously generated codes',async()=>{
  const f=fixture();
  await assert.rejects(f.verify({sourceRunId:'45502949675'}));
  await assert.rejects(f.verify({ledgerRevision:4}));
  await assert.rejects(f.verify({secret:'synthetic-wrong-review-proof-secret-789'}));
  await assert.rejects(f.verify({nowMs:NOW+100*60000}));
});
test('Unverified source matches, conflicting proposals and approved flags cannot create a review challenge',()=>{
  for(const changed of [
    {reviewStatus:'Conflicting Proposals'},
    {sourceMatched:false},
    {classificationApproved:true},
    {capacityConfirmed:true},
    {field:'exception'},
    {value:'Invalid'},
    {ref:'event:../inject'},
    {messageId:'5'}
  ])assert.throws(()=>candidate({proposal:{...PROPOSAL,...changed}}));
});
test('Private channel role leak and unapproved Administrator bypass deny review',async()=>{
  const f=fixture({channelOverride:{
    permission_overwrites:[{id:SCOPE.guildId,type:0,allow:'1024',deny:'0'}]
  }});
  await assert.rejects(f.verify());
  await assert.rejects(fixture({rolesOverride:[{
    id:OUTSIDER,permissions:'8'
  }]}).verify());
});
test('Invalid or sloppy approval syntax is never parsed',()=>{
  for(const value of [
    '!capacity approve '+EVIDENCE,
    '!capacity review '+EVIDENCE+' '+'A'.repeat(32),
    '!capacity review '+EVIDENCE+' '+'a'.repeat(32)+'\n@everyone',
    '!capacity review '+EVIDENCE+' '+'a'.repeat(31),
    '!capacity review 7 '+'a'.repeat(32)
  ])assert.equal(parseReviewConfirmation(value),null);
});
test('A fake source report and owner confirmation cannot be fabricated by final message input',async()=>{
  const f=fixture();
  const altered={...f.challenge,at:f.challenge.at+1000};
  await assert.rejects(f.verify({challenge:altered}));
  await assert.rejects(f.verify({
    challenge:{...f.challenge,code:'f'.repeat(32)}
  }));
});
