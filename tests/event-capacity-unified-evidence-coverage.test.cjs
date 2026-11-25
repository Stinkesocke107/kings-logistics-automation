'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {fixture:outbound,invite,h}
  =require('./fixtures/outbound-center-scenario.cjs');
const {fixture:pagination,page}
  =require('./fixtures/event-capacity-discord-pagination-fixture.cjs');
const {REQUIRED}=require('../event-capacity-historical-24month-readiness');
const {projectKingsUnifiedEvidenceCoverage:review,
  renderKingsUnifiedEvidenceCoveragePreview:render}
  =require('../event-capacity-unified-evidence-coverage');
const monthClaim=(month,changes={})=>({month,
  ...Object.fromEntries(REQUIRED.map(k=>[k,true])),
  unresolvedReviewItems:0,...changes});
function data(){
  const sourceIntake=outbound(),paginationInput=pagination();
  paginationInput.nowMs=sourceIntake.nowMs;
  sourceIntake.channelInventory[1].firstCoveredMonth='2026-10';
  sourceIntake.channelInventory[1].lastCoveredMonth='2026-10';
  return {
    eventTeamInput:{sourceIntake,capacity:evaluate([],{dataFresh:false}),
      year:'2026',selectedMonth:'2026-11',
      historicalHoldsReports:[],historicalEvidenceReport:null},
    paginationInput,monthlyClaims:[]
  };
}
function audit(change){const x=data();change?.(x);return review(x);}
test('Old channel source list, tracker and 24-month scan assemble with strict no-live guarantees',()=>{
  const r=audit();
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.eventTeamYear,'2026');
  assert.equal(r.historyMonths.length,24);
  assert.equal(r.counters.centerClaimedEvents,1);
  assert.equal(r.counters.legacyClaimedEvents,1);
  assert.equal(r.counters.outboundInvitationClaims,1);
  assert.equal(r.counters.missingPaginationInventoriesForCenterSources,0);
  assert.equal(r.counters.paginationChannelsNotInCenterInventory,0);
  assert.equal(r.counters.conflictingDeclaredChannelCoverage,0);
  assert.equal(r.sourceInventoryClaimsAgree,true);
  assert.equal(r.original24MonthDiscordHistoryIndependentlyVerified,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Missing archived stream is visible in the combined Event-Team 24-month overview',()=>{
  const r=audit(x=>{
    x.paginationInput.scans=x.paginationInput.scans.filter(
      s=>s.stream!=='archived-public');
  });
  assert.equal(r.historyPageReceiptChecks.missingStreams,1);
  assert.equal(r.counters.historyMonthsWithIncompleteScanClaims,24);
  assert.match(r.status,/ARCHIVE PAGINATION INCOMPLETE/);
  assert.equal(r.eventBookingCapacityCertified,false);
});
test('Staff claimed every check complete but the original archived stream is still missing',()=>{
  const r=audit(x=>{
    x.monthlyClaims=[monthClaim('2026-10')];
    x.paginationInput.scans=x.paginationInput.scans.filter(
      s=>s.stream!=='archived-public');
  });
  assert.equal(r.counters.historyMonthsWithClaimedCompleteChecksButMissingSource,1);
  assert.equal(r.historyMonths.find(m=>m.month==='2026-10').monthHistoricalCoverageCertified,false);
});
test('Archive source channel not in current Center inventory produces source list mismatch',()=>{
  const r=audit(x=>{
    x.eventTeamInput.sourceIntake.channelInventory=[
      x.eventTeamInput.sourceIntake.channelInventory[0]];
    x.eventTeamInput.sourceIntake.convoyRecords=[
      x.eventTeamInput.sourceIntake.convoyRecords[0]];
  });
  assert.equal(r.counters.paginationChannelsNotInCenterInventory,1);
  assert.equal(r.sourceInventoryClaimsAgree,false);
  assert.match(r.status,/SOURCE INVENTORIES DISAGREE/);
});
test('Center source channel missing from pagination receipt inventory produces mismatch',()=>{
  const r=audit(x=>{
    x.paginationInput.channels=[x.paginationInput.channels[0]];
    x.paginationInput.scans=x.paginationInput.scans.filter(
      s=>s.channelId===x.paginationInput.channels[0].channelId);
  });
  assert.equal(r.counters.missingPaginationInventoriesForCenterSources,1);
  assert.equal(r.sourceInventoryClaimsAgree,false);
  assert.equal(r.actualDiscordReadsOrWritesHere,0);
});
test('Same channel declared with two different historical month ranges is review conflict',()=>{
  const r=audit(x=>{
    x.eventTeamInput.sourceIntake.channelInventory[1].firstCoveredMonth='2026-09';
  });
  assert.equal(r.counters.conflictingDeclaredChannelCoverage,1);
  assert.equal(r.sourceInventoryClaimsAgree,false);
});
test('Current Convoy Center channel classified as legacy source is rejected by list agreement',()=>{
  const x=data();
  x.paginationInput.channels[0].channelKind='legacy-forum';
  assert.throws(()=>review(x));
});
test('Mismatched guild, source review date or 24-month period aborts source composition',()=>{
  assert.throws(()=>audit(x=>{x.paginationInput.guildId='990000000000000099';}));
  assert.throws(()=>audit(x=>{x.paginationInput.nowMs+=1;}));
  assert.throws(()=>audit(x=>{x.paginationInput.firstMonth='2025-01';}));
  assert.throws(()=>audit(x=>{x.eventTeamInput.sourceIntake.finalMonth='2026-10';}));
});
test('Wrong tracker date still appears while pagination list otherwise agrees',()=>{
  const r=audit(x=>{
    x.eventTeamInput.sourceIntake.tracker.records[0].departureAtUtc=
      '2026-11-21T18:00:00.000Z';
  });
  assert.equal(r.counters.outgoingOldOrWrongDates,1);
  assert.equal(r.sourceInventoryClaimsAgree,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Multiple invitations to one Event do not affect number of archived channel source claims',()=>{
  const r=audit(x=>{
    x.eventTeamInput.sourceIntake.tracker.records.push(invite({
      invitationId:'inv2',status:'Sent',sourceDigest:h('new invited VTC')
    }));
  });
  assert.equal(r.counters.outboundInvitationClaims,2);
  assert.equal(r.counters.centerClaimedEvents,1);
  assert.equal(r.counters.legacyClaimedEvents,1);
  assert.equal(r.humanApprovalCommitted,0);
});
test('Private 24-month Discord preview is ephemeral with safe output length and no source identifiers',()=>{
  const r=audit(),reply=render(r),text=JSON.stringify(reply);
  assert.equal(reply.type,4);
  assert.equal(reply.data.flags,64);
  assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  assert.equal(reply.data.embeds.length,1);
  assert.equal(reply.data.embeds[0].description.split('\n').length,25);
  assert.equal(reply.data.embeds[0].color,0x182DFF);
  for(const raw of ['990000000000000000','990000000000000001',
    '990000000000000002','evt100','inv1','2026-11-24T15:00:00.000Z','PRIVATE KEY','@everyone'])
    assert.equal(text.includes(raw),false);
  assert.match(text,/No Discord data read/);
});
test('Renderer refuses fabricated availability and fake authenticated Event source',()=>{
  const r=audit();
  assert.throws(()=>render({...r,safeToActivate:true}));
  assert.throws(()=>render({...r,freeSlotsCertified:true}));
  assert.throws(()=>render({...r,actualDiscordReadsOrWritesHere:1}));
  assert.throws(()=>render({...r,historyMonths:[
    {...r.historyMonths[0],monthHistoricalCoverageCertified:true},
    ...r.historyMonths.slice(1)
  ]}));
});
test('Fully checkmarked human historical review does not produce a confirmed month',()=>{
  const r=audit(x=>{x.monthlyClaims=[monthClaim('2026-10')];});
  assert.equal(r.historyMonths.find(m=>m.month==='2026-10').humanChecklistSubmitted,true);
  assert.equal(r.historyMonths.find(m=>m.month==='2026-10').usableFreeSlots,null);
  assert.equal(r.original24MonthDiscordHistoryIndependentlyVerified,false);
});
test('Repeated audit is deterministic and leaves all supplied source payloads unmodified',()=>{
  const input=data(),before=structuredClone(input);
  assert.deepEqual(review(input),review(input));
  assert.deepEqual(input,before);
});
