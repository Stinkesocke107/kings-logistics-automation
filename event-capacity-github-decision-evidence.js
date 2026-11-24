'use strict';
// GitHub-only private Staff evidence SUBMISSIONS, not Kings approvals.
// Read-only; no private ledger mutations, quota confirmation, public logs,
// Discord messages, or server/Gateway. Transient source snapshots only.
const {configCheck,validateChannelPrivacy}=require('./event-capacity-github-only');
const {checkedMember}=require('./event-capacity-github-staff-commands');
const {reconcileSourceInventory}=require('./event-capacity-source-reconcile');
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity staff evidence could not be verified.';
const SNOWFLAKE=/^\d{17,22}$/;
const REF=/^(event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/;
const MAX_AGE_MS=35*60*1000;
const EXPECTED_GUILD='1114967437788577792';
const EXPECTED_FORUM='1550619824005062697';
const CATEGORIES=Object.freeze({kings:'Kings Convoy',partner:'Partner Convoy',
  external:'External Convoy'});
function fail(){throw new Error(ERROR);}
function parseEvidence(content){
  if(typeof content!=='string'||content.length>140||content.length<28||
    /[\r\n\t\u0000-\u001f]/.test(content))return null;
  const s=content.trim();
  const match=/^!capacity evidence (event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22}) (category|departure|end) ([A-Za-z0-9:_-]{1,32})$/.exec(s);
  if(!match||!REF.test(match[1]))return null;
  const [,ref,field,raw]=match;
  let value;
  if(field==='category'){
    value=CATEGORIES[raw];
    if(!value)return null;
  }else{
    // Absolute UTC only. No inferred local timezone or human parsing.
    if(!/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:00Z$/.test(raw))return null;
    const at=timestamp(raw);
    // Canonical exact-minute UTC without milliseconds: ISO serialization
    // adds '.000Z', which must not reject a valid YYYY-MM-DDTHH:MM:00Z.
    if(at===null||new Date(at).toISOString().replace('.000Z','Z')!==raw)return null;
    value=raw;
  }
  return Object.freeze({ref,field,value});
}
function sourceIdentity(report,ref){
  const key=ref.startsWith('event:')?'eventId':'threadId';
  const requested=ref.slice(ref.indexOf(':')+1);
  const hits=report.threads.filter(x=>
    x&&!x.ignored&&!x.testThread&&!x.error&&
    String(x[key]??'')===requested);
  if(hits.length!==1)return {state:hits.length?'Conflict':'Unknown Source',source:null};
  const source=hits[0];
  if(source.duplicateEventId===true||source.dataConflict===true||
    /^\s*\[?test\]?(?:\s|[-_:])/i.test(String(source.name||'')))
    return {state:'Conflict',source:null};
  return {state:'Matched',source};
}
function assessment(evidence,item){
  if(item.state!=='Matched')return item.state;
  const source=item.source;
  let declared;
  if(evidence.field==='category')declared=source.validation?.parsed?.eventType||
    source.eventType||null;
  else if(evidence.field==='departure')declared=source.validation?.parsed?.departureAtUtc||
    source.departureAtUtc||null;
  else declared=null; // No reliable planned end from source by default.
  if(declared!==null&&declared!==undefined&&declared!==''){
    if(evidence.field==='category'&&declared!==evidence.value)
      return 'Source Disagreement';
    if(evidence.field!=='category'){
      const sourceAt=timestamp(declared),claimedAt=timestamp(evidence.value);
      if(sourceAt===null||claimedAt===null||sourceAt!==claimedAt)
        return 'Source Disagreement';
    }
  }
  return 'Needs Human Review';
}
function eligibleMessage(message,channelId,nowMs,botId){
  if(!message||typeof message!=='object'||
    !SNOWFLAKE.test(String(message.id||''))||
    String(message.channel_id)!==channelId||
    !SNOWFLAKE.test(String(message.author?.id||''))||
    String(message.author.id)===botId||message.author.bot===true||
    message.webhook_id||message.edited_timestamp!==null&&
      message.edited_timestamp!==undefined)return null;
  const sent=timestamp(message.timestamp);
  if(sent===null||sent>nowMs||nowMs-sent>MAX_AGE_MS)return null;
  const parsed=parseEvidence(message.content);
  if(!parsed)return null;
  return {messageId:String(message.id),memberId:String(message.author.id),
    content:message.content,timestamp:message.timestamp,...parsed};
}
function checkedReport(report,overview,nowMs){
  if(!report||!overview||report.guildId!==EXPECTED_GUILD||
    overview.guildId!==EXPECTED_GUILD||report.forumId!==EXPECTED_FORUM||
    overview.forumId!==EXPECTED_FORUM||
    !Array.isArray(report.threads)||report.threads.length>30000||
    reconcileSourceInventory(report,overview).ok!==true)fail();
  const end=timestamp(report.finalization?.finalizedAt);
  const updated=timestamp(overview.generatedAt);
  if(end===null||updated===null||updated<end||
    updated>nowMs+60000||nowMs-updated>30*60000)fail();
}
async function inspectStaffEvidence({
  client,config,report,overview,nowMs=Date.now()
}={}){
  const c=configCheck(config);
  if(!Number.isFinite(nowMs)||!client||
    ['me','channel','roles','member','recent','message'].some(x=>
      typeof client[x]!=='function'))fail();
  checkedReport(report,overview,nowMs);
  let bot,channel,roles,messages;
  try{
    [bot,channel,roles]=await Promise.all([
      client.me(),client.channel(c.channelId),client.roles(c.guildId)
    ]);
    if(!SNOWFLAKE.test(String(bot?.id||'')))fail();
    validateChannelPrivacy(channel,roles,c,{botId:bot.id});
    messages=await client.recent(c.channelId);
  }catch{fail();}
  // 100-item page is not an exhaustive source of staff audit history.
  if(!Array.isArray(messages)||messages.length>=100)fail();
  const seen=new Set(),candidates=[];
  for(const m of messages){
    if(!m||!SNOWFLAKE.test(String(m.id||''))||
      seen.has(String(m.id))||String(m.channel_id)!==c.channelId)fail();
    seen.add(String(m.id));
    // Missing Message Content privileged access may yield blank bodies.
    // Zero visible proposals is NOT evidence of an empty Staff inbox.
    // Attachments-only/blank human posts are also conservatively unresolved.
    if(m.author?.bot!==true&&!m.webhook_id&&m.content==='')fail();
    const matched=eligibleMessage(m,c.channelId,nowMs,String(bot.id));
    if(matched)candidates.push(matched);
  }
  if(candidates.length>12)fail();
  candidates.sort((a,b)=>BigInt(a.messageId)<BigInt(b.messageId)?-1:1);
  const findings=[],group=new Map();
  for(const proposal of candidates){
    let member,original,checkedChannel,checkedRoles;
    try{
      [member,original,checkedChannel,checkedRoles]=await Promise.all([
        client.member(c.guildId,proposal.memberId),
        client.message(c.channelId,proposal.messageId),
        client.channel(c.channelId),client.roles(c.guildId)
      ]);
      validateChannelPrivacy(checkedChannel,checkedRoles,c,{botId:bot.id});
      if(!original||String(original.id)!==proposal.messageId||
        String(original.author?.id)!==proposal.memberId||
        String(original.channel_id)!==c.channelId||
        original.content!==proposal.content||
        original.timestamp!==proposal.timestamp||
        original.edited_timestamp!==null&&original.edited_timestamp!==undefined)
        fail();
      if(!checkedMember(member,proposal.memberId,checkedRoles,c))continue;
    }catch{fail();}
    const match=sourceIdentity(report,proposal.ref);
    const status=assessment(proposal,match);
    const key=proposal.ref+'|'+proposal.field;
    if(!group.has(key))group.set(key,new Set());
    group.get(key).add(proposal.value);
    findings.push({
      // These private refs MUST NOT be published or committed in public Git.
      messageId:proposal.messageId,actorId:proposal.memberId,
      ref:proposal.ref,field:proposal.field,value:proposal.value,
      reviewStatus:status,sourceMatched:match.state==='Matched',
      classificationApproved:false,capacityConfirmed:false
    });
  }
  for(const f of findings){
    if((group.get(f.ref+'|'+f.field)?.size||0)>1){
      f.reviewStatus='Conflicting Proposals';
      f.sourceMatched=false;
    }
  }
  return Object.freeze({
    version:1,privateOnly:true,readOnly:true,
    totalProposals:findings.length,
    needsHumanReview:findings.filter(x=>x.reviewStatus==='Needs Human Review').length,
    conflicts:findings.filter(x=>x.reviewStatus==='Conflicting Proposals'||x.reviewStatus==='Conflict').length,
    sourceDisagreements:findings.filter(x=>x.reviewStatus==='Source Disagreement').length,
    unknownSource:findings.filter(x=>x.reviewStatus==='Unknown Source').length,
    acceptedDecisions:0,certifiedFreeSlots:false,
    // Private in-process evidence links only; no implied durable approval.
    proposals:findings
  });
}
function publicSafeAggregate(result){
  if(!result||result.privateOnly!==true||result.readOnly!==true||
    result.acceptedDecisions!==0||result.certifiedFreeSlots!==false)fail();
  return Object.freeze({
    reviewCandidates:result.totalProposals,needsHumanReview:result.needsHumanReview,
    conflicts:result.conflicts,sourceDisagreements:result.sourceDisagreements,
    unknownSource:result.unknownSource,
    approvalsApplied:0,freeSlotsCertified:false
  });
}
module.exports={parseEvidence,inspectStaffEvidence,publicSafeAggregate};
