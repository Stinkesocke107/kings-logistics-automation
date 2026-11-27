const {test}=require('node:test');
const assert=require('node:assert/strict');
const {keyOf,pending}=require('../convoy-planning-alerts');
test('threshold alerts deduplicate despite changing convoy totals',()=>{
 const one={code:'external-month-threshold',period:'2026-11',threshold:20,count:20};
 const two={...one,count:21};
 assert.equal(keyOf(one),keyOf(two));
 assert.equal(pending([two],{sent:[keyOf(one)]}).length,0);
});
test('separate monthly thresholds remain independently alertable',()=>{
 const a={code:'external-month-threshold',period:'2026-11',threshold:20,count:30};
 const b={...a,threshold:25};
 assert.notEqual(keyOf(a),keyOf(b));
});
test('duplicate departure pair is order-independent',()=>{
 const a={code:'departure-under-two-hours',first:'event:7',second:'event:9',period:'2026-11-01',minutesApart:60};
 assert.equal(keyOf(a),keyOf({...a,first:'event:9',second:'event:7',minutesApart:65}));
});

test('partner monthly warning thresholds are deduplicated independently from External',()=>{
  const partner={code:'partner-month-threshold',period:'2027-03',threshold:20,count:22};
  const partnerRaised={...partner,count:24};
  const external={...partner,code:'external-month-threshold'};
  assert.equal(keyOf(partner),keyOf(partnerRaised));
  assert.notEqual(keyOf(partner),keyOf(external));
  assert.notEqual(keyOf(partner),keyOf({...partner,threshold:25}));
  assert.equal(pending([partnerRaised],{sent:[keyOf(partner)]}).length,0);
});

test('global 3/day warning applies across all types without auto-denying a confirmed convoy',()=>{
  const {describe}=require('../convoy-planning-alerts');
  const message=describe({code:'total-day-over-limit',period:'2027-03-20',count:4,limit:3});
  assert.match(message,/4\/3/);
  assert.match(message,/Staff review required/);
  assert.match(message,/no automatic refusal or reschedule/);
  assert.doesNotMatch(message,/External Convoys exceed daily limit|Partner Convoys exceed daily limit/);
});

test('under-two-hours departure separation remains only a review warning',()=>{
  const {describe}=require('../convoy-planning-alerts');
  const message=describe({
    code:'departure-under-two-hours',period:'2027-03-20',
    first:'event:1',second:'event:2',minutesApart:75
  });
  assert.match(message,/WARNING ONLY/);
  assert.match(message,/not automatic refusal/);
  assert.equal(keyOf({code:'total-day-over-limit',period:'2027-03-20',count:4}),
    keyOf({code:'total-day-over-limit',period:'2027-03-20',count:5}));
});

test('daily Event source triage groups unresolved categories and dates without exposing Event details',()=>{
  const {sourceTriageNotices,describe}=require('../convoy-planning-alerts');
  const privateMarker='DO_NOT_PUBLISH_PRIVATE_EVENT_NAME';
  const source={
    version:2,mode:'advisory-only',sourceClaimsOnly:true,
    freeSlotsCertified:false,
    unknownTypes:[{threadId:'777777777777777777',name:privateMarker},
      {eventId:'123456',name:privateMarker}],
    missingDepartures:[{threadId:'888888888888888888',name:privateMarker}]
  };
  const notices=sourceTriageNotices(source,'2026-11-25T21:00:00Z');
  assert.equal(notices.length,1);
  const n=notices[0];
  assert.equal(n.code,'event-source-triage');
  assert.equal(n.period,'2026-11-25');
  assert.equal(n.unknownTypes,2);
  assert.equal(n.missingDepartures,1);
  assert.equal(keyOf(n),keyOf({...n,unknownTypes:5,missingDepartures:4}),
    'Only one private source review alert per UTC day');
  assert.notEqual(keyOf(n),keyOf({...n,period:'2026-11-26'}));
  const message=describe(n);
  assert.match(message,/2.*unclassified Event type/);
  assert.match(message,/1.*missing verified UTC departure/);
  assert.match(message,/Staff source review/);
  assert.match(message,/not an Event approval, capacity release or booking/);
  for(const marker of [privateMarker,'777777777777777777','888888888888888888','123456']){
    assert.ok(!JSON.stringify(n).includes(marker));
    assert.ok(!message.includes(marker));
  }
  assert.equal(pending([n],{sent:[keyOf(n)]}).length,0);
});

test('Event source triage is silent for clean data and rejects obsolete/unverified summaries',()=>{
  const {sourceTriageNotices}=require('../convoy-planning-alerts');
  const clean={version:2,mode:'advisory-only',
    sourceClaimsOnly:true,freeSlotsCertified:false,
    unknownTypes:[],missingDepartures:[]};
  assert.equal(sourceTriageNotices(clean,'2026-11-25T21:00:00Z').length,0);
  for(const bad of [
    {...clean,version:1,unknownTypes:[{}]},
    {...clean,freeSlotsCertified:true,unknownTypes:[{}]},
    {...clean,mode:'booking',unknownTypes:[{}]},
    {...clean,sourceClaimsOnly:false,unknownTypes:[{}]},
    {...clean,unknownTypes:null},
    {...clean,missingDepartures:null}
  ]){
    assert.equal(sourceTriageNotices(bad,'2026-11-25T21:00:00Z').length,0);
  }
  assert.equal(sourceTriageNotices({...clean,unknownTypes:[{}]},'bad date').length,0);
});

