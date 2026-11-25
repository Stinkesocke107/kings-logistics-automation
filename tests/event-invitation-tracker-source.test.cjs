'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GUILD,FORUM,MODES,readEntry,eventIdFrom,summarizeTracker,
  readInvitationTracker,trustedInvitationObservation}=require('../event-invitation-tracker-source');
const NOW=Date.parse('2026-11-25T15:00:00Z');
test('uses CEO-confirmed Invitation Tracker channel ID instead of retired assumed forum ID',()=>{
  assert.equal(FORUM,'1457797580703531143');
  assert.notEqual(FORUM,'1567471010436087949');
});
const A='777777777777777777',B='888888888888888888',C='999999999999999999';
const IDs=['111111111111111111','222222222222222222','333333333333333333'];
const tags=['444444444444444441','444444444444444442','444444444444444443'];
function fixture(){
  const forum={id:FORUM,guild_id:GUILD,type:15,
    available_tags:MODES.map((name,i)=>({id:tags[i],name}))};
  const threads=[
    {id:A,parent_id:FORUM,name:'Private Kings Convoy',applied_tags:[tags[0]]},
    {id:B,parent_id:FORUM,name:'Private SHL Convoy',applied_tags:[tags[1]]},
    {id:C,parent_id:FORUM,name:'Another private convoy',applied_tags:[tags[2]]}
  ];
  const human={id:'555555555555555555',bot:false};
  const entry=(id,content)=>({id,content,author:human});
  const messagesByThread=new Map([
    [A,[entry(A,'Convoy: https://truckersmp.com/events/123456'),
      entry(IDs[0],'First VTC — TMP VTC page: https://truckersmp.com/vtc/10101-first — Invited by: @Events — Response: Accepted'),
      entry(IDs[1],'Other VTC — TMP VTC page: https://truckersmp.com/vtc/20202 — Invited by: <@123456789012345678> — Response: Declined'),
      entry('444444444444444444','First VTC again — TMP VTC page: https://truckersmp.com/vtc/10101-first — Invited by: @External'),
      entry('555555555555555554','irrelevant conversation')]],
    [B,[entry(B,'Legacy Convoy (no event link)'),
      entry(IDs[2],'Third VTC — TMP VTC page: https://truckersmp.com/vtc/30303-third — Invited by: @Team — Response: Pending')]],
    [C,[entry(C,'Convoy https://truckersmp.com/events/123456')]]
  ]);
  const centerReport={mode:'READ_ONLY',threads:[
    {eventId:'123456',threadId:'666666666666666666',ignored:false,testThread:false}
  ]};
  return {forum,threads,messagesByThread,centerReport,nowMs:NOW};
}
test('strict VTC invitation reply parsing preserves one VTC per message',()=>{
  assert.deepEqual(readEntry(
    'First VTC — TMP VTC page: https://truckersmp.com/vtc/12345-first — Invited by: @Someone — Response: Accepted'
  ),{vtcId:'12345',response:'accepted'});
  assert.deepEqual(readEntry(
    'Other — TMP VTC page: https://truckersmp.com/vtc/72841-krypton — Invited by: <@123456789012345678>'
  ),{vtcId:'72841',response:'not-recorded'});
  for(const invalid of [
    '', 'Just a message', 'VTC — TMP VTC page: https://evil.test/vtc/123 — Invited by: @Someone',
    'VTC — TMP VTC page: https://truckersmp.com/vtc/123',
    '[VTC Name] — TMP VTC page: https://truckersmp.com/vtc/123 — Invited by: @User',
    'VTC — TMP VTC page: https://truckersmp.com/vtc/123 — Invited by: @Someone\nAnother VTC',
    'VTC — TMP VTC page: https://truckersmp.com/vtc/123 — Invited by: @Someone — Response: Invented'
  ])assert.equal(readEntry(invalid),null);
  assert.equal(eventIdFrom('https://truckersmp.com/events/123456-event'), '123456');
  assert.equal(eventIdFrom('https://truckersmp.com/events/1234 and https://truckersmp.com/events/5678'),null);
});
test('counts all invited VTCs, including declined ones, but never duplicates or approvals',()=>{
  const f=fixture(),x=summarizeTracker(f);
  assert.equal(x.convoyThreads,3);
  assert.equal(x.invitedVtcs,3);
  assert.equal(x.ongoingThreads,1);
  assert.equal(x.doneThreads,1);
  assert.equal(x.completedThreads,1);
  assert.equal(x.duplicateVtcReplies,1);
  assert.equal(x.malformedReplies,1);
  assert.equal(x.eventLinksRecorded,2);
  assert.equal(x.eventLinksMissing,1);
  assert.equal(x.duplicateConvoyEvents,1);
  assert.equal(x.linkedToCenter,2);
  assert.equal(x.recordedAccepted,1);
  assert.equal(x.recordedDeclined,1);
  assert.equal(x.recordedPending,1);
  assert.equal(x.replyNotRecorded,0);
  assert.equal(x.tagSchemaVerified,true);
  assert.equal(x.invitationDecisionsVerified,false);
  assert.equal(x.bookingsCreated,0);
  assert.equal(trustedInvitationObservation(x,NOW),x);
  const output=JSON.stringify(x);
  for(const privateValue of ['First VTC','Other VTC','Third VTC','123456789012345678',
    '123456-event','777777777777777777',GUILD,FORUM,'10101','20202','30303'])
    assert.equal(output.includes(privateValue),false,privateValue);
});
test('mismatched private Forum tag names preserve invitation replies without inventing statuses',()=>{
  const f=fixture();
  f.forum.available_tags=[
    {id:tags[0],name:'Event Invites - WIP'},
    {id:tags[1],name:'Finished Invitations'},
    {id:tags[2],name:'Old Convoy'}
  ];
  const x=summarizeTracker(f);
  assert.equal(x.sourceForumVerified,true);
  assert.equal(x.tagSchemaVerified,false);
  assert.equal(x.convoyThreads,3);
  assert.equal(x.invitedVtcs,3);
  assert.equal(x.recordedAccepted,1);
  assert.equal(x.recordedDeclined,1);
  assert.equal(x.recordedPending,1);
  assert.equal(x.tagIssues,3);
  assert.equal(x.ongoingThreads,0);
  assert.equal(x.doneThreads,0);
  assert.equal(x.completedThreads,0);
  assert.equal(x.invitationDecisionsVerified,false);
  assert.equal(x.bookingsCreated,0);
  assert.equal(trustedInvitationObservation(x,NOW),x);
  assert.equal(trustedInvitationObservation({...x,tagSchemaVerified:'yes'},NOW),null);
  assert.doesNotMatch(JSON.stringify(x),/WIP|Finished Invitations|Old Convoy/);
});
test('invalid tags, incomplete source, stale claims and unsupported fields fail closed',()=>{
  const f=fixture();
  f.threads[0].applied_tags=[];
  const x=summarizeTracker(f);
  assert.equal(x.tagIssues,1);
  assert.equal(x.ongoingThreads,0);
  assert.equal(trustedInvitationObservation(x,NOW+37*60*60*1000),null);
  assert.equal(trustedInvitationObservation({...x,vtcName:'LEAK'},NOW),null);
  assert.equal(trustedInvitationObservation({...x,invitationDecisionsVerified:true},NOW),null);
  assert.equal(trustedInvitationObservation({...x,bookingsCreated:1},NOW),null);
  assert.equal(trustedInvitationObservation({...x,recordedDeclined:8},NOW),null);
  f.threads[1].id=f.threads[0].id;
  assert.throws(()=>summarizeTracker(f),/unavailable/);
});
test('real reader is GET-only, confined to original private forum and emits aggregate without message text',async()=>{
  const f=fixture(),calls=[];
  const transport=async(url,opts)=>{
    calls.push({url,method:opts.method});
    assert.equal(opts.method,'GET');
    if(url==='https://discord.com/api/v10/channels/'+FORUM)
      return Response.json(f.forum);
    if(url==='https://discord.com/api/v10/guilds/'+GUILD+'/threads/active')
      return Response.json({threads:f.threads});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?'))
      return Response.json({threads:[],has_more:false});
    const id=f.threads.find(t=>url.includes('/channels/'+t.id+'/messages?'))?.id;
    if(id)return Response.json(f.messagesByThread.get(id));
    throw Error('unexpected endpoint');
  };
  const x=await readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',transport,
    centerReport:f.centerReport,nowMs:NOW
  });
  assert.equal(x.invitedVtcs,3);
  assert.equal(x.linkedToCenter,2);
  assert.equal(x.bookingsCreated,0);
  assert.equal(calls.length,6);
  assert.ok(calls.every(c=>c.method==='GET'));
  assert.ok(calls.every(c=>c.url.startsWith('https://discord.com/api/v10/')));
  assert.doesNotMatch(JSON.stringify(x),/First VTC|Private Kings|123456/);
});
test('Discord 403 or incomplete archive never produces a fictitious empty Tracker',async()=>{
  const f=fixture();
  await assert.rejects(()=>readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',
    transport:async()=>new Response('{}',{status:403}),nowMs:NOW
  }),e=>e.message==='Kings Invitation Tracker source unavailable'&&
    e.sourceReason==='ACCESS_DENIED_FORUM');
  await assert.rejects(()=>readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',
    transport:async(url)=>{
      if(url.includes('/channels/'+FORUM)&&!url.includes('/threads/'))
        return Response.json(f.forum);
      if(url.includes('/threads/active'))return Response.json({threads:[]});
      if(url.includes('/threads/archived/public?'))
        return Response.json({threads:[],has_more:true});
      throw Error('unexpected endpoint');
    },nowMs:NOW
  }),/unavailable/);
});

