'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GUILD,FORUM,MODES,GUIDE_TAG,canonicalTagName,readEntry,eventIdFrom,approvedTags,summarizeTracker,
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
test('CEO-confirmed visible Forum emoji labels resolve exact lifecycle names without extra tag IDs',()=>{
  const f=fixture();
  f.forum.available_tags=[
    {id:'444444444444444440',name:'📌 Event Team Guide'},
    {id:tags[0],name:'🗒️ Invites Ongoing'},
    {id:tags[1],name:'✅ Invites Done'},
    {id:tags[2],name:'🏁 Convoy Completed'}
  ];
  assert.equal(GUIDE_TAG,'Event Team Guide');
  assert.equal(canonicalTagName('📌 Event Team Guide'),GUIDE_TAG);
  assert.equal(canonicalTagName(' 🗒️ Invites Ongoing'),'Invites Ongoing');
  assert.equal(canonicalTagName('✅ Invites Done'),'Invites Done');
  assert.equal(canonicalTagName('🏁 Convoy Completed'),'Convoy Completed');
  f.threads[0].applied_tags=[tags[0],'444444444444444440'];
  const observed=summarizeTracker(f);
  assert.equal(observed.tagSchemaVerified,true);
  assert.equal(observed.ongoingThreads,1);
  assert.equal(observed.doneThreads,1);
  assert.equal(observed.completedThreads,1);
  assert.equal(observed.tagIssues,0);
  assert.equal(observed.invitedVtcs,3);
  assert.equal(observed.bookingsCreated,0);
  assert.equal(trustedInvitationObservation(observed,NOW),observed);
  assert.doesNotMatch(JSON.stringify(observed),/Event Team Guide|🗒|🏁/);
});
test('guide-only documentation threads are excluded from invitation and status totals',async()=>{
  const f=fixture(),guideId='444444444444444440',guideThread='666666666666666667';
  f.forum.available_tags.unshift({id:guideId,name:'📌 Event Team Guide'});
  f.threads.push({id:guideThread,parent_id:FORUM,
    name:'Event Team Guide',applied_tags:[guideId]});
  // No message data for the guide-only thread: no read should be attempted.
  const observed=summarizeTracker(f);
  assert.equal(observed.convoyThreads,3);
  assert.equal(observed.invitedVtcs,3);
  assert.equal(observed.tagIssues,0);
  const calls=[];
  const transport=async(url,opts)=>{
    calls.push(url);
    assert.equal(opts.method,'GET');
    if(url.endsWith('/channels/'+FORUM))return Response.json(f.forum);
    if(url.endsWith('/guilds/'+GUILD+'/threads/active'))
      return Response.json({threads:f.threads});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?'))
      return Response.json({threads:[],has_more:false});
    for(const [id,messages] of f.messagesByThread){
      if(url.includes('/channels/'+id+'/messages?'))
        return Response.json(messages);
    }
    throw Error('unexpected GET route');
  };
  const live=await readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',
    transport,nowMs:NOW
  });
  assert.equal(live.tagSchemaVerified,true);
  assert.equal(live.convoyThreads,3);
  assert.ok(!calls.some(x=>x.includes('/channels/'+guideThread+'/messages?')));
});
test('duplicate and fuzzy Forum labels do not silently certify status mapping',()=>{
  const f=fixture();
  f.forum.available_tags=[
    {id:tags[0],name:'📑 Invites Ongoing'},
    {id:tags[1],name:'✅ Invites Done'},
    {id:tags[2],name:'🏁 Convoy Completed'},
    {id:'444444444444444444',name:'Invites Done'}
  ];
  const duplicate=summarizeTracker(f);
  assert.equal(duplicate.tagSchemaVerified,false);
  assert.equal(duplicate.invitedVtcs,3);
  assert.equal(duplicate.doneThreads,0);
  assert.equal(duplicate.tagIssues,3);
  f.forum.available_tags.pop();
  f.forum.available_tags[1].name='✅ Different Invites Done';
  const fuzzy=summarizeTracker(f);
  assert.equal(fuzzy.tagSchemaVerified,false);
  assert.equal(fuzzy.recordedAccepted,1);
  assert.equal(fuzzy.doneThreads,0);
  assert.equal(canonicalTagName('✅ Different Invites Done'),'Different Invites Done');
  assert.equal(canonicalTagName('Invites Done 🏁'),'Invites Done 🏁');
});
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
test('approved private Discord tag IDs reconcile lifecycle without renaming actual Forum tags',()=>{
  const f=fixture();
  f.forum.available_tags=[
    {id:tags[0],name:'Real Forum - status A'},
    {id:tags[1],name:'Real Forum - status B'},
    {id:tags[2],name:'Real Forum - status C'}
  ];
  const unconfigured=summarizeTracker(f);
  assert.equal(unconfigured.tagSchemaVerified,false);
  assert.equal(unconfigured.invitedVtcs,3);
  assert.equal(unconfigured.ongoingThreads,0);
  assert.equal(unconfigured.tagIssues,3);
  const mapping=tags.join(',');
  const mapped=summarizeTracker({...f,tagIds:mapping});
  assert.equal(mapped.tagSchemaVerified,true);
  assert.equal(mapped.convoyThreads,3);
  assert.equal(mapped.invitedVtcs,3);
  assert.equal(mapped.ongoingThreads,1);
  assert.equal(mapped.doneThreads,1);
  assert.equal(mapped.completedThreads,1);
  assert.equal(mapped.tagIssues,0);
  assert.equal(mapped.bookingsCreated,0);
  assert.equal(mapped.staffApprovalsVerified,false);
  assert.equal(trustedInvitationObservation(mapped,NOW),mapped);
  for(const value of ['Real Forum','status A','status B','status C',...tags])
    assert.ok(!JSON.stringify(mapped).includes(value));
});
test('only exact unique Forum tag ID mapping is trusted; unapproved or malformed mapping never silently guesses',()=>{
  const f=fixture();
  const dup=tags[0]+','+tags[0]+','+tags[2];
  for(const bad of [dup,'abc',tags[0]+';'+tags[1]+';'+tags[2],
    tags[0]+','+tags[1],123,['bad'],tags.join(',')+',fourth']){
    assert.throws(()=>summarizeTracker({...f,tagIds:bad}),
      e=>e.sourceReason==='TAG_MAPPING_INVALID');
  }
  // Validly formed but stale ID mapping is observable as unverified, not as
  // an invented state. No guessed status counts even with canonical names.
  const stale=['123456789012345678','123456789012345679','123456789012345680'].join(',');
  const x=summarizeTracker({...f,tagIds:stale});
  assert.equal(x.tagSchemaVerified,false);
  assert.equal(x.invitedVtcs,3);
  assert.equal(x.tagIssues,3);
  assert.equal(x.ongoingThreads,0);
  assert.equal(x.completedThreads,0);
  const direct=approvedTags(f.forum,tags.join(','));
  assert.equal(direct.tagSchemaVerified,true);
  assert.equal(direct.knownTags.get(tags[0]),'Invites Ongoing');
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
    'managementMonthly:{monthlyReports:[]}}, {}, {}, {}, {}, '+NOW+')'
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
  assert.ok(invitation.value.includes('documented unique VTC invites **3**'));
  assert.match(invitation.value,/Forum lifecycle tag names UNVERIFIED/);
  assert.ok(!invitation.value.includes('ongoing **0**'));
  const operations=event.fields.find(x=>x.name.includes('Event Operations — Review Order'));
  assert.ok(operations);
  assert.match(operations.value,/Reconcile existing Forum tag names manually/);
  assert.match(operations.value,/Source-data alerts, not Staff progress/);
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

test('invitation rows without a human author or posted by a webhook are never counted as VTC replies',()=>{
  const f=fixture(),messages=f.messagesByThread.get(C);
  const content='Proof VTC — TMP VTC page: https://truckersmp.com/vtc/40404 — Invited by: @Events — Response: Accepted';
  messages.push(
    {id:'555555555555555551',content,author:null},
    {id:'555555555555555552',content,author:{id:'555555555555555555',bot:false},
      webhook_id:'555555555555555556'},
    {id:'555555555555555553',content,author:{id:'555555555555555555'}}
  );
  const x=summarizeTracker(f);
  assert.equal(x.invitedVtcs,4); // only the final genuine human row is new
  assert.equal(x.recordedAccepted,2);
  assert.equal(x.malformedReplies,3); // original malformed + two untrusted rows
  assert.equal(x.staffApprovalsVerified,false);
  assert.equal(x.invitationDecisionsVerified,false);
  assert.equal(x.bookingsCreated,0);
  assert.equal(trustedInvitationObservation(x,NOW),x);
  assert.doesNotMatch(JSON.stringify(x),/40404|555555555555555551|555555555555555552/);
});

test('duplicate active and archived Invitation forum identities fail closed instead of silently overwriting',async()=>{
  const f=fixture();
  const calls=[];
  const transport=async url=>{
    calls.push(url);
    if(url.endsWith('/channels/'+FORUM))return Response.json(f.forum);
    if(url.endsWith('/guilds/'+GUILD+'/threads/active'))
      return Response.json({threads:f.threads});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?'))
      return Response.json({threads:[{...f.threads[0],
        applied_tags:[tags[2]]}],has_more:false});
    throw Error('Private messages must not be requested on inconsistent source');
  };
  await assert.rejects(()=>readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',transport,nowMs:NOW
  }),e=>e.sourceReason==='SOURCE_INCONSISTENT');
  assert.equal(calls.some(x=>x.includes('/messages?')),false);
});

