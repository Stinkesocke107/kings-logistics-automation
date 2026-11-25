'use strict';
// PRIVATE read-only monthly evidence inventory, NEVER an availability grant.
// GitHub's nominal 15-minute cron is a reference cadence, NOT proof that an
// interval captured every acceptance/cancellation/deletion/reschedule.
// The current report and optional archive metadata cannot certify history.
const {isDeepStrictEqual}=require('node:util');
const {planHistoricalReview}
  =require('./event-capacity-github-historical-review');
const {createAuthenticatedKingsSource}
  =require('./event-capacity-github-authenticated-source');
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity monthly historical coverage not verifiable.';
const GUILD='1114967437788577792',FORUM='1550619824005062697';
const INTERVAL=15*60*1000,DAY=24*60*60*1000;
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const ID=/^[1-9]\d{5,19}$/;
function fail(){throw new Error(ERROR);}
function scopeOf(s){
  if(!s||s.guildId!==GUILD||s.forumId!==FORUM)fail();
  return {guildId:GUILD,forumId:FORUM};
}
function period(month){
  if(typeof month!=='string'||
    !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))fail();
  const start=Date.parse(month+'-01T00:00:00.000Z');
  if(!Number.isFinite(start))fail();
  const end=new Date(start);
  end.setUTCMonth(end.getUTCMonth()+1);
  return {month,start,end:end.valueOf()};
}
function observation(raw,scope){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    raw.guildId!==scope.guildId||raw.forumId!==scope.forumId||
    raw.sourceKind!=='authenticated-kings-convoy-checker'||
    !ID.test(String(raw.runId||''))||
    !Number.isSafeInteger(raw.attempt)||raw.attempt<1||
    raw.attempt>100||
    !ID.test(String(raw.artifactId||''))||
    !SHA40.test(String(raw.headSha||''))||
    !SHA64.test(String(raw.archiveDigest||'')))fail();
  const at=timestamp(raw.finalizedAt);
  if(at===null||at>Number.MAX_SAFE_INTEGER)fail();
  return {
    runId:String(raw.runId),attempt:raw.attempt,
    artifactId:String(raw.artifactId),headSha:raw.headSha,
    archiveDigest:raw.archiveDigest,at
  };
}
function observedFromSource(source){
  if(!source||!source.report||!source.overview)fail();
  return {
    sourceKind:source.sourceKind,
    guildId:source.report.guildId,forumId:source.report.forumId,
    runId:source.runId,attempt:source.attempt,
    artifactId:source.artifactId,headSha:source.headSha,
    archiveDigest:source.archiveDigest,
    finalizedAt:source.report.finalization?.finalizedAt
  };
}
function monthCoverageFromVerifiedInputs({
  month,nowMs,source,ledger,scope,taskSecret,
  // These metadata are NOT a cryptographic archive attestation. Only a
  // trusted future archive reader may supply production historical records.
  candidateArchiveObservations=[]
}={}){
  const sc=scopeOf(scope),p=period(month);
  if(!Number.isFinite(nowMs)||nowMs<0||nowMs>Number.MAX_SAFE_INTEGER||
    !Array.isArray(candidateArchiveObservations)||
    candidateArchiveObservations.length>10000)fail();
  const review=planHistoricalReview({
    source,ledger,scope:sc,taskSecret,nowMs,page:1
  });
  // All archive records are diagnostic only; no completeness or admission
  // certification is possible from metadata or 15m samples alone.
  const items=[observedFromSource(source),...candidateArchiveObservations];
  const distinctRuns=new Map();
  let duplicates=0;
  for(const raw of items){
    const o=observation(raw,sc),key=o.runId+':'+o.attempt;
    const existing=distinctRuns.get(key);
    if(existing){
      if(!isDeepStrictEqual(existing,o))fail();
      duplicates++;continue;
    }
    distinctRuns.set(key,o);
  }
  // Count fully elapsed 15m REFERENCE windows, not assumed execution.
  const cutoff=Math.max(p.start,Math.min(p.end,
    Math.floor(nowMs/INTERVAL)*INTERVAL));
  const days=[],slots=new Set();
  let observationsInsidePeriod=0,outsidePeriod=0;
  for(const o of distinctRuns.values()){
    if(o.at<p.start||o.at>=p.end||o.at>=cutoff){
      outsidePeriod++;continue;
    }
    observationsInsidePeriod++;
    const bucket=Math.floor((o.at-p.start)/INTERVAL);
    slots.add(bucket);
  }
  let missingTotal=0,observedTotal=0,theoreticalTotal=0;
  for(let d=p.start;d<p.end;d+=DAY){
    const end=Math.min(d+DAY,cutoff);
    const expected=end<=d?0:Math.floor((end-d)/INTERVAL);
    let observed=0;
    for(let i=0;i<expected;i++){
      if(slots.has(Math.floor((d-p.start)/INTERVAL)+i))observed++;
    }
    const missing=expected-observed;
    theoreticalTotal+=expected;
    observedTotal+=observed;
    missingTotal+=missing;
    days.push(Object.freeze({
      utcDate:new Date(d).toISOString().slice(0,10),
      elapsedReferenceIntervals:expected,
      observedSnapshotIntervals:observed,
      missingReferenceIntervals:missing,
      historicEvidenceComplete:false,
      availabilityCertified:false,
      status:expected===0?'Future Or Not Yet Observed':
        missing>0?'Historical Evidence Gap':'Needs Independent Verification'
    }));
  }
  const retentionDays=14; // existing convoy-checker.yml artifact retention
  const retentionBoundary=nowMs-retentionDays*DAY;
  const needsBackfill=p.start<Math.min(cutoff,retentionBoundary);
  const reasons=[
    'Current Snapshot Is Not Complete Event History',
    'Missing Independent Archived Event Lifecycle',
    'No Certified Monthly Inventory'
  ];
  if(missingTotal>0)reasons.push('Unobserved 15-Minute Reference Intervals');
  if(needsBackfill)reasons.push('Historical Artifact Retention Backfill Needed');
  if(review.counts.total>0)reasons.push('Open Human Event Review Items');
  if(candidateArchiveObservations.length>0)
    reasons.push('Candidate Archive Metadata Not Independently Certified');
  return Object.freeze({
    version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    month:p.month,asOf:new Date(nowMs).toISOString(),
    sourceStructureChecked:true,ownerLedgerStructureChecked:true,
    sourceAuthenticatedByGateway:false,ownerPinCheckedByGateway:false,
    nominalCadenceMinutes:15,
    // Explicitly never mistake successful scheduled polls for historical
    // lifecycle completeness, particularly if threads were deleted.
    snapshotContinuityIsNotAcceptanceCompleteness:true,
    historicalArchiveIndependentlyVerified:false,
    historicalCoverageCertified:false,freeSlotsCertified:false,
    acceptedCountCertified:false,
    status:'Historical Coverage Incomplete',
    counts:{
      elapsedReferenceIntervals:theoreticalTotal,
      observedSnapshotIntervals:observedTotal,
      missingReferenceIntervals:missingTotal,
      uniqueSourceRuns:distinctRuns.size,
      duplicateIdenticalObservations:duplicates,
      sourceRunsOutsideElapsedMonth:outsidePeriod,
      observationsInElapsedMonth:observationsInsidePeriod,
      unresolvedEventReviewItems:review.counts.total,
      urgentEventReviewItems:review.counts.urgent,
      legacyRecordsToReconcile:review.counts.legacy
    },
    retentionBackfillRequired:needsBackfill,
    reviewBlockers:reasons,
    days
  });
}
function createGithubOnlyMonthlyCoverageReader({
  githubToken,githubTransport=fetch,ownerPinnedVault,
  scope,taskSecret,nowMs=()=>Date.now()
}={}){
  const sc=scopeOf(scope);
  if(!ownerPinnedVault||typeof ownerPinnedVault.read!=='function'||
    typeof nowMs!=='function')fail();
  let readSource;
  try{readSource=createAuthenticatedKingsSource({
    githubToken,transport:githubTransport,nowMs
  });}catch{fail();}
  return async function readMonthlyCoverage({month}={}){
    try{
      const at=nowMs();
      if(!Number.isFinite(at))fail();
      const before=await ownerPinnedVault.read();
      const first=await readSource();
      if(!before?.ledger||!before?.checkpoint||
        before.checkpoint.revision!==before.ledger.revision)fail();
      const result=monthCoverageFromVerifiedInputs({
        month,nowMs:at,source:first,ledger:before.ledger,
        scope:sc,taskSecret
      });
      const second=await readSource();
      const after=await ownerPinnedVault.read();
      const sourceFields=s=>[s.runId,s.attempt,s.artifactId,
        s.headSha,s.archiveDigest];
      if(!isDeepStrictEqual(sourceFields(first),sourceFields(second))||
        !isDeepStrictEqual(first.report,second.report)||
        !isDeepStrictEqual(first.overview,second.overview)||
        !isDeepStrictEqual(before.ledger,after?.ledger)||
        !isDeepStrictEqual(before.checkpoint,after?.checkpoint))fail();
      return Object.freeze({...result,
        sourceAuthenticatedByGateway:true,ownerPinCheckedByGateway:true});
    }catch{fail();}
  };
}
module.exports={monthCoverageFromVerifiedInputs,
  createGithubOnlyMonthlyCoverageReader};
