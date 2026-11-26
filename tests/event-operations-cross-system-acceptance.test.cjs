'use strict';
// Cross-system offline proof for Kings Event Operations #18. Synthetic private
// observations only; never requests Discord, modifies Event decisions or logs
// real tokens. This does NOT replace the pending real production E2E acceptance.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {COUNT_FIELDS,trustedEventObservation}=
  require('../event-leadership-observation');
const {trustedInvitationObservation}=
  require('../event-invitation-tracker-source');
const {observeOperations,operationsWorklist}=
  require('../event-operations-staff-triage');
const {renderPrivateReviewTokens,reviewSummary,applyManualReview}=
  require('../event-operations-manual-review-state');
const {encryptEventState,decryptEventState}=
  require('../event-leadership-state');
const {GUILD}=require('../event-operations-discord-review-source');
const {run}=require('../event-operations-discord-review');
const {sandbox}=require('./sandbox.cjs');
const NOW=Date.parse('2026-11-26T14:00:00.000Z');
const SECRET='SYNTHETIC_CROSS_SYSTEM_PRIVATE_KEY_'.repeat(2);
const CHANNEL='777777777777777770',ROLE='777777777777777771';
const BOTROLE='777777777777777772',BOT='777777777777777773';
const STAFF='777777777777777774',OUTSIDER='777777777777777775';
const CURSOR='777777777777777780';
function observations(){
  const observedAt=new Date(NOW).toISOString();
  const event={
    version:1,observedAt,
    sourceCompiledAt:new Date(NOW-300000).toISOString(),
    sourceReconciled:true,readOnly:true,historyVerified:false,
    staffApprovalsVerified:false,freeSlotsCertified:false,bookingsCreated:0,
    ...Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),
    tracked:4,scheduled:2,readyForApproval:1,needsInformation:1,
    futureDaysOverDailyLimit:1,futureDaysRequiringReview:1,
    historyCenterClaims:2,historyLegacyClaims:1,
    historyMonthsWithClaims:3,historyMonthsWithoutClaims:21,
    historyMonthsCenterOnly:2,historyMonthsLegacyOnly:1,
    historyLegacyEvidencePending:1,
    reviewAgenda:[{code:'FUTURE_LEGACY_HOLD',utcMonth:'2026-12',count:1}]
  };
  const invite={
    version:1,readOnly:true,sourceForumVerified:true,
    tagSchemaVerified:true,invitationDecisionsVerified:false,
    staffApprovalsVerified:false,bookingsCreated:0,observedAt,
    convoyThreads:3,invitedVtcs:3,ongoingThreads:1,
    doneThreads:1,completedThreads:1,tagIssues:0,
    malformedReplies:0,duplicateVtcReplies:0,
    eventLinksRecorded:2,eventLinksMissing:1,duplicateConvoyEvents:0,
    linkedToCenter:1,recordedAccepted:1,recordedDeclined:1,
    recordedPending:1,replyNotRecorded:0
  };
  assert.ok(trustedEventObservation(event,NOW));
  assert.ok(trustedInvitationObservation(invite,NOW));
  return {event,invite};
}
function state(){
  const {event,invite}=observations();
  const at=new Date(NOW).toISOString();
  return {
    version:1,createdAt:at,updatedAt:at,lastSnapshot:null,
    changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
    publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
    eventSourceObservation:event,invitationSourceObservation:invite,
    discordReviewCursor:CURSOR
  };
}
function tokenFor(state,fragment){
  const text=renderPrivateReviewTokens(state,SECRET,NOW);
  const line=text.split('\n').find(x=>x.includes(fragment));
  assert.ok(line,'An eligible private worklist item should have a command');
  const token=line.match(/KR[a-f0-9]{24}/)?.[0];
  assert.ok(token,'Private selector must be an opaque KR token');
  return token;
}
function mockDiscord(messages,memberRoles=[ROLE]){
  const seen=[];
  const channel={
    id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      {id:ROLE,type:0,allow:'3072',deny:'0'},
      {id:BOTROLE,type:0,allow:'3072',deny:'0'}
    ]
  };
  const roles=[
    {id:GUILD,name:'@everyone',permissions:'0'},
    {id:ROLE,name:'│ Event Coordinator',permissions:'0'},
    {id:BOTROLE,name:'Bot',permissions:'0'}
  ];
  return {
    seen,
    transport:async(url,opts)=>{
      seen.push({url,method:opts.method});
      assert.equal(opts.method,'GET');
      assert.match(url,/^https:\/\/discord\.com\/api\/v10\//);
      let result;
      if(url.endsWith('/channels/'+CHANNEL))result=channel;
      else if(url.endsWith('/guilds/'+GUILD+'/roles'))result=roles;
      else if(url.endsWith('/users/@me'))result={id:BOT,bot:true};
      else if(url.endsWith('/guilds/'+GUILD+'/members/'+BOT))
        result={roles:[BOTROLE]};
      else if(url.endsWith('/guilds/'+GUILD+'/members/'+STAFF))
        result={roles:memberRoles};
      else if(url.endsWith('/guilds/'+GUILD+'/members/'+OUTSIDER))
        result={roles:[]};
      else if(url.includes('/channels/'+CHANNEL+'/messages?')){
        const before=new URL(url).searchParams.get('before');
        result=messages.filter(m=>!before||BigInt(m.id)<BigInt(before))
          .slice(0,100);
      }else throw Error('Unexpected synthetic Discord GET');
      return {ok:true,json:async()=>result};
    }
  };
}
function msg(id,content,author=STAFF){
  return {id,channel_id:CHANNEL,content,author:{id:author,bot:false}};
}
function env(){
  return {
    KINGS_EVENT_DISCORD_REVIEW_ENABLED:'ENABLED',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    DISCORD_BOT_TOKEN:'SYNTHETIC_BOT_TOKEN',DRIVER_STATE_KEY:SECRET,
    KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID:CHANNEL,
    KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS:ROLE
  };
}
test('Event #12/#16 capacity-calendar, #14 history, #15 invitation sources feed one authorized #18 journal and private dashboard',async()=>{
  const original=state();
  const operations=observeOperations({
    eventSourceObservation:original.eventSourceObservation,
    invitationSourceObservation:original.invitationSourceObservation,
    nowMs:NOW
  });
  assert.equal(operations.eventSource,'RECONCILED');
  assert.equal(operations.invitationSource,'RECONCILED');
  const labels=operationsWorklist(operations).map(x=>x.code);
  for(const code of ['REVIEW_DAILY_CAP','REVIEW_CALENDAR_DAYS',
    'REVIEW_MISSING_EVENT_LINKS','REVIEW_LEGACY_EVIDENCE'])
    assert.ok(labels.includes(code),code);
  const commands=[
    tokenFor(original,'Review UTC days above 3 source-claimed convoys'),
    tokenFor(original,'Match missing event links to current Convoy Center'),
    tokenFor(original,'2026-12')
  ];
  const messages=commands.map((token,i)=>
    msg(String(BigInt(CURSOR)+BigInt(i+1)),
      '!kings-review '+token+' start')).reverse();
  const discord=mockDiscord(messages);
  const writes=[];
  const encoded=encryptEventState(original,SECRET);
  const result=await run({env:env(),transport:discord.transport,nowMs:NOW,
    read:()=>JSON.stringify(encoded),
    write:(file,content)=>writes.push({file,content})});
  assert.equal(result.status,'SOURCE_REVIEWS_RECORDED');
  assert.equal(result.bookingsCreated,0);
  assert.equal(result.discordWrites,0);
  assert.equal(writes.length,1);
  assert.ok(writes[0].file.endsWith('data/event-leadership-report-state.json'));
  assert.ok(!writes[0].content.includes('Review UTC days'));
  const after=decryptEventState(JSON.parse(writes[0].content),SECRET);
  assert.equal(after.operationReviews.length,3);
  assert.ok(after.operationReviews.every(x=>x.status==='IN_REVIEW'));
  assert.deepEqual(after.eventSourceObservation,original.eventSourceObservation);
  assert.deepEqual(after.invitationSourceObservation,original.invitationSourceObservation);
  assert.equal(after.eventSourceObservation.staffApprovalsVerified,false);
  assert.equal(after.eventSourceObservation.freeSlotsCertified,false);
  assert.equal(after.eventSourceObservation.bookingsCreated,0);
  assert.equal(after.invitationSourceObservation.invitationDecisionsVerified,false);
  assert.equal(after.invitationSourceObservation.bookingsCreated,0);
  assert.equal(reviewSummary(after,NOW).inReview,3);
  const sb=sandbox('leadership-dashboard.js');
  const dashboard=sb.run('buildEvent('+JSON.stringify({eventReports:after})+','+NOW+')');
  const progress=dashboard.fields.find(x=>x.name.includes('Manual Staff Progress'));
  const capacity=dashboard.fields.find(x=>x.name.includes('Event Capacity'));
  const history=dashboard.fields.find(x=>x.name.includes('Event History'));
  const invitation=dashboard.fields.find(x=>x.name.includes('Invitation Tracker'));
  assert.match(progress.value,/In review \*\*3\*\*/);
  assert.match(progress.value,/In progress/);
  assert.match(progress.value,/Starting a review does not clear a BLOCKED source/);
  assert.match(capacity.value,/No free slots certified/);
  assert.match(history.value,/Historical decisions NOT verified/);
  assert.match(invitation.value,/NOT verified approvals or participation/);
  assert.ok(discord.seen.every(x=>x.method==='GET'));
  assert.ok(discord.seen.some(x=>x.url.includes('/messages?')));
  assert.ok(discord.seen.some(x=>x.url.includes('/members/'+STAFF)));
});
test('changed source evidence immediately causes RECHECK_REQUIRED without falsely certifying Events',async()=>{
  const initial=state();
  const token=tokenFor(initial,'Review UTC days above 3 source-claimed convoys');
  const discord=mockDiscord([msg(String(BigInt(CURSOR)+1n),
    '!kings-review '+token+' start')]);
  let output='';
  const result=await run({env:env(),transport:discord.transport,nowMs:NOW,
    read:()=>JSON.stringify(encryptEventState(initial,SECRET)),
    write:(_file,c)=>{output=c}});
  assert.equal(result.status,'SOURCE_REVIEWS_RECORDED');
  const after=decryptEventState(JSON.parse(output),SECRET);
  assert.equal(reviewSummary(after,NOW).inReview,1);
  const changed=structuredClone(after);
  changed.eventSourceObservation.futureDaysOverDailyLimit=2;
  changed.eventSourceObservation.futureDaysRequiringReview=2;
  assert.ok(trustedEventObservation(changed.eventSourceObservation,NOW+60000));
  assert.equal(reviewSummary(changed,NOW+60000).recheck,1);
  assert.throws(()=>applyManualReview({
    state:changed,scope:'worklist',code:'REVIEW_DAILY_CAP',month:null,
    action:'record_check',actor:'EventLead',evidenceKind:'STAFF_RECORD',
    confirmation:'ORIGINAL_RECORDS_CHECKED',nowMs:NOW+60000
  }),/unverified/);
  assert.equal(changed.eventSourceObservation.staffApprovalsVerified,false);
  assert.equal(changed.eventSourceObservation.freeSlotsCertified,false);
});
test('unapproved Discord sender cannot mutate cross-system Staff reviews',async()=>{
  const initial=state();
  const token=tokenFor(initial,'Review UTC days above 3 source-claimed convoys');
  const discord=mockDiscord([msg(String(BigInt(CURSOR)+1n),
    '!kings-review '+token+' start',OUTSIDER)]);
  let output='';
  const result=await run({env:env(),transport:discord.transport,nowMs:NOW,
    read:()=>JSON.stringify(encryptEventState(initial,SECRET)),
    write:(_file,c)=>{output=c}});
  assert.equal(result.status,'CURSOR_ADVANCED');
  const after=decryptEventState(JSON.parse(output),SECRET);
  assert.deepEqual(after.operationReviews||[],[]);
  assert.deepEqual(after.eventSourceObservation,initial.eventSourceObservation);
  assert.deepEqual(after.invitationSourceObservation,initial.invitationSourceObservation);
  assert.equal(after.discordReviewIgnored,1);
});
test('only successfully persisted encrypted review state can trigger the fixed dashboard workflow',()=>{
  for(const filename of [
    'event-operations-discord-review.yml',
    'event-operations-manual-review.yml'
  ]){
    const text=fs.readFileSync(path.join(__dirname,'..','.github','workflows',filename),'utf8');
    const push=text.indexOf('bash scripts/git-safe-push.sh main');
    const changed=text.indexOf('echo "changed=true" >> "$GITHUB_OUTPUT"');
    const trigger=text.indexOf('gh workflow run leadership-dashboard.yml');
    assert.ok(push>=0&&changed>push&&trigger>changed);
    assert.match(text,/if: steps\.persist\.outputs\.changed == 'true'/);
    assert.match(text,/actions: write/);
  }
});