test('archives with a repeated thread on a later page fail before reading invitation messages',async()=>{
  const f=fixture();
  let page=0;
  const transport=async url=>{
    if(url.endsWith('/channels/'+FORUM))return Response.json(f.forum);
    if(url.endsWith('/guilds/'+GUILD+'/threads/active'))
      return Response.json({threads:[]});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?')){
      page++;
      const row={...f.threads[0],thread_metadata:{
        archive_timestamp:'2026-11-24T08:00:00.000Z'
      }};
      return Response.json({threads:[row],has_more:page===1});
    }
    throw Error('Messages must not be read for repeated archived pages');
  };
  await assert.rejects(()=>readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',transport,nowMs:NOW
  }),e=>e.sourceReason==='SOURCE_INCONSISTENT');
  assert.equal(page,2);
});

test('archive pagination cursor must move backward in UTC, never forward or repeat',async()=>{
  const f=fixture();
  let page=0;
  const transport=async url=>{
    if(url.endsWith('/channels/'+FORUM))return Response.json(f.forum);
    if(url.endsWith('/guilds/'+GUILD+'/threads/active'))
      return Response.json({threads:[]});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?')){
      page++;
      const next=page===1?'2026-11-24T08:00:00.000Z':
        '2026-11-25T08:00:00.000Z';
      const row={...f.threads[page],thread_metadata:{archive_timestamp:next}};
      return Response.json({threads:[row],has_more:true});
    }
    throw Error('Messages must not be read on nondecreasing archived cursor');
  };
  await assert.rejects(()=>readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',transport,nowMs:NOW
  }),e=>e.sourceReason==='ARCHIVE_PAGE_INCOMPLETE');
  assert.equal(page,2);
});

