'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {periodForVerification,periodForPreviousMonth,periodForVerificationTarget}=
  require('../monthly-report-verifier');
const {VERIFIED,PENDING,evaluateMonthlyProof}=require('../monthly-recurring-proof');

const NOW=Date.parse('2026-12-05T13:00:00.000Z');
const MESSAGE='1566489510898958407',WEBHOOK='1479853315264217203',CHANNEL='1479853315264217202';
function report(){
  return {
    version:1,checkedAt:new Date(NOW-60000).toISOString(),
    mode:'read-only',phase:'post-publish',healthy:true,
    targetMonth:{key:'2026-11',label:'November 2026',
      start:'2026-11-01T00:00:00.000Z',end:'2026-12-01T00:00:00.000Z'},
    statistics:{expectedDatesChecked:30,missingDates:[],coverageHealthy:true,monthClosed:true},
    discord:{webhookId:WEBHOOK,channelId:CHANNEL,messageId:MESSAGE,officialReportMatches:1},
    state:{published:true,entry:{key:'2026-11',discordMessageId:MESSAGE,discordChannelId:CHANNEL}}
  };
}
test('Scheduled monthly verification remains unchanged; manual previous target closes last UTC month',()=>{
  const now=new Date(NOW);
  const scheduled=periodForVerification(now);
  assert.equal(scheduled.key,'2026-12');
  assert.equal(scheduled.phase,'readiness');
  assert.deepEqual(periodForVerificationTarget('current',now),scheduled);
  assert.equal(periodForPreviousMonth(now).key,'2026-11');
  assert.equal(periodForVerificationTarget('previous',now).phase,'post-publish');
  assert.equal(periodForPreviousMonth(new Date('2028-03-09T12:00:00Z')).key,'2028-02');
  assert.equal(periodForPreviousMonth(new Date('2028-03-09T12:00:00Z')).end.toISOString(),'2028-03-01T00:00:00.000Z');
  assert.throws(()=>periodForVerificationTarget('2025-01',now),/invalid/);
});
test('Exactly one real-shaped closed-month Discord report and state permit month-scoped proof',()=>{
  const actual=evaluateMonthlyProof(report(),NOW);
  assert.equal(actual.status,VERIFIED);
  assert.equal(actual.proof.targetMonth.key,'2026-11');
  assert.equal(actual.proof.discordMessageId,MESSAGE);
  assert.equal(actual.proof.statisticsDaysVerified,30);
  assert.equal(actual.proof.stateEntryKey,'2026-11');
  assert.ok(!JSON.stringify(actual.proof).includes('token'));
  const confidentialLabel=report();
  confidentialLabel.targetMonth.label='private HR / Event names should never appear';
  const safe=evaluateMonthlyProof(confidentialLabel,NOW);
  assert.equal(safe.status,VERIFIED);
  assert.equal(safe.proof.targetMonth.label,'November 2026');
  assert.ok(!JSON.stringify(safe.proof).includes('private HR'));
});
test('Missing days, unresolved publications and contradictory Discord state cannot be accepted',()=>{
  const scenarios=[
    {phase:'readiness'},
    {healthy:false},
    {statistics:{...report().statistics,missingDates:['2026-11-19']}},
    {statistics:{...report().statistics,expectedDatesChecked:29}},
    {statistics:{...report().statistics,monthClosed:false}},
    {discord:{...report().discord,officialReportMatches:2}},
    {discord:{...report().discord,messageId:null}},
    {state:{published:false,entry:report().state.entry}},
    {state:{published:true,entry:{...report().state.entry,discordMessageId:'123456789123456789'}}},
    {state:{published:true,entry:{...report().state.entry,discordChannelId:null}}},
    {state:{published:true,entry:{...report().state.entry,discordChannelId:'123456789123456789'}}},
    {targetMonth:{...report().targetMonth,key:'2026-10'}},
    {targetMonth:{...report().targetMonth,end:'2026-12-02T00:00:00.000Z'}},
    {mode:'write'}
  ];
  for(const change of scenarios){
    const r={...report(),...change};
    assert.equal(evaluateMonthlyProof(r,NOW).status,PENDING,JSON.stringify(change));
  }
  assert.equal(evaluateMonthlyProof({...report(),checkedAt:'2026-11-01T12:00:00Z'},NOW).status,PENDING);
  assert.equal(evaluateMonthlyProof({...report(),checkedAt:'2026-12-06T12:00:00Z'},NOW).status,PENDING);
});
test('Legacy September proof is preserved; per-month evidence stays manually gated in existing workflow',()=>{
  const collector=fs.readFileSync(path.join(__dirname,'../production-proof-collector.js'),'utf8');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/monthly-report-verification.yml'),'utf8');
  assert.match(collector,/VERIFIED-LIVE-MONTHLY-2026-09/);
  assert.match(collector,/monthly-live-proofs/);
  assert.match(collector,/prior\.discordMessageId !== result\.proof\.discordMessageId/);
  assert.match(collector,/mode === 'monthly-recurring'/);
  assert.match(workflow,/inputs\.verify_month == 'previous'/);
  assert.match(workflow,/node production-proof-collector\.js monthly-recurring/);
  assert.match(workflow,/git add -A --/);
  assert.match(workflow,/data\/monthly-live-proofs\/\*\.json/);
  assert.doesNotMatch(workflow,/run: node monthly-report-v2\.js/);
});
