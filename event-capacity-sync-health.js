'use strict';
// Private Event Capacity sync health policy. Pure state / private proposals;
// no Discord pings, scheduling, database persistence or optimistic "free" state.
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity protected sync health validation failed.';
const FAILURES=new Set(['Source Unavailable','Source Conflict',
  'Integrity Failure','Authorization Failure','Storage Failure','Unknown']);
const CRITICAL=new Set(['Integrity Failure','Authorization Failure','Storage Failure']);
const PRIVATE_TEAMS=Object.freeze(['Development','Event Management','CEO']);
function fail(){throw new Error(ERROR);}
function checkedTime(value){
  const ms=timestamp(value);
  if(ms===null)fail();
  return new Date(ms).toISOString();
}
function fresh(){
  return {version:1,revision:0,status:'Uninitialized',failures:0,
    incident:0,alertStage:null,lastSuccessfulSyncAt:null,
    lastAttemptAt:null,lastErrorType:null,history:[]};
}
function validate(s){
  if(!s||s.version!==1||!Number.isSafeInteger(s.revision)||s.revision<0||
    !['Uninitialized','Healthy','Data Outdated'].includes(s.status)||
    !Number.isSafeInteger(s.failures)||s.failures<0||
    !Number.isSafeInteger(s.incident)||s.incident<0||
    ![null,'Escalated','Critical'].includes(s.alertStage)||
    !Array.isArray(s.history)||s.history.length!==s.revision||
    (s.lastSuccessfulSyncAt!==null&&timestamp(s.lastSuccessfulSyncAt)===null)||
    (s.lastAttemptAt!==null&&timestamp(s.lastAttemptAt)===null)||
    (s.lastErrorType!==null&&!FAILURES.has(s.lastErrorType)))fail();
  return s;
}
function apply(input,observation){
  validate(input);
  if(!observation||typeof observation!=='object'||Array.isArray(observation)||
    !Number.isSafeInteger(observation.expectedRevision)||
    observation.expectedRevision!==input.revision)fail();
  const time=checkedTime(observation.at);
  if(input.lastAttemptAt&&timestamp(time)<timestamp(input.lastAttemptAt))fail();
  const s=structuredClone(input),notices=[];
  const wasOutdated=s.status==='Data Outdated';
  if(observation.result==='Success'){
    if(observation.sourceVerified!==true||
      observation.reconciled!==true||observation.anchorVerified!==true||
      !['Imported','NoChange'].includes(observation.mode))fail();
    s.status='Healthy';s.lastSuccessfulSyncAt=time;
    s.failures=0;s.lastErrorType=null;s.alertStage=null;
    if(wasOutdated)notices.push({
      key:'sync:'+s.incident+':recovery',kind:'sync-recovered',
      targets:PRIVATE_TEAMS.slice(),privateOnly:true
    });
  }else if(observation.result==='Failure'){
    if(!FAILURES.has(observation.errorType))fail();
    if(!wasOutdated)s.incident++;
    s.status='Data Outdated';s.failures++;
    s.lastErrorType=observation.errorType;
    if(CRITICAL.has(observation.errorType)&&s.alertStage!=='Critical'){
      s.alertStage='Critical';
      notices.push({key:'sync:'+s.incident+':critical',kind:'sync-critical',
        targets:PRIVATE_TEAMS.slice(),privateOnly:true});
    }else if(s.failures>=2&&s.alertStage===null){
      s.alertStage='Escalated';
      notices.push({key:'sync:'+s.incident+':escalation',
        kind:'sync-multiple-failures',
        targets:PRIVATE_TEAMS.slice(),privateOnly:true});
    }
  }else fail();
  s.revision++;s.lastAttemptAt=time;
  s.history.push({revision:s.revision,at:time,result:observation.result,
    errorType:observation.result==='Failure'?observation.errorType:null,
    incident:s.incident});
  validate(s);
  return {state:s,noticeProposals:notices,
    // Never claim quotas available during source outage or before
    // independent freshness + current Convoy source proofs.
    canShowVerifiedAvailability:s.status==='Healthy'};
}
module.exports={fresh,validate,apply};
