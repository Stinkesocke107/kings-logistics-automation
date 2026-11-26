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
  assert.equal(result.historyMonthsCenterOnly,1);
  assert.equal(result.historyMonthsLegacyOnly,1);
  assert.equal(result.historyMonthsBothSources,0);
  assert.equal(result.pastCenterOutcomeUnresolved,0);
  assert.ok(result.reviewAgenda.length>0&&result.reviewAgenda.length<=6);
  assert.ok(result.reviewAgenda.every(row=>
    ['code','count','utcMonth'].every(key=>Object.hasOwn(row,key))));
  assert.ok(result.reviewAgenda.some(row=>
    row.code==='LEGACY_ORIGINAL_EVIDENCE'&&row.utcMonth==='2026-11'));
  assert.equal(result.legacyClaimsNeedingOriginalEvidence,1);
  assert.equal(result.futureDatedLegacyHoldReview,0);
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
test('12-month source bridge returns independent Partner/External monthly violations and 2h warning days without private IDs',()=>{
  const f=fixture();
  for(let i=0;i<21;i++)for(let category=0;category<2;category++){
    const type=category?'External Convoy':'Partner Convoy';
    const id='7777777777777'+String(100+i*2+category).padStart(5,'0');
    const eventId='synthetic-private-cap-'+i+'-'+category;
    const departureAtUtc='2027-04-'+String(i+1).padStart(2,'0')+
      (category?'T13:00:00Z':'T12:00:00Z');
    f.report.threads.push({
      eventId,threadId:id,name:'CONFIDENTIAL CAPACITY EVENT',status:'Scheduled',
      ignored:false,testThread:false,
      validation:{parsed:{eventType:type,departureAtUtc}}
    });
    f.overview.registeredConvoys.push({
      source:'convoy-center',threadId:id,eventId,status:'Scheduled',departureAtUtc
    });
  }
  f.report.summary.totalThreads=f.report.threads.length;
  f.report.summary.actualConvoys=f.report.threads.length;
  f.overview.overall.realConvoySubmissions=f.report.threads.length;
  const review=summarizeOperations({...f,nowMs:NOW});
  assert.equal(review.partnerMonthsOverClaimedLimit,1);
  assert.equal(review.externalMonthsOverClaimedLimit,1);
  assert.equal(review.futureDaysWithShortDepartureGap,21);
  assert.equal(review.futureDaysRequiringStaffReview,21);
  assert.equal(review.futureDaysOverClaimedDailyLimit,0);
  assert.equal(review.freeSlotsCertified,false);
  assert.equal(review.bookingsCreated,0);
  assert.equal(review.original24MonthArchiveVerified,false);
  const safe=JSON.stringify(review);
  assert.ok(!safe.includes('CONFIDENTIAL CAPACITY EVENT'));
  assert.ok(!safe.includes('synthetic-private-cap-'));
  const section=compactLeadershipSection(f.report,f.overview,NOW);
  assert.match(section,/2h spacing review \*\*21\*\*/);
  assert.match(section,/Partner months >20 \*\*1\*\*/);
  assert.match(section,/External months >20 \*\*1\*\*/);
  assert.ok(!section.includes('CONFIDENTIAL'));
});
test('historical proof gaps separate past unresolved outcomes, source overlap, future Legacy holds and undated claims',()=>{
  const f=fixture();
  const past={
    eventId:'SECRET_PAST_UNRESOLVED',threadId:'777777777777777779',
    name:'SENSITIVE PAST CONVOY',status:'Scheduled',ignored:false,
    validation:{parsed:{eventType:'External Convoy',departureAtUtc:'2026-11-24T12:00:00Z'}}
  };
  f.report.threads.push(past);
  f.report.summary.totalThreads++;
  f.report.summary.actualConvoys++;
  f.overview.overall.realConvoySubmissions++;
  f.overview.registeredConvoys.push({
    source:'convoy-center',eventId:past.eventId,threadId:past.threadId,
    status:past.status,departureAtUtc:past.validation.parsed.departureAtUtc
  });
  f.overview.registeredConvoys.push({
    source:'legacy-calendar',eventId:'SECRET_FUTURE_HOLD',
    threadId:'888888888888888887',status:'Legacy Scheduled',
    departureAtUtc:'2027-04-22T18:00:00Z'
  });
  f.overview.registeredConvoys.push({
    source:'legacy-calendar',eventId:'SECRET_UNDATED_HOLD',
    threadId:'888888888888888886',status:'Legacy Unknown',
    departureAtUtc:null
  });
  f.overview.overall.legacyImportedConvoys=3;
  const x=summarizeOperations({...f,nowMs:NOW});
  assert.equal(x.historyMonthsCenterOnly,1);
  assert.equal(x.historyMonthsLegacyOnly,0);
  assert.equal(x.historyMonthsBothSources,1);
  assert.equal(x.historyMonthsWithSourceClaims,2);
  assert.equal(x.historyMonthsWithoutSourceClaims,22);
  assert.equal(x.datedCenterClaims,2);
  assert.equal(x.datedFrozenLegacyClaims,1);
  assert.equal(x.pastCenterOutcomeUnresolved,1);
  assert.ok(x.reviewAgenda.some(row=>row.code==='FUTURE_LEGACY_HOLD'&&
    row.utcMonth==='2027-04'&&row.count===1));
  assert.ok(x.reviewAgenda.some(row=>row.code==='PAST_CENTER_OUTCOME'&&
    row.utcMonth==='2026-11'&&row.count===1));
  assert.ok(x.reviewAgenda.some(row=>row.code==='UNDATED_LEGACY'&&row.count===1));
  assert.equal(x.legacyClaimsNeedingOriginalEvidence,3);
  assert.equal(x.futureDatedLegacyHoldReview,1);
  assert.equal(x.undatedLegacyClaims,1);
  assert.equal(x.individualHistoricalDecisionsVerified,false);
  assert.equal(x.original24MonthArchiveVerified,false);
  assert.equal(x.bookingsCreated,0);
  assert.equal(x.freeSlotsCertified,false);
  const summary=compactLeadershipSection(f.report,f.overview,NOW);
  assert.match(summary,/past Center outcome unclear \*\*1\*\*/);
  assert.match(summary,/frozen Legacy claims requiring original evidence \*\*3\*\*/);
  assert.match(summary,/future dated Legacy holds to review \*\*1\*\*/);
  for(const secret of ['SECRET_','SENSITIVE PAST','888888888888888887',
    '2027-04-22T18:00:00Z']) {
    assert.equal(JSON.stringify(x).includes(secret),false);
    assert.equal(summary.includes(secret),false);
  }
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
  assert.match(message,/months with claims \*\*1\/24\*\*/);
  assert.match(message,/undated \*\*1\*\*/);
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
  assert.match(out,/months with claims \*\*2\/24\*\*/);
  assert.match(out,/months without source claims \*\*22\*\*/);
  assert.match(out,/undated \*\*0\*\*/);
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
