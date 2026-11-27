'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'event-capacity-real-source-preview.js'),'utf8');
const PRIV='SYNTHETIC_PRIVATE_STAFF_VTC_EVENT_DO_NOT_LOG';
function simulate({readFails=false,badObservation=false,badReview=false,missingWorklist=false}={}){
  const logs=[],errors=[],proc={exitCode:0};
  const observation={
    sourceReconciled:true,readOnly:true,
    historyVerified:false,freeSlotsCertified:false,
    staffApprovalsVerified:false,bookingsCreated:0,
    futurePartnerMonthsOver30:1,futureExternalMonthsOver30:2,
    futureUnclassified:0,futureDaysOverDailyLimit:1,
    historyFutureLegacyHoldReview:0,
    futureDaysWithShortDepartureGap:3,futureDaysRequiringReview:4,
    name:PRIV
  };
  const source={report:PRIV,overview:PRIV};
  const module={exports:{}};
  vm.runInNewContext(script,{module,process:proc,
    console:{log:x=>logs.push(String(x)),error:x=>errors.push(String(x))},
    require:name=>{
      if(name==='./event-history-real-source-preview')return{
        read:name=>{if(readFails)throw Error(PRIV);
          return name.includes('overview')?source.overview:source.report;}
      };
      if(name==='./event-leadership-observation')return{
        buildEventObservation:()=>badObservation?{...observation,bookingsCreated:1}:observation,
        trustedEventObservation:(x)=>x
      };
      if(name==='./event-operations-staff-triage')return{
        observeOperations:()=>({
          eventSource:'RECONCILED',readOnly:true,
          calendarAvailabilityCertified:false,staffDecisionsVerified:false,
          bookingsCreated:0,review:{
            eventTypeUnclassified:0,
            calendarDaysNeedingReview:4,
            daysOverThreeSourceClaims:1,
            partnerMonthsOver30:badReview?99:1,
            externalMonthsOver30:2,
            daysWithShortDepartureGap:3,
            futureLegacyHoldReview:0
          }
        }),
        operationsWorklist:()=>[
          ['REVIEW_CALENDAR_DAYS',4],
          ['REVIEW_DAILY_CAP',1],
          ['REVIEW_PARTNER_MONTH_CAP',1],
          ['REVIEW_EXTERNAL_MONTH_CAP',2],
          ...(!missingWorklist?[['REVIEW_DEPARTURE_SPACING',3]]:[])
        ].map(([code,count])=>({code,count}))
      };
      throw Error('Unexpected private source read '+name);
    }
  });
  const result=module.exports.main();
  return {result,logs,errors,exitCode:proc.exitCode};
}
test('real Capacity live proof verifies source-only policies with fixed public safe success code',()=>{
  const r=simulate();
  assert.equal(r.result.status,'CAPACITY_READ_ONLY_SOURCE_RECONCILED');
  assert.equal(r.result.dailyLimit,3);
  assert.equal(r.result.partnerMonthlyLimit,30);
  assert.equal(r.result.externalMonthlyLimit,30);
  assert.equal(r.result.monthlyKingsUnlimited,true);
  assert.equal(r.result.separationMinutes,120);
  assert.equal(r.result.freeSlotsCertified,false);
  assert.equal(r.result.bookingsCreated,0);
  assert.equal(r.exitCode,0);
  assert.match(r.logs.join(' '),/CAPACITY_READ_ONLY_SOURCE_RECONCILED/);
  assert.doesNotMatch(r.logs.join(' '),new RegExp(PRIV));
  assert.deepEqual(r.errors,[]);
});
test('missing real source, bookings and mismatched Staff review all fail closed without private exception data',()=>{
  for(const opts of [{readFails:true},{badObservation:true},{badReview:true},{missingWorklist:true}]){
    const r=simulate(opts);
    assert.equal(r.result.status,'SOURCE_UNVERIFIED');
    assert.equal(r.result.freeSlotsCertified,false);
    assert.equal(r.exitCode,1);
    assert.match(r.errors.join(' '),/SOURCE_UNVERIFIED/);
    assert.doesNotMatch(r.errors.join(' '),new RegExp(PRIV));
    assert.deepEqual(r.logs,[]);
  }
});
test('manual capacity-check is GET-only and does not publish reports or save encrypted state',()=>{
  const workflow=fs.readFileSync(
    path.join(root,'.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.match(workflow,/options:\s*\n\s*- invitation-check\s*\n\s*- capacity-check/);
  assert.match(workflow,/capacity_source_verify:\s*\n\s*if: .*inputs\.report == 'capacity-check'/);
  assert.ok(workflow.includes("inputs.report != 'capacity-check'"));
  const start=workflow.indexOf('  capacity_source_verify:');
  const end=workflow.indexOf('\n  report:',start);
  const job=workflow.slice(start,end);
  assert.match(job,/permissions:\s*\n\s*contents: read/);
  assert.match(job,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(job,/CONVOY_FINALIZE_WRITE_MODE: 'false'/);
  assert.ok(job.includes('node "$script" >/dev/null 2>&1'));
  assert.match(job,/node event-capacity-real-source-preview\.js/);
  assert.doesNotMatch(job,/git push|git commit|Update Event Leadership report state|DISCORD_WRITE_MODE: 'true'/);
  assert.doesNotMatch(script,/console\.(?:log|error)\(.*(?:report|overview|JSON\.stringify)/);
});
test('ordinary push source preflight verifies both Calendar/History and Capacity review, without leaked private output',()=>{
  const workflow=fs.readFileSync(
    path.join(root,'.github/workflows/event-leadership-reports.yml'),'utf8');
  const a=workflow.indexOf('      - name: Verify real Calendar and History source without public Event data');
  const b=workflow.indexOf('\n      - name:',a+8);
  const step=workflow.slice(a,b);
  assert.match(step,/node event-history-real-source-preview\.js/);
  assert.match(step,/node event-capacity-real-source-preview\.js/);
  assert.match(step,/continue-on-error: true/);
  assert.ok(step.includes('node "$script" >/dev/null 2>&1'));
});
