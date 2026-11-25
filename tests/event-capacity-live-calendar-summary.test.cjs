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
test('Weekday and weekend planning caps distinguish 3 and 5, with per-type caps',()=>{
  const r=project(fixture([
    // Thursday: 4 source claims -> flagged (>3).
    thread(1,'Scheduled','Partner Convoy','2027-03-25T09:00:00Z'),
    thread(2,'Scheduled','External Convoy','2027-03-25T12:00:00Z'),
    thread(3,'Scheduled','External Convoy','2027-03-25T15:00:00Z'),
    thread(4,'Scheduled','Partner Convoy','2027-03-25T18:00:00Z'),
    // Saturday: 4 source claims -> <=5 and categories <=2.
    thread(5,'Scheduled','Partner Convoy','2027-03-27T09:00:00Z'),
    thread(6,'Scheduled','External Convoy','2027-03-27T12:00:00Z'),
    thread(7,'Scheduled','Partner Convoy','2027-03-27T15:00:00Z'),
    thread(8,'Scheduled','External Convoy','2027-03-27T18:00:00Z')
  ]));
  const th=r.months[0].days.find(x=>x.date==='2027-03-25');
  const sa=r.months[0].days.find(x=>x.date==='2027-03-27');
  assert.equal(th.reviewFlag,true);
  assert.equal(sa.reviewFlag,false);
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
test('Kings source claims do not consume partner/external per-day quota',()=>{
  const r=project(fixture([
    thread(1,'Scheduled','Kings Convoy','2027-03-21T08:00:00Z'),
    thread(2,'Scheduled','Kings Convoy','2027-03-21T11:00:00Z'),
    thread(3,'Scheduled','Kings Convoy','2027-03-21T14:00:00Z')
  ]));
  assert.equal(r.months[0].days[0].kings,3);
  assert.equal(r.months[0].days[0].reviewFlag,false);
  assert.equal(r.months[0].days[0].partner,0);
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
  assert.match(calendarLines(r),/Undated source claims 1/);
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