test('Event triage reuses durable Staff alert deduplication and never publishes private source in dry-run logs',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'..','convoy-planning-alerts.js'),'utf8');
  assert.match(source,/pending\(\[\.\.\.activeWarnings,\.\.\.sourceTriageNotices\(report\)\],existing\)/);
  assert.match(source,/private event details withheld/);
  assert.match(source,/CONVOY_DRY_RUN/);
  assert.match(source,/Convoy Alert Key/);
});

test('only authenticated bot-owned complete-history markers recover sent alerts',()=>{
  const {botOwnedAlertKeys}=require('../convoy-planning-alerts');
  const botId='111111111111111111';
  const key='abcdefabcdefabcdefabcdef';
  const content='Private notice\nConvoy Alert Key: '+key;
  const human={author:{id:'222222222222222222',bot:false},content};
  const webhook={author:{id:'333333333333333333',bot:true},content};
  const bot={author:{id:botId,bot:true},content};
  assert.equal(botOwnedAlertKeys([human,webhook],botId).size,0);
  assert.deepEqual([...botOwnedAlertKeys([human,webhook,bot],botId)],[key]);
  assert.equal(botOwnedAlertKeys([{...bot,content:content+'\nEdited'}],botId).size,0);
  assert.throws(()=>botOwnedAlertKeys(new Array(100).fill(human),botId),/incomplete/);
  assert.throws(()=>botOwnedAlertKeys(null,botId),/incomplete/);
});

test('Discord acknowledgment is not publication proof until exact stored bot message is read',()=>{
  const {validAlertDelivery}=require('../convoy-planning-alerts');
  const expected={id:'123456789012345678',botId:'111111111111111111',
    channelId:'333333333333333333',content:'Hello'};
  const saved={id:expected.id,channel_id:expected.channelId,
    author:{id:expected.botId,bot:true},content:expected.content};
  assert.equal(validAlertDelivery(saved,expected),true);
  for(const changed of [
    {...saved,content:'Modified'}, {...saved,author:{id:'999999999999999999',bot:true}},
    {...saved,channel_id:'555555555555555555'}, {...saved,author:{id:expected.botId,bot:false}}
  ])assert.equal(validAlertDelivery(changed,expected),false);
  assert.equal(validAlertDelivery(null,expected),false);
});

test('live event planning alerts and durable state require verified original sources',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','convoy-checker.yml'),'utf8');
  const block=workflow.split('- name: Notify Event Leadership about new planning conflicts')[1]
    ?.split('- name: Persist sent planning alert keys')[0]||'';
  for(const stage of ['convoy_stage_0','convoy_stage_1','convoy_stage_2',
    'convoy_completeness','convoy_stage_8'])
    assert.ok(block.includes('steps.'+stage+'.outcome == \'success\''),stage);
  const persist=workflow.split('- name: Persist sent planning alert keys')[1]
    ?.split('- name: Send private Kings Operations Notices')[0]||'';
  assert.match(persist,/steps\.convoy_planning_alerts\.outcome == 'success'/);
  const source=fs.readFileSync(path.join(__dirname,'..','convoy-planning-alerts.js'),'utf8');
  assert.doesNotMatch(source,/await res\.text\(\)/);
  assert.match(source,/validAlertDelivery\(saved,/);
  assert.match(source,/botOwnedAlertKeys\(recent,bot\.id\)/);
});

test('duplicate-source alert is private, stable, source-only and never certifies free capacity',()=>{
  const {describe,keyOf}=require('../convoy-planning-alerts');
  const w={code:'duplicate-source-claim',period:'2027-04-02',count:1};
  const text=describe(w);
  assert.match(text,/duplicate source claim/);
  assert.match(text,/Staff reconciliation/);
  assert.match(text,/no capacity is released/);
  assert.equal(keyOf(w),keyOf({...w,count:3}));
  assert.doesNotMatch(text,/123456789012345678|PRIVATE_EVENT_MARKER/);
});


test('independent 30/month warning text and staged 20,25,30 review thresholds remain advisory-only',()=>{
 const {describe}=require('../convoy-planning-alerts');
 for(const category of ['partner','external']){
   for(const threshold of [20,25,30]){
     const notice={code:category+'-month-threshold',period:'2027-05',threshold,count:30};
     const text=describe(notice);
     assert.match(text,new RegExp('30/30'));
     assert.match(text,new RegExp('review threshold '+threshold+'/30'));
     assert.match(text,/not automatic approval/);
   }
   const above=describe({code:category+'-month-over-limit',period:'2027-05',count:31,limit:30});
   assert.match(above,/31\/30/);
   assert.match(above,/30\/month/);
   assert.match(above,/no existing approval is displaced/);
 }
});

test('unidentified original source claims alert Staff without double-counting or leaking private records',()=>{
  const {describe,keyOf}=require('../convoy-planning-alerts');
  const notice={code:'unidentified-source-claim',period:'2027-04-09',count:2};
  const content=describe(notice);
  assert.match(content,/without a verifiable Event, Forum or Legacy ID/);
  assert.match(content,/not counted as distinct Convoys/);
  assert.match(content,/Event Staff must reconcile original records/);
  assert.match(content,/no capacity is certified or released/);
  assert.equal(keyOf(notice),keyOf({...notice,count:5}));
  assert.doesNotMatch(content,/PRIVATE_EVENT_MARKER|123456789012345678/);
});
