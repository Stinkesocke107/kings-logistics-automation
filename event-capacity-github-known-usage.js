'use strict';
// PRIVATE, READ-ONLY known-usage projection for the existing GitHub-only bot.
// This is NOT an availability-certification service. Incomplete historical
// acceptance/cancellation/reschedule coverage means no "free" claim is made.
// No Discord writes, event mutations, or long-running bot host.
const {createAuthenticatedKingsSource}
  =require('./event-capacity-github-authenticated-source');
const {checkedReport}
  =require('./event-capacity-github-decision-evidence');
const {validateLedger,privateDecisions}
  =require('./event-capacity-decision-ledger');
const {adaptConvoyReports}=require('./event-capacity-adapter');
const {evaluate,LIMITS,dayAvailability}
  =require('./event-capacity-core');
const {dateValid}=require('./event-capacity-day-view');
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity private known-usage projection unavailable.';
const GUILD='1114967437788577792';
const FORUM='1550619824005062697';
const HEX64=/^[a-f0-9]{64}$/;
const HEX40=/^[a-f0-9]{40}$/;
const ID=/^[1-9]\d{5,19}$/;
function fail(){throw new Error(ERROR);}
function scopeOf(scope){
  if(!scope||scope.guildId!==GUILD||scope.forumId!==FORUM)fail();
  return {guildId:GUILD,forumId:FORUM};
}
function sourceFingerprint(s,nowMs){
  if(!s||s.sourceKind!=='authenticated-kings-convoy-checker'||
    !ID.test(String(s.runId||''))||
    !Number.isSafeInteger(s.attempt)||s.attempt<1||s.attempt>100||
    !ID.test(String(s.artifactId||''))||
    !HEX40.test(String(s.headSha||''))||
    !HEX64.test(String(s.archiveDigest||'')))fail();
  checkedReport(s.report,s.overview,nowMs);
  if(s.report.guildId!==GUILD||s.report.forumId!==FORUM||
    s.overview.guildId!==GUILD||s.overview.forumId!==FORUM)fail();
  return [String(s.runId),s.attempt,String(s.artifactId),s.headSha,s.archiveDigest];
}
function monthAt(nowMs,offset){
  const d=new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(),
    d.getUTCMonth()+offset,1)).toISOString().slice(0,7);
}
function validMonth(m){
  if(typeof m!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(m))fail();
  return m;
}
function knownUsageFromVerifiedInputs({
  source,ledger,scope,nowMs,selectedMonth
}={}){
  const checked=scopeOf(scope);
  if(!Number.isFinite(nowMs))fail();
  sourceFingerprint(source,nowMs);
  validateLedger(ledger,checked);
  const month=selectedMonth===undefined?
    monthAt(nowMs,0):validMonth(selectedMonth);
  // The source is verified by the authenticated factory upstream; this
  // pure helper is not its own security boundary. Its calculated minimum
  // usage is meaningful only with the owner-pinned ledger and source.
  const adapter=adaptConvoyReports(source.report,source.overview,{
    nowMs,expectedGuildId:GUILD,expectedForumId:FORUM,
    trustedSource:true,classifications:privateDecisions(ledger)
  });
  // Deliberately false: complete historic acceptance and every staff
  // cancellation/reschedule are NOT yet independently reconciled.
  // This prevents core dayAvailability() from claiming free capacity.
  const capacity=evaluate(adapter.events,{dataFresh:false});
  const days=[];
  const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const total=new Date(Date.UTC(year,m,0)).getUTCDate();
  for(let d=1;d<=total;d++){
    const day=month+'-'+String(d).padStart(2,'0');
    if(!dateValid(day))fail();
    const current=dayAvailability(capacity,day);
    days.push(Object.freeze({
      day,knownPartnerAccepted:current.daily.partner||0,
      knownExternalAccepted:current.daily.external||0,
      knownKingsAccepted:current.daily.kings||0,
      knownCombinedAccepted:current.daily.combined||0,
      dailyLimit:LIMITS.combinedDaily,
      approvedExceptions:current.daily.approvedExceptions||0,
      limitReachedByKnownEvents:current.daily.combined>=LIMITS.combinedDaily,
      knownOverLimit:current.daily.combined>LIMITS.combinedDaily,
      remainingVerified:null,partnerFreeVerified:false,
      externalFreeVerified:false,freeSlotsCertified:false
    }));
  }
  const mcounts=capacity.months[month]||{
    partner:0,external:0,kings:0,approvedExceptions:0
  };
  const issues=adapter.issues.length+capacity.issues.length;
  const unplaced=capacity.issues.filter(x=>x.day===null).length;
  const warnings=capacity.warnings;
  return Object.freeze({
    version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    mode:'KnownAcceptedMinimum',
    month,sourceValidated:true,ledgerValidated:true,
    // A pinned ledger and fresh report still do not prove historical
    // acceptance coverage. Counting known events is not a free-slot grant.
    historicalReconciliationVerified:false,
    sourceInventoryComplete:adapter.dataFresh===true,
    freeSlotsCertified:false,attendanceInferred:false,
    capacityVerified:false,availabilityStatus:'Needs Verification',
    limits:{
      combinedDaily:LIMITS.combinedDaily,
      partnerMonthly:LIMITS.partnerMonthly,
      externalMonthly:LIMITS.externalMonthly,
      departureGapMinutes:LIMITS.departureGapMinutes
    },
    monthUsage:{
      knownPartnerAccepted:mcounts.partner||0,
      knownExternalAccepted:mcounts.external||0,
      knownKingsAccepted:mcounts.kings||0,
      partnerMonthlyLimitReached:(mcounts.partner||0)>=LIMITS.partnerMonthly,
      externalMonthlyLimitReached:(mcounts.external||0)>=LIMITS.externalMonthly,
      approvedExceptions:mcounts.approvedExceptions||0,
      partnerRemainingVerified:null,externalRemainingVerified:null
    },
    counts:{
      knownAccepted:capacity.counted,
      pending:capacity.pending.length,
      unresolvedAdapterIssues:adapter.issues.length,
      unresolvedCapacityIssues:capacity.issues.length,
      undatedUncertainRecords:unplaced,
      legacyUnreconciled:adapter.counts.legacy,
      totalUnresolvedIssues:issues,
      overLimitWarnings:warnings.filter(w=>/over-limit/.test(w.code)).length,
      departureGapAdvisories:warnings.filter(w=>
        w.code==='departure-under-two-hours').length,
      timingOverlaps:warnings.filter(w=>
        w.code==='meeting-end-overlap').length
    },
    days
  });
}
function createGithubOnlyKnownUsageReader({
  githubToken,githubTransport=fetch,ownerPinnedVault,scope,
  nowMs=()=>Date.now()
}={}){
  const checked=scopeOf(scope);
  if(!ownerPinnedVault||typeof ownerPinnedVault.read!=='function'||
    typeof nowMs!=='function')fail();
  let readSource;
  try{readSource=createAuthenticatedKingsSource({
    githubToken,transport:githubTransport,nowMs
  });}catch{fail();}
  return async function readKnownUsage({selectedMonth}={}){
    try{
      const now=nowMs();
      if(!Number.isFinite(now))fail();
      // Read twice around the protected projection; both reads must
      // confirm the same current GitHub report and owner-pinned ledger.
      const before=await ownerPinnedVault.read();
      const first=await readSource();
      const finger=sourceFingerprint(first,now);
      if(!before||!before.ledger||!before.checkpoint||
        before.checkpoint.revision!==before.ledger.revision)fail();
      const result=knownUsageFromVerifiedInputs({
        source:first,ledger:before.ledger,scope:checked,
        nowMs:now,selectedMonth
      });
      const second=await readSource();
      const after=await ownerPinnedVault.read();
      if(!isDeepStrictEqual(finger,sourceFingerprint(second,now))||
        !isDeepStrictEqual(first.report,second.report)||
        !isDeepStrictEqual(first.overview,second.overview)||
        !isDeepStrictEqual(before.checkpoint,after?.checkpoint)||
        !isDeepStrictEqual(before.ledger,after?.ledger))fail();
      return result;
    }catch{fail();}
  };
}
module.exports={knownUsageFromVerifiedInputs,createGithubOnlyKnownUsageReader};