test('unverified lifecycle mapping cannot be laundered into certified status counters',()=>{
  const f=fixture();
  f.forum.available_tags=[{id:tags[0],name:'Unapproved name'}];
  const observation=summarizeTracker(f);
  assert.equal(observation.tagSchemaVerified,false);
  assert.equal(observation.tagIssues,observation.convoyThreads);
  assert.equal(trustedInvitationObservation({
    ...observation,ongoingThreads:1,tagIssues:observation.tagIssues-1
  },NOW),null);
  assert.equal(trustedInvitationObservation(observation,NOW),observation);
  assert.equal(observation.invitationDecisionsVerified,false);
  assert.equal(observation.bookingsCreated,0);
});

test('Discord offset-aware UTC archive timestamps paginate safely without creating invitations',async()=>{
  const f=fixture();
  const pageUrls=[];
  const transport=async url=>{
    if(url.endsWith('/channels/'+FORUM))return Response.json(f.forum);
    if(url.endsWith('/guilds/'+GUILD+'/threads/active'))
      return Response.json({threads:[]});
    if(url.includes('/channels/'+FORUM+'/threads/archived/public?')){
      pageUrls.push(url);
      return Response.json(pageUrls.length===1?{threads:[{
        ...f.threads[0],
        thread_metadata:{archive_timestamp:'2026-11-24T08:00:00.000+00:00'}
      }],has_more:true}:{threads:[],has_more:false});
    }
    if(url.includes('/channels/'+A+'/messages?'))
      return Response.json(f.messagesByThread.get(A));
    throw Error('Unexpected private route');
  };
  const r=await readInvitationTracker({
    token:'synthetic-test-bot-token-not-a-secret',transport,nowMs:NOW
  });
  assert.equal(pageUrls.length,2);
  assert.ok(pageUrls[1].includes('before='));
  assert.equal(r.convoyThreads,1);
  assert.equal(r.bookingsCreated,0);
  assert.equal(r.invitationDecisionsVerified,false);
});
