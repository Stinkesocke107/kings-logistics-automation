'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarizeOperations,compactLeadershipSection,appendPrivateLeadershipReview}=require('../event-history-leadership-bridge');
const G='1114967437788577792',F='1550619824005062697';
const NOW=Date.parse('2027-03-20T12:00:00Z');
function fixture(){
  const future={
    eventId:'synthetic-event-1',threadId:'777777777777777777',
    name:'Confidential Future Event',status:'Scheduled',
    ignored:false,testThread:false,
    validation:{parsed:{eventType:'Partner Convoy',departureAtUtc:'2027-03-24T18:00:00Z'}}
  };
  const past={
    eventId:'synthetic-event-2',threadId:'777777777777777778',
    name:'Confidential Past Event',status:'Completed',
    ignored:false,testThread:false,
    validation:{parsed:{eventType:'Kings Convoy',departureAtUtc:'2026-09-18T18:00:00Z'}}
  };
  const report={guildId:G,forumId:F,mode:'READ_ONLY',generatedAt:'2027-03-20T11:50:00Z',
    finalization:{finalizedAt:'2027-03-20T11:55:00Z'},
    summary:{totalThreads:2,actualConvoys:2},
    threads:[future,past]};
  const legacy={source:'legacy-calendar',threadId:'888888888888888888',
    eventId:'legacy-only-1',status:'Legacy Past',
    departureAtUtc:'2026-11-20T18:00:00Z'};
  const overview={guildId:G,forumId:F,generatedAt:'2027-03-20T11:56:00Z',
    overall:{realConvoySubmissions:2,convoyReadErrors:0,
      legacyImportedConvoys:1,legacyDuplicatesSuppressed:0},
    registeredConvoys:[future,past].map(x=>({
      source:'convoy-center',threadId:x.threadId,eventId:x.eventId,
      status:x.status,departureAtUtc:x.validation.parsed.departureAtUtc
    })).concat(legacy)};
  return {report,overview};
}
test('Event History and Calendar bridge reconciles existing Center and frozen Legacy separately',()=>{
  const f=fixture();
  const result=summarizeOperations({...f,nowMs:NOW});
  assert.equal(result.utcHistoryWindowMonths,24);
  assert.equal(result.history.length,24);
  assert.equal(result.futureWindowMonths,12);
  assert.equal(result.datedCenterClaims,1,'Future scheduled March Convoy must remain in forward Calendar, not History');
  assert.equal(result.datedFrozenLegacyClaims,1);
  assert.equal(result.historyMonthsWithSourceClaims,2);
  assert.equal(result.historyMonthsWithoutSourceClaims,22);
  assert.equal(result.undatedHistoricalSourceClaims,0);
  assert.equal(result.historySourceReadErrors,0);
  assert.equal(result.outsideHistoryWindowClaims,1,'Future Event excluded from historic source count');
  assert.equal(result.history.find(x=>x.utcMonth==='2026-09').completedClaims,1);
  assert.equal(result.history.find(x=>x.utcMonth==='2026-11').legacyClaims,1);
  assert.equal(result.unclassifiedFutureCenterClaims,0);
  assert.equal(result.original24MonthArchiveVerified,false);
  assert.equal(result.individualHistoricalDecisionsVerified,false);
  assert.equal(result.eventInvitationSourceLinked,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.bookingsCreated,0);
  const text=JSON.stringify(result);
  for(const secret of [G,F,'777777777777777777','Confidential',
    'legacy-only-1','synthetic-event-1','2027-03-24T18:00:00Z'])
    assert.ok(!text.includes(secret),'Private event detail must not escape history summary');
});
test('Past cancelled source claims are not silently interpreted as available capacity',()=>{
  const f=fixture();
  f.report.threads[1].status='Cancelled';
  f.overview.registeredConvoys[1].status='Cancelled';
  const result=summarizeOperations({...f,nowMs:NOW});
  assert.equal(result.history.find(x=>x.utcMonth==='2026-09').cancelledClaims,1);
  assert.equal(result.freeSlotsCertified,false);
});
test('Undated historical claims become review gaps rather than invented dated events',()=>{
  const f=fixture();
  f.report.threads[1].validation.parsed.departureAtUtc=null;
  f.overview.registeredConvoys[1].departureAtUtc=null;
  const result=summarizeOperations({...f,nowMs:NOW});
  assert.equal(result.datedCenterClaims,0);
  assert.equal(result.datedFrozenLegacyClaims,1);
  assert.equal(result.undatedCenterClaims,1);
  assert.equal(result.undatedHistoricalSourceClaims,1);
  assert.equal(result.historyMonthsWithSourceClaims,1);
  assert.equal(result.historyMonthsWithoutSourceClaims,23);
  assert.equal(result.original24MonthArchiveVerified,false);
  assert.equal(result.freeSlotsCertified,false);
  const message=compactLeadershipSection(f.report,f.overview,NOW);
  assert.match(message,/months with claims \\*\\*1\\/24\\*\\*/);
  assert.match(message,/undated \\*\\*1\\*\\*/);
  assert.doesNotMatch(message,/Confidential|777777777777777778/);
});
test('Mismatched snapshots and old/wrong guild are rejected without public details',()=>{
  for(const mutate of [
    x=>{x.overview.guildId='invalid';},
    x=>{x.overview.registeredConvoys[0].eventId='wrong';},
    x=>{x.report.generatedAt='2027-03-01T12:00:00Z';},
    x=>{x.report.threads[1].status='Cancelled';},
    x=>{x.report.mode='DISCORD_MESSAGE_AND_TAG_WRITE';},
    x=>{x.overview.overall.legacyImportedConvoys=99;}
  ]){
    const f=fixture();mutate(f);
    assert.throws(()=>summarizeOperations({...f,nowMs:NOW}));
    const safe=compactLeadershipSection(f.report,f.overview,NOW);
    assert.match(safe,/Source unverified/);
    assert.doesNotMatch(safe,/Confidential|wrong|777777777777777777/);
  }
});
test('Leadership report receives compact read-only summary and keeps existing Discord size limit',()=>{
  const f=fixture(),original='👑 **Kings Event Leadership — Daily Changes**\nExisting operations';
  const out=appendPrivateLeadershipReview(original,f.report,f.overview,NOW);
  assert.match(out,/12-month Calendar review/);
  assert.match(out,/24-month Event History/);
  assert.match(out,/months with claims \\*\\*2\\/24\\*\\*/);
  assert.match(out,/months without source claims \\*\\*22\\*\\*/);
  assert.match(out,/undated \\*\\*0\\*\\*/);
  assert.match(out,/Source inventory only/);
  assert.match(out,/full historical coverage \*\*not verified\*\*/);
  assert.match(out,/No available slots certified/);
  assert.ok(out.length<=1900);
  assert.doesNotMatch(out,/Confidential|synthetic-event|777777777777777777/);
  const big=original+'x'.repeat(1860);
  assert.equal(appendPrivateLeadershipReview(big,f.report,f.overview,NOW),big);
  const fallback=appendPrivateLeadershipReview(original,{}, {},NOW);
  assert.match(fallback,/Source unverified/);
});
test('daily weekly monthly existing Event Leadership messages all include safe Calendar/History bridge',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const src=fs.readFileSync(path.join(__dirname,'..','event-leadership-reports.js'),'utf8');
  for(const name of ['buildDailyMessage','buildWeeklyMessage','buildMonthlyMessage']){
    assert.match(src,new RegExp('appendPrivateLeadershipReview\\(\\s*'+name+'\\('));
  }
  assert.doesNotMatch(src,/console\.log\(.*compactLeadershipSection/);
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.match(workflow,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(workflow,/CONVOY_FINALIZE_WRITE_MODE: 'false'/);
});
