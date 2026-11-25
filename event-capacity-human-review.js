'use strict';
// REVIEW-PROOF ONLY. No Discord message is an authorization to mutate the
// versioned Kings ledger without trusted source, current roles, a distinct
// second human, independent owner receipt, durable CAS and explicit release.
// Never called by the live GitHub workflow. No bot hosting required.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {configCheck,validateChannelPrivacy}
  =require('./event-capacity-github-only');
const {checkedMember}=require('./event-capacity-github-staff-commands');
const {parseEvidence}=require('./event-capacity-github-decision-evidence');
const ERROR='Kings Event Capacity human review proof could not be verified.';
const SNOWFLAKE=/^\d{17,22}$/;
const RUN=/^[1-9]\d{5,19}$/;
const CODE=/^[a-f0-9]{32}$/;
const DOMAIN='kings-event-capacity-human-review-v1';
const WINDOW=90*60000; // This is not a persistent approved-decision store.
function fail(){throw new Error(ERROR);}
function proofInput({proposal,runId,ledgerRevision,at}={}){
  if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||
    proposal.reviewStatus!=='Needs Human Review'||
    proposal.sourceMatched!==true||
    proposal.classificationApproved!==false||
    proposal.capacityConfirmed!==false||
    !SNOWFLAKE.test(String(proposal.messageId||''))||
    !SNOWFLAKE.test(String(proposal.actorId||''))||
    !RUN.test(String(runId||''))||
    !Number.isSafeInteger(ledgerRevision)||ledgerRevision<0||
    !['category','departure','end'].includes(proposal.field)||
    typeof proposal.ref!=='string'||
    !/^(?:event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/.test(proposal.ref)||
    typeof proposal.value!=='string'||proposal.value.length>60||
    !Number.isFinite(at))fail();
  const command=parseEvidence('!capacity evidence '+proposal.ref+' '+
    proposal.field+' '+(proposal.field==='category'
      ?({'Kings Convoy':'kings','Partner Convoy':'partner',
          'External Convoy':'external'}[proposal.value]||'INVALID')
      :proposal.value));
  if(!command||command.ref!==proposal.ref||command.value!==proposal.value)
    fail();
  return {messageId:String(proposal.messageId),
    actorId:String(proposal.actorId),ref:proposal.ref,
    field:proposal.field,value:proposal.value,
    runId:String(runId),ledgerRevision,at};
}
function reviewMac(input,secret,scope){
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
    !scope||!SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  const message=[DOMAIN,scope.guildId,scope.forumId,
    input.messageId,input.actorId,input.ref,input.field,input.value,
    input.runId,String(input.ledgerRevision),String(input.at)].join('\0');
  return crypto.createHmac('sha256',secret).update(message)
    .digest('hex').slice(0,32);
}
function buildHumanReviewChallenge({
  proposal,sourceRunId,ledgerRevision,nowMs=Date.now(),secret,scope
}={}){
  if(!scope||!SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  const checkedScope={guildId:String(scope.guildId),
    forumId:String(scope.forumId)};
  const input=proofInput({proposal,runId:sourceRunId,ledgerRevision,at:nowMs});
  const code=reviewMac(input,secret,checkedScope);
  return Object.freeze({
    ...input,code,
    // Exact syntax for a second authorized person after source review.
    reviewCommand:'!capacity review '+input.messageId+' '+code,
    validUntilMs:nowMs+WINDOW,readOnly:true,approvalApplied:false
  });
}
function parseReviewConfirmation(text){
  if(typeof text!=='string'||text.length>95||
    /[\r\n\t\u0000-\u001f]/.test(text))return null;
  const m=/^!capacity review (\d{17,22}) ([a-f0-9]{32})$/.exec(text);
  return m?Object.freeze({evidenceMessageId:m[1],code:m[2]}):null;
}
function validOriginal(message,{messageId,authorId,content,channelId},nowMs){
  if(!message||String(message.id)!==messageId||
    String(message.channel_id)!==channelId||
    String(message.author?.id)!==authorId||
    message.author?.bot===true||message.webhook_id||
    message.edited_timestamp!==null&&message.edited_timestamp!==undefined||
    message.content!==content||
    typeof message.timestamp!=='string')fail();
  const issued=Date.parse(message.timestamp);
  if(!Number.isFinite(issued)||issued>nowMs||
    nowMs-issued>WINDOW)fail();
}
async function verifyHumanReview({
  client,config,scope,proposal,challenge,sourceRunId,ledgerRevision,
  reviewMessageId,nowMs=Date.now(),secret
}={}){
  const c=configCheck(config);
  if(!scope||!SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||''))||
    String(scope.guildId)!==c.guildId)fail();
  const checkedScope={guildId:c.guildId,forumId:String(scope.forumId)};
  if(!client||['me','channel','roles','member','message']
    .some(x=>typeof client[x]!=='function')||
    !SNOWFLAKE.test(String(reviewMessageId||''))||
    !Number.isFinite(nowMs)||!challenge||
    challenge.readOnly!==true||challenge.approvalApplied!==false||
    nowMs>challenge.validUntilMs)fail();
  const proof=proofInput({proposal,runId:sourceRunId,
    ledgerRevision,at:challenge.at});
  if(!isDeepStrictEqual(Object.fromEntries(
    Object.entries(proof).map(([k,v])=>[k,challenge[k]])),proof)||
    challenge.code!==reviewMac(proof,secret,checkedScope))fail();
  let me,channel,roles,original,review,submitter,approver;
  try{
    // Re-fetch the original evidence, independent reviewer message, and
    // current member roles at the moment of assessment.
    [me,channel,roles,original,review]=await Promise.all([
      client.me(),client.channel(c.channelId),client.roles(c.guildId),
      client.message(c.channelId,proof.messageId),
      client.message(c.channelId,String(reviewMessageId))
    ]);
    if(!SNOWFLAKE.test(String(me?.id||'')))fail();
    validateChannelPrivacy(channel,roles,c,{botId:me.id});
    if(!review||String(review.id)!==String(reviewMessageId)||
      String(review.channel_id)!==c.channelId||
      !SNOWFLAKE.test(String(review.author?.id||''))||
      String(review.author.id)===proof.actorId||
      review.author.bot===true||review.webhook_id||
      review.edited_timestamp!==null&&review.edited_timestamp!==undefined)
      fail();
    const parsed=parseReviewConfirmation(review.content);
    if(!parsed||parsed.evidenceMessageId!==proof.messageId||
      parsed.code!==challenge.code)fail();
    const reviewTime=Date.parse(review.timestamp);
    if(!Number.isFinite(reviewTime)||reviewTime>nowMs||
      reviewTime<proof.at||nowMs-reviewTime>WINDOW)fail();
    const originalContent='!capacity evidence '+proof.ref+' '+proof.field+' '+
      (proof.field==='category'?({
        'Kings Convoy':'kings','Partner Convoy':'partner',
        'External Convoy':'external'
      }[proof.value]):proof.value);
    validOriginal(original,{
      messageId:proof.messageId,authorId:proof.actorId,
      content:originalContent,channelId:c.channelId
    },nowMs);
    if(Date.parse(original.timestamp)>proof.at)fail();
    [submitter,approver]=await Promise.all([
      client.member(c.guildId,proof.actorId),
      client.member(c.guildId,String(review.author.id))
    ]);
    if(!checkedMember(submitter,proof.actorId,roles,c)||
      !checkedMember(approver,String(review.author.id),roles,c))fail();
    // For the draft, every final review is reserved to leadership or CEO;
    // the submitting Staff member can NEVER approve their own evidence.
    if(!approver.roles.some(x=>x===c.roles['Event Leadership']||
      x===c.roles.CEO))fail();
  }catch{fail();}
  const action=proof.field==='category'?'classification':proof.field;
  const candidate=Object.freeze({ref:proof.ref,action,value:proof.value,
    expectedRevision:proof.ledgerRevision,
    evidenceRef:'discord:'+proof.messageId+':review:'+String(reviewMessageId)
  });
  return Object.freeze({
    state:'HumanReviewVerified',privateOnly:true,readOnly:true,
    candidate,reviewerId:String(review.author.id),
    submitterId:proof.actorId,sourceRunId:proof.runId,
    ownerReceiptRequired:true,decisionCommitted:false,
    availabilityCertified:false
  });
}
module.exports={buildHumanReviewChallenge,parseReviewConfirmation,
  verifyHumanReview};
