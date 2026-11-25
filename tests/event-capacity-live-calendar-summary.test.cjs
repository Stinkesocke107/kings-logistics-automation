'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {monthlyFromReports:project,calendarLines}
  =require('../event-capacity-live-calendar-summary');
const {messageFor,publishGithubOnlyStatus}
  =require('../event-capacity-github-only');
const G='1114967437788577792',F='1550619824005062697';
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
function thread(id,status='Scheduled',type='Partner Convoy',
  departureAtUtc='2027-03-21T16:00:00Z'){
  return {threadId:'77777777777777777'+String(id),
    eventId:'evt'+id,status,name:'synthetic only, do not display',
    validation:{parsed:{eventType:type,departureAtUtc}}};
}
function fixture(threads=[thread(1)]){
  const report={
    guildId:G,forumId:F,generatedAt:'2027-03-20T11:53:00Z',
    finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
    summary:{totalThreads:threads.length,actualConvoys:threads.length},
    threads
  };
  const overview={
    guildId:G,forumId:F,generatedAt:'2027-03-20T11:57:00Z',
    overall:{realConvoySubmissions:threads.length,convoyReadErrors:0,
      legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
    registeredConvoys:threads.map(t=>({
      source:'convoy-center',threadId:t.threadId,eventId:t.eventId,
      status:t.status,departureAtUtc:t.validation.parsed.departureAtUtc
    }))
  };
  return {report,overview,nowMs:NOW};
}
test('Twelve-month read-only Event Calendar uses actual source claims, never approved slots',()=>{
  const r=project(fixture());
  assert.equal(r.firstMonth,'2027-03');
  assert.equal(r.lastMonth,'2028-02');
  assert.equal(r.months.length,12);
  assert.equal(r.centerClaimsInVisibleMonths,1);
  assert.equal(r.months[0].claimedScheduled,1);
  assert.equal(r.months[0].partner,1);
  assert.equal(r.months[0].days[0].date,'2027-03-21');
  assert.equal(r.months[0].days[0].claimedScheduled,1);
  assert.equal(r.declaredDepartureIsNotVerifiedBooking,true);
  assert.equal(r.reportedScheduledIsNotStaffVerifiedAcceptance,true);
  assert.equal(r.completedIsNotAttendance,true);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.bookingsChanged,0);
});
test('Scheduled, pending, cancelled and unclassified counts stay separate',()=>{
  const r=project(fixture([
    thread(1,'Scheduled','Partner Convoy','2027-03-21T16:00:00Z'),
    thread(2,'Ready for Approval','External Convoy','2027-03-21T18:00:00Z'),
    thread(3,'Cancelled','Partner Convoy','2027-03-21T20:00:00Z'),
    thread(4,'Completed','Unknown','2027-04-10T14:00:00Z')
  ]));
  assert.equal(r.months[0].claimedScheduled,1);
  assert.equal(r.months[0].claimedPending,1);
  assert.equal(r.months[0].claimedCancelled,1);
  assert.equal(r.months[0].partner,1);
  assert.equal(r.months[0].external,0);
  assert.equal(r.months[1].claimedScheduled,1);
  assert.equal(r.months[1].unclassified,1);
  assert.equal(r.months[1].reviewFlagDays,1);
  assert.equal(r.centerClaimsInVisibleMonths,4);
  assert.equal(r.attendanceInferred,undefined);
  assert.equal(r.completedIsNotAttendance,true);
});
test('All days apply three total Convoys including weekends, with no category daily cap',()=>{
  const r=project(fixture([
    // Thursday: 4 source claims -> flagged (>3).
    thread(1,'Scheduled','Partner Convoy','2027-03-25T09:00:00Z'),
    thread(2,'Scheduled','External Convoy','2027-03-25T12:00:00Z'),
    thread(3,'Scheduled','External Convoy','2027-03-25T15:00:00Z'),
    thread(4,'Scheduled','Partner Convoy','2027-03-25T18:00:00Z'),
    // Saturday: 4 source claims -> >3, equally flagged.
    thread(5,'Scheduled','Partner Convoy','2027-03-27T09:00:00Z'),
    thread(6,'Scheduled','External Convoy','2027-03-27T12:00:00Z'),
    thread(7,'Scheduled','Partner Convoy','2027-03-27T15:00:00Z'),
    thread(8,'Scheduled','External Convoy','2027-03-27T18:00:00Z')
  ]));
  const th=r.months[0].days.find(x=>x.date==='2027-03-25');
  const sa=r.months[0].days.find(x=>x.date==='2027-03-27');
  assert.equal(th.reviewFlag,true);
  assert.equal(sa.reviewFlag,true);
  assert.equal(sa.dailyLimitExceeded,true);
  assert.equal(sa.priorityConflict,true);
  assert.equal(th.partner,2);
  assert.equal(sa.partner,2);
  assert.equal(r.freeSlotsCertified,false);
});
test('Same-day departures less than two hours apart are only a review warning',()=>{
  const r=project(fixture([
    thread(1,'Scheduled','Partner Convoy','2027-03-21T16:00:00Z'),
    thread(2,'Scheduled','External Convoy','2027-03-21T17:00:00Z')
  ]));
  assert.equal(r.months[0].days[0].potentialSpacingConflict,true);
  assert.equal(r.months[0].days[0].reviewFlag,true);
  assert.equal(r.bookingsChanged,0);
});
test('Kings three/day reaches daily limit and Kings is not monthly limited',()=>{
  const r=project(fixture([
    thread(1,'Scheduled','Kings Convoy','2027-03-21T08:00:00Z'),
    thread(2,'Scheduled','Kings Convoy','2027-03-21T11:00:00Z'),
    thread(3,'Scheduled','Kings Convoy','2027-03-21T14:00:00Z')
  ]));
  assert.equal(r.months[0].days[0].kings,3);
  assert.equal(r.months[0].days[0].reviewFlag,false);
  assert.equal(r.months[0].days[0].partner,0);
  assert.equal(r.policy.dailyTotalMax,3);
  assert.equal(r.policy.kingsMonthlyMax,null);
});
test('Frozen legacy Event claims stay separate and do not increase center occupancy',()=>{
  const f=fixture();
  f.overview.registeredConvoys.push({
    source:'legacy-calendar',eventId:'older-1',
    threadId:'777777777777777799',status:'Scheduled',
    departureAtUtc:'2027-03-21T16:00:00Z'
  });
  f.overview.overall.legacyImportedConvoys=1;
  const r=project(f);
  assert.equal(r.months[0].sourceClaimedEvents,1);
  assert.equal(r.months[0].legacyClaimsKeptSeparate,1);
  assert.equal(r.currentAndLegacyClaimsNotAdditive,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Zero matching records are only an empty source month, never available slots',()=>{
  const r=project(fixture([]));
  assert.equal(r.centerClaimsInVisibleMonths,0);
  assert.ok(r.months.every(x=>x.sourceClaimedEvents===0));
  assert.equal(r.freeSlotsCertified,false);
  const txt=calendarLines(r);
  assert.match(txt,/NOT approved capacity/);
  assert.doesNotMatch(txt,/Free slots: 3/);
});
test('No usable UTC departure never invents a date or a free day',()=>{
  const f=fixture([thread(1,'Scheduled','Partner Convoy',null)]);
  const r=project(f);
  assert.equal(r.centerClaimsWithoutUsableUtcDate,1);
  assert.equal(r.centerClaimsInVisibleMonths,0);
  assert.match(calendarLines(r),/Current Center undated 1/);
});
test('Contradictory inventory and wrong scope fail safely before producing a calendar',()=>{
  const f=fixture();f.overview.registeredConvoys[0].eventId='wrong';
  assert.throws(()=>project(f));
  assert.throws(()=>project({...fixture(),report:{
    ...fixture().report,guildId:'999999999999999999'
  }}));
});
test('A stale source cannot silently become an apparently empty calendar',()=>{
  const f=fixture();
  f.overview.generatedAt='2027-03-20T10:00:00Z';
  assert.throws(()=>project(f));
});
test('Calendar preview is a real private message projection and contains no source identifiers',async()=>{
  const f=fixture([thread(1,'Scheduled','Partner Convoy','2027-03-21T16:00:00Z')]);
  const snapshot=project(f);
  const r=await publishGithubOnlyStatus({mode:'preview',sourceAvailable:true,
    nowMs:NOW,calendarSnapshot:snapshot});
  const out=r.content;
  assert.equal(r.state,'Preview');
  assert.match(out,/2027-03 \| source planned 1/);
  assert.match(out,/Current month days/);
  assert.match(out,/No free slots are confirmed/);
  assert.ok(out.length<=2000);
  for(const privateValue of [G,F,'777777777777777771','evt1',
    'synthetic only, do not display','<@everyone','DISCORD_BOT_TOKEN'])
    assert.equal(out.includes(privateValue),false);
});
test('Calendar preview rejects falsely certified free slots and unsafe content',()=>{
  const snapshot=project(fixture());
  for(const change of [
    {safeToActivate:true},{freeSlotsCertified:true},
    {realAvailableSlotsCertified:true},{bookingsChanged:1},
    {centerClaimsInVisibleMonths:99999},
    {months:[{...snapshot.months[0],claimedScheduled:999},
      ...snapshot.months.slice(1)]}
  ])assert.throws(()=>messageFor({sourceAvailable:true,nowMs:NOW,
    calendarSnapshot:{...snapshot,...change}}));
  assert.throws(()=>messageFor({
    sourceAvailable:false,nowMs:NOW,calendarSnapshot:snapshot
  }));
});
test('This producer is read-only and not imported by the existing live Checker',()=>{
  const root=path.join(__dirname,'..');
  const code=fs.readFileSync(path.join(root,
    'event-capacity-live-calendar-summary.js'),'utf8');
  const checker=fs.readFileSync(path.join(root,'convoy-checker.js'),'utf8');
  assert.equal(checker.includes('event-capacity-live-calendar-summary'),false);
  assert.doesNotMatch(code,/fetch\(|process\.env|DISCORD_BOT_TOKEN|\.writeFileSync\(/);
  assert.equal(project(fixture()).liveDiscordCallsMade,0);
});

test('Actual-history-shaped backlog of 114 undated legacy rows is visible, never free',()=>{
  const f=fixture([thread(1)]);
  const historical=Array.from({length:114},(_,i)=>({
    source:'legacy-calendar',eventId:'historical-example-'+i,
    sourceThreadId:'66666666666666'+String(i).padStart(4,'0'),
    status:'Legacy Past',departureAtUtc:null
  }));
  f.overview.registeredConvoys.push(...historical);
  f.overview.overall.legacyImportedConvoys=115;
  f.overview.overall.legacyDuplicatesSuppressed=1;
  const r=project(f);
  assert.equal(r.legacyClaimsTotal,114);
  assert.equal(r.legacyClaimsWithoutUsableUtcDate,114);
  assert.equal(r.legacyClaimsOutsideWindow,0);
  assert.equal(r.legacyClaimsInVisibleMonths,0);
  assert.equal(r.centerClaimsInVisibleMonths,1);
  assert.equal(r.months[0].sourceClaimedEvents,1);
  assert.equal(r.months[0].legacyClaimsKeptSeparate,0);
  assert.equal(r.freeSlotsCertified,false);
  const summary=calendarLines(r);
  assert.match(summary,/Legacy history separately: 114 claims, 114 without UTC departure/);
  assert.match(summary,/No legacy claims treated as free slots/);
  assert.ok(!summary.includes('historical-example-'));
  assert.ok(summary.length<2000);
});
test('Legacy dates inside and outside 12-month calendar reconcile exactly',()=>{
  const f=fixture([thread(1)]);
  f.overview.registeredConvoys.push(
    {source:'legacy-calendar',eventId:'legacy-inside',
      sourceThreadId:'666666666666660001',
      status:'Scheduled',departureAtUtc:'2027-03-22T15:00:00Z'},
    {source:'legacy-calendar',eventId:'legacy-outside',
      sourceThreadId:'666666666666660002',
      status:'Legacy Past',departureAtUtc:'2026-12-01T15:00:00Z'},
    {source:'legacy-calendar',eventId:'legacy-unknown',
      sourceThreadId:'666666666666660003',
      status:'Legacy Past',departureAtUtc:null}
  );
  f.overview.overall.legacyImportedConvoys=3;
  const r=project(f);
  assert.equal(r.legacyClaimsTotal,3);
  assert.equal(r.legacyClaimsWithoutUsableUtcDate,1);
  assert.equal(r.legacyClaimsOutsideWindow,1);
  assert.equal(r.legacyClaimsInVisibleMonths,1);
  assert.equal(r.months[0].legacyClaimsKeptSeparate,1);
  assert.equal(r.months[0].sourceClaimedEvents,1);
  assert.equal(r.freeSlotsCertified,false);
});
test('A forged omission of undated historical claims is rejected before private display',()=>{
  const r=project(fixture());
  for(const forged of [
    {...r,legacyClaimsTotal:1},
    {...r,legacyClaimsWithoutUsableUtcDate:1},
    {...r,legacyClaimsInVisibleMonths:1},
    {...r,legacyClaimsOutsideWindow:1}
  ])assert.throws(()=>calendarLines(forged));
});

test('Four Kings source claims on Sunday exceed the global daily maximum of 3',()=>{
  const r=project(fixture([
    thread(1,'Scheduled','Kings Convoy','2027-03-28T06:00:00Z'),
    thread(2,'Scheduled','Kings Convoy','2027-03-28T09:00:00Z'),
    thread(3,'Scheduled','Kings Convoy','2027-03-28T12:00:00Z'),
    thread(4,'Scheduled','Kings Convoy','2027-03-28T15:00:00Z')
  ]));
  assert.equal(r.months[0].kings,4);
  assert.equal(r.months[0].days[0].dailyLimitExceeded,true);
  assert.equal(r.months[0].days[0].reviewFlag,true);
  assert.equal(r.months[0].priorityConflictDays,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Twenty-one Partner monthly source claims need review, External count independent',()=>{
  const records=Array.from({length:21},(_,i)=>
    thread(i+1,'Scheduled','Partner Convoy',
      '2027-03-'+String(i+1).padStart(2,'0')+'T16:00:00Z'));
  const r=project(fixture(records));
  assert.equal(r.months[0].partner,21);
  assert.equal(r.months[0].external,0);
  assert.equal(r.months[0].partnerMonthlyOverLimit,true);
  assert.equal(r.months[0].externalMonthlyOverLimit,false);
  assert.match(calendarLines(r),/P21\/20 !/);
});
test('Source calendar repeats priority only for unconfirmed review, never booking',()=>{
  const r=project(fixture());
  const lines=calendarLines(r);
  assert.match(lines,/max 3 total\/day/);
  assert.match(lines,/Partner 20\/month/);
  assert.match(lines,/Kings first, Partner second, External third/);
  assert.equal(r.policy.weeklyMax,null);
  assert.equal(r.bookingsChanged,0);
});
