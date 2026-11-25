'use strict';
// Kings #15: READ-ONLY inventory of the EXISTING private Event Invitation
// Tracker forum. One convoy thread; one invited VTC per human reply.
// NEVER sends invitations, approves events, books slots or mutates Discord.
// Public GitHub logs and JSON may only receive the allowlisted aggregate.
const GUILD='1114967437788577792';
const FORUM='1567471010436087949';
const API='https://discord.com/api/v10';
const MODES=Object.freeze(['Invites Ongoing','Invites Done','Convoy Completed']);
const MAX_THREADS=300,MAX_MESSAGES=500,MAX_AGE_MS=36*60*60*1000;
const ID=/^[1-9]\d{15,20}$/;
const FIELD_NAMES=Object.freeze([
  'convoyThreads','invitedVtcs','ongoingThreads','doneThreads',
  'completedThreads','tagIssues','malformedReplies','duplicateVtcReplies',
  'eventLinksRecorded','eventLinksMissing','duplicateConvoyEvents',
  'linkedToCenter','recordedAccepted','recordedDeclined',
  'recordedPending','replyNotRecorded'
]);
const SAFE_SOURCE_REASONS=new Set([
  'ACCESS_DENIED','RATE_LIMITED','API_UNAVAILABLE',
  'FORUM_MISMATCH','FORUM_TAGS_MISSING',
  'ACTIVE_THREAD_LIST','ARCHIVE_PAGE_INCOMPLETE',
  'MESSAGE_PAGE_INCOMPLETE','STARTER_NOT_FOUND',
  'SOURCE_INCONSISTENT'
]);
function refuse(reason='SOURCE_INCONSISTENT'){
  const e=new Error('Kings Invitation Tracker source unavailable');
  e.sourceReason=SAFE_SOURCE_REASONS.has(reason)?reason:'SOURCE_INCONSISTENT';
  throw e;
}
function readEntry(raw){
  if(typeof raw!=='string'||raw.length>1200||raw.includes('\n'))return null;
  // Require the documented one-VTC-per-reply format, including source link
  // and inviter; optional response is a documented value, NOT acceptance proof.
  const match=raw.trim().match(
    /^(.{2,100}?)\s+[—–-]\s+(?:TMP VTC page|TruckersMP VTC(?: (?:page|link))?):\s*(https:\/\/(?:www\.)?truckersmp\.com\/vtc\/([1-9]\d{0,12})(?:-[a-z0-9-]+)?\/?)\s+[—–-]\s+Invited by:\s*(<@!?\d{15,20}>|@[^—–\n]{1,80}?)(?:\s+[—–-]\s+(?:Response|Reply status):\s*(Accepted|Declined|Pending|No Response))?$/i
  );
  if(!match||match[1].trim().startsWith('['))return null;
  return {vtcId:match[3],response:(
    ['accepted','declined','pending'].includes(String(match[5]||'').toLowerCase())
      ?String(match[5]).toLowerCase():'not-recorded')};
}
function eventIdFrom(text){
  if(typeof text!=='string'||text.length>12000)return null;
  const matches=[...text.matchAll(/https:\/\/(?:www\.)?truckersmp\.com\/events\/([1-9]\d{0,12})(?:-[a-z0-9-]+)?(?:\/|\b)/gi)];
  return matches.length===1?matches[0][1]:null;
}
function summarizeTracker({forum,threads,messagesByThread,centerReport=null,nowMs=Date.now()}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<1||
    forum?.id!==FORUM||forum?.guild_id!==GUILD||Number(forum?.type)!==15||
    !Array.isArray(forum.available_tags)||!Array.isArray(threads)||
    threads.length>MAX_THREADS||!(messagesByThread instanceof Map))refuse();
  const knownTags=new Map();
  for(const tag of forum.available_tags){
    if(typeof tag?.id!=='string'||typeof tag?.name!=='string')refuse();
    if(MODES.includes(tag.name))knownTags.set(tag.id,tag.name);
  }
  if(new Set(knownTags.values()).size!==3)refuse('FORUM_TAGS_MISSING');
  const centerIds=centerReport?.mode==='READ_ONLY'&&
    Array.isArray(centerReport.threads)
    ?new Set(centerReport.threads.filter(x=>x&&!x.error&&!x.ignored&&
      !x.testThread&&x.eventId).map(x=>String(x.eventId))):new Set();
  const count=Object.fromEntries(FIELD_NAMES.map(k=>[k,0]));
  const seenThreads=new Set(),seenEvents=new Set();
  for(const thread of threads){
    if(!ID.test(String(thread?.id||''))||
      String(thread.parent_id)!==FORUM||
      seenThreads.has(String(thread.id))||
      !Array.isArray(thread.applied_tags))refuse();
    seenThreads.add(String(thread.id));
    if(/^\s*\[?test\]?(?:\s|[-_:])/i.test(thread.name||'')||
      /\btemplate\b/i.test(thread.name||''))continue;
    count.convoyThreads++;
    const tags=thread.applied_tags.map(x=>knownTags.get(String(x))).filter(Boolean);
    if(tags.length!==1||thread.applied_tags.length!==1)count.tagIssues++;
    else if(tags[0]==='Invites Ongoing')count.ongoingThreads++;
    else if(tags[0]==='Invites Done')count.doneThreads++;
    else if(tags[0]==='Convoy Completed')count.completedThreads++;
    const messages=messagesByThread.get(String(thread.id));
    if(!Array.isArray(messages)||messages.length>MAX_MESSAGES||!messages.length)refuse();
    const uniqueMessages=new Set();
    let starter=null,oldest=null;
    for(const message of messages){
      if(!ID.test(String(message?.id||''))||
        uniqueMessages.has(String(message.id)))refuse();
      uniqueMessages.add(String(message.id));
      if(String(message.id)===String(thread.id))starter=message;
      if(!oldest||BigInt(message.id)<BigInt(oldest.id))oldest=message;
    }
    // Forum starter MUST be identifiable. Never silently discard a reply
    // by treating the oldest observed invitation as an event starter.
    if(!starter)refuse('STARTER_NOT_FOUND');
    const source=starter;
    const eventId=eventIdFrom(source?.content||'');
    if(eventId){
      count.eventLinksRecorded++;
      if(seenEvents.has(eventId))count.duplicateConvoyEvents++;
      seenEvents.add(eventId);
      if(centerIds.has(eventId))count.linkedToCenter++;
    } else count.eventLinksMissing++;
    const seenVtcs=new Set();
    for(const message of messages){
      if(String(message.id)===String(source.id)||message.author?.bot)continue;
      const entry=readEntry(message.content||'');
      if(!entry){count.malformedReplies++;continue;}
      if(seenVtcs.has(entry.vtcId)){count.duplicateVtcReplies++;continue;}
      seenVtcs.add(entry.vtcId);
      count.invitedVtcs++;
      if(entry.response==='accepted')count.recordedAccepted++;
      else if(entry.response==='declined')count.recordedDeclined++;
      else if(entry.response==='pending')count.recordedPending++;
      else count.replyNotRecorded++;
    }
  }
  const result=Object.freeze({
    version:1,readOnly:true,sourceForumVerified:true,
    invitationDecisionsVerified:false,staffApprovalsVerified:false,
    bookingsCreated:0,observedAt:new Date(nowMs).toISOString(),
    ...count
  });
  if(!trustedInvitationObservation(result,nowMs))refuse();
  return result;
}
function trustedInvitationObservation(x,nowMs=Date.now()){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    !Number.isSafeInteger(nowMs)||nowMs<=0||
    x.version!==1||x.readOnly!==true||
    x.sourceForumVerified!==true||
    x.invitationDecisionsVerified!==false||
    x.staffApprovalsVerified!==false||x.bookingsCreated!==0||
    typeof x.observedAt!=='string'||!/Z$/.test(x.observedAt))return null;
  const t=Date.parse(x.observedAt);
  if(!Number.isFinite(t)||t>nowMs+5*60*1000||nowMs-t>MAX_AGE_MS||
    FIELD_NAMES.some(k=>!Number.isSafeInteger(x[k])||
      x[k]<0||x[k]>100000))return null;
  if(x.ongoingThreads+x.doneThreads+x.completedThreads+x.tagIssues!==x.convoyThreads||
    x.eventLinksRecorded+x.eventLinksMissing!==x.convoyThreads||
    x.recordedAccepted+x.recordedDeclined+x.recordedPending+x.replyNotRecorded!==x.invitedVtcs||
    x.duplicateConvoyEvents>x.eventLinksRecorded||
    x.linkedToCenter>x.eventLinksRecorded)return null;
  // Disallow accidental unencrypted personal/event fields in this value.
  if(Object.keys(x).some(k=>![
    'version','readOnly','sourceForumVerified','invitationDecisionsVerified',
    'staffApprovalsVerified','bookingsCreated','observedAt',...FIELD_NAMES
  ].includes(k)))return null;
  return x;
}
function createDiscordReader({token,transport=fetch}={}){
  if(typeof token!=='string'||token.length<20||token.length>1024||
    /[\r\n]/.test(token)||typeof transport!=='function')refuse();
  async function get(route){
    const response=await transport(API+route,{
      method:'GET',redirect:'error',
      headers:{Authorization:'Bot '+token,
        'User-Agent':'Kings-Invitation-Source-Read-Only'},
      signal:AbortSignal.timeout(15000)
    });
    if(!response||response.ok!==true||response.status!==200){
      if([401,403,404].includes(response?.status))refuse('ACCESS_DENIED');
      if(response?.status===429)refuse('RATE_LIMITED');
      refuse('API_UNAVAILABLE');
    }
    const raw=await response.text();
    if(raw.length>4*1024*1024)refuse();
    try{return JSON.parse(raw);}catch{refuse();}
  }
  return {get};
}
async function readInvitationTracker({token,transport=fetch,
  centerReport=null,nowMs=Date.now()}={}){
  const {get}=createDiscordReader({token,transport});
  const forum=await get('/channels/'+FORUM);
  if(forum?.id!==FORUM||forum?.guild_id!==GUILD||Number(forum?.type)!==15)refuse('FORUM_MISMATCH');
  const active=await get('/guilds/'+GUILD+'/threads/active');
  if(!Array.isArray(active?.threads))refuse('ACTIVE_THREAD_LIST');
  const collected=new Map();
  for(const t of active.threads)if(String(t.parent_id)===FORUM)
    collected.set(String(t.id),t);
  let before=null,complete=false;
  for(let page=0;page<10;page++){
    const query='/channels/'+FORUM+'/threads/archived/public?limit=100'+
      (before?'&before='+encodeURIComponent(before):'');
    const response=await get(query);
    if(!Array.isArray(response?.threads)||
      typeof response.has_more!=='boolean')refuse('ARCHIVE_PAGE_INCOMPLETE');
    for(const t of response.threads){
      if(String(t.parent_id)!==FORUM)refuse();
      collected.set(String(t.id),t);
    }
    if(collected.size>MAX_THREADS)refuse();
    if(!response.has_more){complete=true;break;}
    const last=response.threads.at(-1);
    const next=last?.thread_metadata?.archive_timestamp;
    if(typeof next!=='string'||next===before)refuse('ARCHIVE_PAGE_INCOMPLETE');
    before=next;
  }
  if(!complete)refuse('ARCHIVE_PAGE_INCOMPLETE'); // never silently treat partially read archive as complete
  const messagesByThread=new Map();
  for(const t of collected.values()){
    if(/^\s*\[?test\]?(?:\s|[-_:])/i.test(t.name||'')||
      /\btemplate\b/i.test(t.name||''))continue;
    let all=[],beforeId=null,done=false;
    for(let page=0;page<5;page++){
      const route='/channels/'+t.id+'/messages?limit=100'+
        (beforeId?'&before='+encodeURIComponent(beforeId):'');
      const messages=await get(route);
      if(!Array.isArray(messages)||messages.length>100)refuse('MESSAGE_PAGE_INCOMPLETE');
      all=all.concat(messages);
      if(all.length>MAX_MESSAGES)refuse();
      if(messages.length<100){done=true;break;}
      const next=messages.at(-1)?.id;
      if(!ID.test(String(next||''))||next===beforeId)refuse('MESSAGE_PAGE_INCOMPLETE');
      beforeId=next;
    }
    if(!done)refuse('MESSAGE_PAGE_INCOMPLETE');
    messagesByThread.set(String(t.id),all);
  }
  return summarizeTracker({forum,threads:[...collected.values()],
    messagesByThread,centerReport,nowMs});
}
module.exports={GUILD,FORUM,MODES,readEntry,eventIdFrom,
  summarizeTracker,trustedInvitationObservation,readInvitationTracker};
