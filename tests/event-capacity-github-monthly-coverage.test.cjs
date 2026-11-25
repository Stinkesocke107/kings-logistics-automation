'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {monthCoverageFromVerifiedInputs}
  =require('../event-capacity-github-monthly-coverage');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='synthetic-kings-month-coverage-task-secret-00001';
const AT=Date.parse('2027-03-20T12:00:00.000Z');
const RUN='45502949674';
const ARC='a'.repeat(64),HEAD='b'.repeat(40);
const ledger=()=>createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
function source(){
  return {
    sourceKind:'authenticated-kings-convoy-checker',
    runId:RUN,attempt:1,artifactId:'70000000001',
    headSha:HEAD,archiveDigest:ARC,
    report:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{
        eventId:'20270',threadId:'755555555555555555',
        status:'Scheduled',name:'Synthetic Historical Convoy',
        staffStatus:{status:'Scheduled',authorId:'synthetic-person',
          matchedRoleIds:['synthetic-role'],roleSource:'guild-member-lookup'},
        validation:{parsed:{
          eventType:'Partner Convoy',departureAtUtc:'2027-03-21T16:00:00Z'
        }}
      }]
    },
    overview:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{
        source:'convoy-center',eventId:'20270',
        threadId:'755555555555555555',status:'Scheduled',
        departureAtUtc:'2027-03-21T16:00:00Z'
      }]
    }
  };
}
function project(options={}){
  return monthCoverageFromVerifiedInputs({
    source:source(),ledger:ledger(),scope:SCOPE,
    taskSecret:SECRET,nowMs:AT,month:'2027-03',...options
  });
}
function observation(runId,finalizedAt,overrides={}){
  return {
    sourceKind:'authenticated-kings-convoy-checker',
    guildId:SCOPE.guildId,forumId:SCOPE.forumId,
    runId:String(runId),attempt:1,artifactId:String(BigInt(runId)+100n),
    headSha:HEAD,archiveDigest:ARC,finalizedAt,...overrides
  };
}
test('Current 15-minute snapshot leaves previous month intervals unverified, not free',()=>{
  const result=project();
  assert.equal(result.visibility,'PRIVATE_ONLY');
  assert.equal(result.readOnly,true);
  assert.equal(result.status,'Historical Coverage Incomplete');
  assert.equal(result.nominalCadenceMinutes,15);
  assert.equal(result.counts.elapsedReferenceIntervals,1872);
  assert.equal(result.counts.observedSnapshotIntervals,1);
  assert.equal(result.counts.missingReferenceIntervals,1871);
  assert.equal(result.counts.unresolvedEventReviewItems,4);
  assert.equal(result.counts.uniqueSourceRuns,1);
  assert.equal(result.days.length,31);
  assert.equal(result.days[0].elapsedReferenceIntervals,96);
  assert.equal(result.days[0].missingReferenceIntervals,96);
  assert.equal(result.days[19].elapsedReferenceIntervals,48);
  assert.equal(result.days[20].elapsedReferenceIntervals,0);
  assert.equal(result.days[19].observedSnapshotIntervals,1);
  assert.equal(result.days[19].status,'Historical Evidence Gap');
  assert.equal(result.retentionBackfillRequired,true);
  assert.equal(result.sourceAuthenticatedByGateway,false);
  assert.equal(result.ownerPinCheckedByGateway,false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.acceptedCountCertified,false);
  const exposed=JSON.stringify(result);
  for(const forbidden of [
    '20270','755555555555555555','synthetic-person','Synthetic Historical Convoy'
  ])assert.equal(exposed.includes(forbidden),false);
});
test('Duplicate same authenticated snapshot is one observed interval',()=>{
  const record=observation(RUN,'2027-03-20T11:56:00Z',{
    artifactId:'70000000001'
  });
  const p=project({candidateArchiveObservations:[record,record]});
  assert.equal(p.counts.uniqueSourceRuns,1);
  assert.equal(p.counts.observedSnapshotIntervals,1);
  assert.equal(p.counts.duplicateIdenticalObservations,2);
  assert.equal(p.freeSlotsCertified,false);
});
test('Same GitHub run with a changed ZIP digest must fail closed',()=>{
  const record=observation(RUN,'2027-03-20T11:56:00Z',{
    artifactId:'70000000001',archiveDigest:'c'.repeat(64)
  });
  assert.throws(()=>project({candidateArchiveObservations:[record]}));
});
test('An independently unverified full month of reference samples STILL cannot certify history or free slots',()=>{
  const observations=[];
  const start=Date.parse('2027-03-01T00:00:00Z');
  for(let i=0;i<1872;i++){
    observations.push(observation(
      String(60000000000n+BigInt(i)),
      new Date(start+i*15*60*1000+60000).toISOString()
    ));
  }
  const p=project({candidateArchiveObservations:observations});
  assert.equal(p.counts.elapsedReferenceIntervals,1872);
  assert.equal(p.counts.missingReferenceIntervals,0);
  assert.equal(p.counts.observedSnapshotIntervals,1872);
  assert.equal(p.days[0].status,'Needs Independent Verification');
  assert.equal(p.historicalArchiveIndependentlyVerified,false);
  assert.equal(p.snapshotContinuityIsNotAcceptanceCompleteness,true);
  assert.equal(p.historicalCoverageCertified,false);
  assert.equal(p.freeSlotsCertified,false);
  assert.ok(p.reviewBlockers.includes(
    'Candidate Archive Metadata Not Independently Certified'));
});
test('Month in the future never means confirmed 20 free Partner slots',()=>{
  const r=project({month:'2027-04'});
  assert.equal(r.counts.elapsedReferenceIntervals,0);
  assert.equal(r.counts.observedSnapshotIntervals,0);
  assert.equal(r.days.length,30);
  assert.equal(r.retentionBackfillRequired,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.days[0].status,'Future Or Not Yet Observed');
});
test('Valid leap-year February has 29 UTC days and never invents historical data',()=>{
  const r=project({month:'2028-02'});
  assert.equal(r.days.length,29);
  assert.equal(r.days[28].utcDate,'2028-02-29');
  assert.equal(r.counts.elapsedReferenceIntervals,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Malformed source, changed scope or forged archive observation fails closed',()=>{
  for(const opts of [
    {scope:{...SCOPE,forumId:'255555555555555555'}},
    {source:{...source(),archiveDigest:'not-a-sha'}},
    {source:{...source(),overview:{...source().overview,
      registeredConvoys:[]}}},
    {candidateArchiveObservations:[observation(
      '60000000005','2027-03-10T11:56:00Z',
      {guildId:'255555555555555555'})]},
    {candidateArchiveObservations:[observation(
      '60000000005','2027-03-10T11:56:00Z',
      {archiveDigest:'not-a-real-sha'})]},
    {candidateArchiveObservations:[observation(
      '60000000005','not-a-date')]},
    {candidateArchiveObservations:Array(10001).fill(null)},
    {month:'2027-13'}
  ])assert.throws(()=>project(opts));
});
test('Review tasks remain unresolved even if the source has only one known event',()=>{
  const r=project();
  assert.equal(r.counts.unresolvedEventReviewItems>0,true);
  assert.equal(r.counts.urgentEventReviewItems,0);
  assert.ok(r.reviewBlockers.includes('Open Human Event Review Items'));
  assert.ok(r.reviewBlockers.includes('Historical Artifact Retention Backfill Needed'));
});
