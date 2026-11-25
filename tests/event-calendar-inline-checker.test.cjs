'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectInline,STATUS}=require('../event-calendar-inline-checker');
const G='1114967437788577792',F='1550619824005062697';
const NOW=Date.parse('2027-03-20T12:00:00Z');
function fixture(){
  const event={
    eventId:'synthetic-private-event-not-for-public-logs',
    threadId:'777777777777777777',name:'Synthetic confidential staff event',
    status:'Scheduled',ignored:false,testThread:false,
    validation:{parsed:{eventType:'Partner Convoy',
      departureAtUtc:'2027-03-24T18:00:00Z'}}
  };
  const report={
    guildId:G,forumId:F,mode:'READ_ONLY',
    generatedAt:'2027-03-20T11:50:00Z',
    finalization:{finalizedAt:'2027-03-20T11:55:00Z'},
    summary:{totalThreads:1,actualConvoys:1},threads:[event]
  };
  const overview={
    guildId:G,forumId:F,generatedAt:'2027-03-20T11:56:00Z',
    overall:{realConvoySubmissions:1,convoyReadErrors:0,
      legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
    registeredConvoys:[{
      source:'convoy-center',threadId:event.threadId,eventId:event.eventId,
      status:event.status,departureAtUtc:event.validation.parsed.departureAtUtc
    }]
  };
  return {report,overview};
}
function inspect(data,nowMs=NOW){
  return inspectInline({nowMs,read:name=>data[name]});
}
test('real-shaped finalized Checker reports feed twelve-month Calendar candidate without writes',()=>{
  const data=fixture(),result=inspect(data);
  assert.equal(result.status,STATUS.READY);
  assert.equal(result.readOnly,true);
  assert.equal(result.privateDetailsPublished,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.approvedEvents,0);
  assert.equal(result.bookingsCreated,0);
  const text=JSON.stringify(result);
  for(const secret of [G,F,'777777777777777777',
    'synthetic-private-event-not-for-public-logs',
    'Synthetic confidential staff event','2027-03-24']){
    assert.ok(!text.includes(secret),'Private source metadata escaped projection');
  }
});

test('incomplete/mismatched/unfinalized/stale Checker reports fail closed without bookings',()=>{
  for(const mutate of [
    d=>{delete d.report.finalization;},
    d=>{d.report.mode='DISCORD_MESSAGE_AND_TAG_WRITE';},
    d=>{d.report.summary.actualConvoys=8;},
    d=>{d.overview.registeredConvoys=[];},
    d=>{d.overview.guildId='another-guild';},
    d=>{d.overview.generatedAt='2027-03-15T12:00:00Z';},
    d=>{d.report.threads[0].validation.parsed.departureAtUtc='not a date';},
    d=>{d.report.threads[0].status='Completed';}
  ]){
    const d=fixture();mutate(d);
    // Some shape-level alterations may still be valid source claims
    // (e.g. completed status paired with a still-scheduled overview is not).
    const result=inspect(d);
    assert.equal(result.status,STATUS.UNVERIFIED);
    assert.equal(result.freeSlotsCertified,false);
  }
});

test('same-run Calendar source never accepts missing or invalid source shapes',()=>{
  assert.equal(inspectInline({nowMs:NOW,read:()=>null}).status,STATUS.UNVERIFIED);
  assert.equal(inspectInline({nowMs:NOW,read:()=>{throw Error('secret URL token etc')}}).status,STATUS.UNVERIFIED);
  assert.equal(inspectInline({nowMs:NaN,read:()=>fixture().report}).status,STATUS.UNVERIFIED);
  assert.equal(inspectInline({nowMs:NOW,read:null}).status,STATUS.UNVERIFIED);
  assert.equal(inspectInline({nowMs:NOW,read:()=>({})}).status,STATUS.UNVERIFIED);
});

test('live Checker pipeline connects only after successful source finalization without granting capacity',()=>{
  const wf=fs.readFileSync(path.join(__dirname,'..','.github/workflows/convoy-checker.yml'),'utf8');
  const start=wf.indexOf('      - name: Check read-only Event Calendar source from finalized Convoy Center');
  assert.ok(start>=0);
  const next=wf.indexOf('\n      - name:',start+8);
  const step=wf.slice(start,next<0?undefined:next);
  assert.match(step,/id: event_calendar_readonly/);
  for(const gate of ['steps.mode.outputs.dry_run', 'steps.convoy_stage_0.outcome',
    'steps.convoy_stage_2.outcome','steps.convoy_completeness.outcome',
    'steps.convoy_stage_8.outcome']){
    assert.ok(step.includes(gate),'Missing safe source dependency '+gate);
  }
  assert.match(step,/continue-on-error: true/);
  assert.match(step,/run: node event-calendar-inline-checker.js/);
  assert.doesNotMatch(step,/DISCORD_BOT_TOKEN|role|secret|booking|POST|PATCH|DELETE/);
  assert.match(wf,/cron: '7,22,37,52 \* \* \* \*'/);
  assert.ok(wf.indexOf('Generate convoy overview statistics')<start);
  assert.ok(start<wf.indexOf('Upload convoy reports'));
});