test('existing encrypted Event state feeds existing Event and Management dashboards, not raw VTC identities',()=>{
  const {encryptEventState}=require('../event-leadership-state');
  const {sandbox}=require('./sandbox.cjs');
  const obs=summarizeTracker(fixture());
  const privateState={
    version:1,createdAt:new Date(NOW).toISOString(),
    updatedAt:new Date(NOW).toISOString(),lastSnapshot:null,
    changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
    publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
    invitationSourceObservation:obs
  };
  const sealed=encryptEventState(privateState,'x'.repeat(32));
  const s=sandbox('leadership-dashboard.js',{files:{
    'data/event-leadership-report-state.json':JSON.stringify(sealed)
  }});
  const event=s.run('buildEvent({eventReports:readPrivateEventReports()},'+NOW+')');
  assert.match(JSON.stringify(event),/Invitation Tracker/);
  assert.match(JSON.stringify(event),/documented unique VTC invites/);
  assert.match(JSON.stringify(event),/declined/);
  assert.doesNotMatch(JSON.stringify(event),/First VTC|Other VTC|777777777777777777/);
  const management=s.run(
    'buildManagement({driverSummary:{currentDrivers:1,activity:{}},'+
    'hr:{reviews:[]},loa:{leaves:[]},staffSummary:{currentStaff:0,changesLast30Days:{}},'+
    'eventReports:readPrivateEventReports(),managementWeekly:{publishedWeeks:[]},'+
    'managementMonthly:{monthlyReports:[]}}, {}, {}, {}, {})'
  );
  assert.match(JSON.stringify(management),/Event Invitations/);
  assert.match(JSON.stringify(management),/Documented unique VTC invitations/);
  assert.doesNotMatch(JSON.stringify(management),/First VTC|Other VTC/);
  const stale=s.run('buildEvent({eventReports:readPrivateEventReports()},'+(NOW+37*3600000)+')');
  assert.match(JSON.stringify(stale),/private Invitation Tracker source missing, stale/);
  assert.doesNotMatch(JSON.stringify(stale),/invites \*\*3\*\*/);
});
test('Leadership keeps verified reply inventory but withholds unresolved Forum lifecycle status totals',()=>{
  const {encryptEventState}=require('../event-leadership-state');
  const {sandbox}=require('./sandbox.cjs');
  const f=fixture();
  f.forum.available_tags=[{id:tags[0],name:'Different Forum Tag'}];
  const observation=summarizeTracker(f);
  assert.equal(observation.tagSchemaVerified,false);
  const state={
    version:1,createdAt:new Date(NOW).toISOString(),
    updatedAt:new Date(NOW).toISOString(),lastSnapshot:null,
    changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
    publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
    invitationSourceObservation:observation
  };
  const sealed=encryptEventState(state,'x'.repeat(32));
  const s=sandbox('leadership-dashboard.js',{files:{
    'data/event-leadership-report-state.json':JSON.stringify(sealed)
  }});
  const event=s.run('buildEvent({eventReports:readPrivateEventReports()},'+NOW+')');
  const invitation=event.fields.find(x=>x.name.includes('Invitation Tracker'));
  assert.match(invitation.value,/documented unique VTC invites \\*\\*3\\*\\*/);
  assert.match(invitation.value,/Forum lifecycle tag names UNVERIFIED/);
  assert.doesNotMatch(invitation.value,/ongoing \\*\\*0\\*\\*/);
  const operations=event.fields.find(x=>x.name.includes('Event Operations'));
  assert.match(operations.value,/Forum lifecycle tags UNVERIFIED/);
  assert.doesNotMatch(JSON.stringify(event),/First VTC|Different Forum Tag/);
});
test('only existing GET-only source and encrypted reporting are wired; no invitation sender or booking engine',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const base=path.resolve(__dirname,'..');
  const reader=fs.readFileSync(path.join(base,'event-invitation-tracker-source.js'),'utf8');
  const workflow=fs.readFileSync(path.join(base,'.github/workflows/event-leadership-reports.yml'),'utf8');
  const reports=fs.readFileSync(path.join(base,'event-leadership-reports.js'),'utf8');
  assert.match(workflow,/event-invitation-tracker-source\.js/);
  assert.match(reports,/invitationSourceObservation=await readInvitationTracker/);
  assert.match(reports,/if \(!PREVIEW\)/);
  assert.doesNotMatch(reader,/method:\s*['"](?:POST|PATCH|DELETE|PUT)['"]/);
  assert.doesNotMatch(reader,/(?:writeFileSync|appendFileSync|console\.log)\(/);
  assert.doesNotMatch(reports,/console\.log\(.*invitationSourceObservation/);
});
