'use strict';
// Synthetic-only #18 Event Staff review -> fixed Discord dashboard read-back.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {encryptEventState}=require('../event-leadership-state');
const {COUNT_FIELDS}=require('../event-leadership-observation');
const {renderReviewSummary}=require('../event-operations-manual-review-state');
const {renderInvitationDashboardSource}=require('../event-invitation-tracker-source');
const {run,FIELD,INVITATION_FIELD,TITLE,CHANNEL}=require('../event-review-dashboard-readonly-proof');
const NOW=Date.parse('2026-11-27T00:00:00.000Z');
const SECRET='SYNTHETIC_PRIVATE_EVENT_TEST_SECRET_MORE_THAN_32_BYTES';
const BOT='777777777777777771';
const MESSAGE='777777777777777772';
function state(){
 return {version:1,lastSnapshot:null,changeLog:[],
   publishedDailyKeys:[],publishedWeeklyKeys:[],publishedMonthlyKeys:[],
   weeklyReports:[],monthlyReports:[]};
}
function harness({
  rawState=state(),fieldValue=renderReviewSummary(rawState,NOW),
  invitationValue=renderInvitationDashboardSource(rawState.invitationSourceObservation,NOW),
  missingInvitation=false,duplicateInvitation=false,
  messageAuthor=BOT,channelId=CHANNEL,botId=BOT,
  plain=false,wrongMessage=false
}={}){
 const calls=[];
 const enc=plain?rawState:encryptEventState(rawState,SECRET);
 const messageState={messageIds:{event:MESSAGE}};
 const read=file=>{
   if(file.endsWith('event-leadership-report-state.json'))
     return JSON.stringify(enc);
   if(file.endsWith('leadership-dashboard-state.json'))
     return JSON.stringify(messageState);
   throw Error('Unexpected synthetic file read');
 };
 const reply=payload=>({ok:true,text:async()=>JSON.stringify(payload)});
 const transport=async(url,options)=>{
   calls.push({url,method:options.method,redirect:options.redirect});
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.ok(options.signal);
   if(url.endsWith('/users/@me'))return reply({id:botId,bot:true});
   if(url.endsWith('/channels/'+CHANNEL+'/messages/'+MESSAGE))
     return reply({id:wrongMessage?BOT:MESSAGE,channel_id:channelId,
       author:{id:messageAuthor,bot:true},
       embeds:[{title:TITLE,fields:[
         {name:FIELD,value:fieldValue},
         ...(!missingInvitation?[{name:INVITATION_FIELD,value:invitationValue}]:[]),
         ...(duplicateInvitation?[{name:INVITATION_FIELD,value:invitationValue}]:[])
       ]}]});
   throw Error('Unexpected synthetic network request');
 };
 const env={DRIVER_STATE_KEY:SECRET,DISCORD_BOT_TOKEN:'SYNTHETIC_BOT_TOKEN'};
 return {calls,env,read,transport};
}
test('protected Event Staff review state equals stored owner-bot Discord progress after publication',async()=>{
 const h=harness();
 const r=await run({...h,nowMs:NOW});
 assert.equal(r.status,'VERIFIED');
 assert.equal(r.readOnlyDiscord,true);
 assert.equal(r.encryptedSource,true);
 assert.equal(r.staffCommandsExecuted,0);
 assert.equal(r.originalStaffApprovalsVerified,false);
 assert.equal(r.bookingsCreated,0);
 assert.equal(r.discordWrites,0);
 assert.equal(h.calls.length,2);
 assert.ok(h.calls.every(c=>c.method==='GET'&&c.redirect==='error'));
});
test('stale or incorrect live Staff progress is a hard failure, not a green delivery',async()=>{
 for(const h of [
   harness({fieldValue:'Old private review count'}),
   harness({messageAuthor:'777777777777777775'}),
   harness({channelId:'777777777777777775'}),
   harness({wrongMessage:true}),
   harness({plain:true})
 ])await assert.rejects(()=>run({...h,nowMs:NOW}),/unverified|invalid/i);
});
test('changed protected source without dashboard refresh fails closed',async()=>{
 const previous=state();
 const next={...previous,discordReviewCursor:'777777777777777775'};
 // The field value is intentionally different to represent a subsequent
 // real review publication mismatch. Never fake a real Staff command.
 const h=harness({rawState:next,fieldValue:'Older confirmed Staff progress'});
 await assert.rejects(()=>run({...h,nowMs:NOW}),/unverified/i);
});
test('missing token or protected key never reads private source nor contacts Discord',async()=>{
 const h=harness();
 let reads=0;
 await assert.rejects(()=>run({
   ...h,env:{DISCORD_BOT_TOKEN:'SYNTHETIC',DRIVER_STATE_KEY:'short'},
   read:()=>{reads++;throw Error('private state read occurred')},nowMs:NOW
 }),/unverified/i);
 assert.equal(reads,0);
 assert.equal(h.calls.length,0);
});
test('dashboard workflow checks private journal only after actual publication and uses no extra writes',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/leadership-dashboard.yml'),'utf8');
 const publish=workflow.indexOf('run: node leadership-dashboard.js');
 const persist=workflow.indexOf('Persist dashboard message IDs');
 const verify=workflow.indexOf('run: node event-review-dashboard-readonly-proof.js');
 assert.ok(publish>=0&&persist>publish&&verify>persist);
 assert.match(workflow,/node --check event-review-dashboard-readonly-proof\.js/);
 assert.match(workflow,/DRIVER_STATE_KEY:/);
 assert.match(workflow,/DISCORD_BOT_TOKEN:/);
 const worker=fs.readFileSync(path.join(__dirname,'../event-review-dashboard-readonly-proof.js'),'utf8');
 assert.doesNotMatch(worker,/method:['"](?:POST|PATCH|DELETE)['"]/);
});

test('Invitation Tracker must match same encrypted source and exact stored Discord message',async()=>{
 const h=harness();
 assert.equal((await run({...h,nowMs:NOW})).status,'VERIFIED');
 for(const invalid of [
   harness({invitationValue:'Old invitation inventory'}),
   harness({missingInvitation:true}),
   harness({duplicateInvitation:true})
 ])await assert.rejects(()=>run({...invalid,nowMs:NOW}),/unverified/i);
});

test('fresh private Invitation Tracker source changes require the actual dashboard to refresh',async()=>{
 const make=(invitedVtcs,stamp=NOW)=>({
   version:1,readOnly:true,sourceForumVerified:true,
   tagSchemaVerified:true,invitationDecisionsVerified:false,
   staffApprovalsVerified:false,bookingsCreated:0,
   observedAt:new Date(stamp).toISOString(),
   convoyThreads:1,invitedVtcs,ongoingThreads:1,doneThreads:0,
   completedThreads:0,tagIssues:0,malformedReplies:0,
   duplicateVtcReplies:0,eventLinksRecorded:1,eventLinksMissing:0,
   duplicateConvoyEvents:0,linkedToCenter:1,recordedAccepted:0,
   recordedDeclined:0,recordedPending:0,replyNotRecorded:invitedVtcs
 });
 const previous=state();
 previous.invitationSourceObservation=make(1);
 const updated=state();
 updated.invitationSourceObservation=make(2);
 const previouslyPublished=renderInvitationDashboardSource(
   previous.invitationSourceObservation,NOW);
 assert.match(previouslyPublished,/unique VTC invites \*\*1\*\*/);
 const old=harness({rawState:updated,invitationValue:previouslyPublished});
 await assert.rejects(()=>run({...old,nowMs:NOW}),/unverified/i);
 const published=harness({rawState:updated});
 const result=await run({...published,nowMs:NOW});
 assert.equal(result.status,'VERIFIED');
 assert.equal(result.staffCommandsExecuted,0);
 assert.equal(result.discordWrites,0);
 assert.equal(result.originalStaffApprovalsVerified,false);
 assert.doesNotMatch(JSON.stringify(result),/777777777777|invitedVtcs/);
});

function fullyReconciledSource(nowMs=NOW){
 const at=new Date(nowMs).toISOString();
 const event={
   version:1,observedAt:at,sourceCompiledAt:new Date(nowMs-60_000).toISOString(),
   sourceReconciled:true,readOnly:true,historyVerified:false,
   staffApprovalsVerified:false,freeSlotsCertified:false,bookingsCreated:0,
   ...Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),
   historyMonthsWithClaims:0,historyMonthsWithoutClaims:24
 };
 const invites={
   version:1,readOnly:true,sourceForumVerified:true,tagSchemaVerified:true,
   invitationDecisionsVerified:false,staffApprovalsVerified:false,
   bookingsCreated:0,observedAt:at,
   convoyThreads:0,invitedVtcs:0,ongoingThreads:0,doneThreads:0,
   completedThreads:0,tagIssues:0,malformedReplies:0,
   duplicateVtcReplies:0,eventLinksRecorded:0,eventLinksMissing:0,
   duplicateConvoyEvents:0,linkedToCenter:0,recordedAccepted:0,
   recordedDeclined:0,recordedPending:0,replyNotRecorded:0
 };
 return {...state(),eventSourceObservation:event,invitationSourceObservation:invites};
}
test('manual strict source gate refuses matched but unverified dashboard and does not request Discord',async()=>{
 for(const raw of [
   state(),{...state(),eventSourceObservation:fullyReconciledSource().eventSourceObservation},
   {...fullyReconciledSource(),invitationSourceObservation:{
     ...fullyReconciledSource().invitationSourceObservation,
     tagSchemaVerified:false
   }},
   {...fullyReconciledSource(),eventSourceObservation:{
     ...fullyReconciledSource().eventSourceObservation,
     observedAt:new Date(NOW-37*3600000).toISOString(),
     sourceCompiledAt:new Date(NOW-37*3600000-60000).toISOString()
   }}
 ]){
   const h=harness({rawState:raw});
   await assert.rejects(()=>run({...h,nowMs:NOW,
     env:{...h.env,KINGS_EVENT_READBACK_REQUIRE_FRESH_SOURCE:'true'}}),
   /unverified/i);
   assert.equal(h.calls.length,0);
 }
});
test('strict live acceptance preflight only passes with fresh both-source state and stored bot fields',async()=>{
 const h=harness({rawState:fullyReconciledSource()});
 const result=await run({...h,nowMs:NOW,env:{
   ...h.env,KINGS_EVENT_READBACK_REQUIRE_FRESH_SOURCE:'true'
 }});
 assert.equal(result.status,'VERIFIED');
 assert.equal(result.staffCommandsExecuted,0);
 assert.equal(result.originalStaffApprovalsVerified,false);
 assert.equal(result.discordWrites,0);
 assert.equal(h.calls.length,2);
});
