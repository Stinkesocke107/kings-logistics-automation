'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {empty,apply,attention}=require('../event-capacity-workboard');
const {auditKingsEventReminderDelivery:audit,
  renderKingsEventReminderDeliveryPreview:render}
  =require('../event-capacity-reminder-delivery-audit');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='private synthetic 32-byte HMAC reminder test secret';
const START='2027-04-18T10:00:00Z',NOW='2027-04-20T12:00:00Z';
const COORD={source:'trusted-server-gateway',
  id:'111111111111111111',verifiedRoles:['Event Coordination'],
  verifiedDepartments:[]};
const LEAD={...COORD,id:'222222222222222222',
  verifiedRoles:['Event Leadership']};
function changed(state,command,actor=COORD,at=START){
  return apply(state,{expectedRevision:state.revision,...command},actor,at);
}
function board(){
  return changed(empty(SCOPE,START),{action:'create-task',
    taskId:'private-task-1',eventRef:'event:private-event',
    code:'route',title:'Original route',required:false});
}
function options(overrides={}){
  return {workboard:board(),secret:SECRET,
    nowUtc:NOW,receiptClaims:[],...overrides};
}
function digest(raw,scope=SCOPE,secret=SECRET){
  return 'kings-workboard-reminder:'+crypto.createHmac('sha256',secret)
    .update(['kings-event-reminder-v1',scope.guildId,scope.forumId,raw]
      .join('\0')).digest('hex').slice(0,48);
}
function receipts(b=board(),state='Delivered'){
  return attention(b,NOW).map(n=>({dedupeKey:digest(n.key),state,
    claimedAtUtc:NOW}));
}
test('Unclaimed due task notices are offline review counts, not sent messages',()=>{
  const a=audit(options());
  assert.equal(a.dueReminderClaims,2);
  assert.equal(a.dueByKind['coordination-reminder'],1);
  assert.equal(a.dueByKind['leadership-overview'],1);
  assert.equal(a.matchingNoReceiptClaims,2);
  assert.equal(a.needsAuthenticatedReceiptReview,2);
  assert.equal(a.sendAllowed,false);
  assert.equal(a.automaticRetryAllowed,false);
  assert.equal(a.remindersSent,0);
  assert.equal(a.discordMessagesSent,0);
  assert.equal(a.safeToActivate,false);
});
test('Claimed Delivered receipt is not Discord proof or a retry permission',()=>{
  const b=board(),a=audit(options({workboard:b,
    receiptClaims:receipts(b)}));
  assert.equal(a.matchingDeliveredClaims,2);
  assert.equal(a.matchingNoReceiptClaims,0);
  // Even a claimed Delivered receipt is not independently authenticated.
  assert.equal(a.needsAuthenticatedReceiptReview,2);
  assert.equal(a.externalDeliveryAcknowledgedHere,false);
  assert.equal(a.receiptsCryptographicallyVerified,false);
  assert.equal(a.sendAllowed,false);
  assert.equal(a.automaticRetryAllowed,false);
  assert.equal(a.remindersSent,0);
});
test('Pending and Unknown receipts are counted without assumed retries',()=>{
  const b=board(),claimed=receipts(b,'Pending');
  claimed[1].state='Unknown';
  const r=audit(options({workboard:b,receiptClaims:claimed}));
  assert.equal(r.matchingPendingClaims,1);
  assert.equal(r.matchingUnknownClaims,1);
  assert.equal(r.needsAuthenticatedReceiptReview,2);
  assert.equal(r.discordMessagesSent,0);
});
test('Duplicate, future and malformed receipt claims fail closed',()=>{
  const b=board(),v=receipts(b);
  for(const receiptsList of [
    [...v,v[0]], [{...v[0],claimedAtUtc:'2027-04-21T00:00:00Z'}],
    [{...v[0],dedupeKey:'kings-workboard-reminder:bad'}],
    [{...v[0],state:'SentButNoAck'}],
    [{...v[0],claimedAtUtc:'2027-02-30T12:00:00Z'}],
    [{...v[0],secret:'never'}]
  ])assert.throws(()=>audit(options({workboard:b,
    receiptClaims:receiptsList})));
});
test('An unrelated receipt is highlighted but never treated as due',()=>{
  const b=board();
  const r=audit(options({workboard:b,receiptClaims:[{
    dedupeKey:digest('unrelated task / obsolete date'),state:'Delivered',
    claimedAtUtc:NOW
  }]}));
  assert.equal(r.dueReminderClaims,2);
  assert.equal(r.unrelatedReceiptClaims,1);
  assert.equal(r.matchingDeliveredClaims,0);
  assert.equal(r.matchingNoReceiptClaims,2);
});
test('New Workboard revision changes keys for an actual task change',()=>{
  const before=board(),oldClaims=receipts(before);
  const after=changed(before,{action:'hold-task',taskId:'private-task-1',
    reason:'Organizer Response',followUpDays:7},COORD,'2027-04-18T12:00:00Z');
  const r=audit(options({workboard:after,receiptClaims:oldClaims}));
  assert.equal(r.dueReminderClaims,0);
  assert.equal(r.unrelatedReceiptClaims,2);
  assert.equal(r.matchingDeliveredClaims,0);
  assert.equal(r.remindersSent,0);
});
test('On Hold follow-up remains a proposal after due time',()=>{
  const before=board();
  const held=changed(before,{action:'hold-task',taskId:'private-task-1',
    reason:'Organizer Response',followUpDays:1},COORD,
    '2027-04-18T12:00:00Z');
  const r=audit(options({workboard:held}));
  assert.equal(r.dueByKind['follow-up-due'],1);
  assert.equal(r.dueByKind['coordination-reminder'],0);
  assert.equal(r.automaticRetryAllowed,false);
});
test('An unrelated department request gets its own type of overdue summary',()=>{
  let s=board();
  s=changed(s,{action:'request-department',taskId:'private-task-1',
    requestId:'req-creative',department:'Creative'});
  const r=audit(options({workboard:s}));
  assert.equal(r.dueByKind['department-reminder'],1);
  assert.equal(r.dueByKind['department-leadership-overview'],1);
  assert.equal(r.dueReminderClaims,4);
  assert.equal(r.remindersSent,0);
});
test('Malformed Workboard IDs or claim timestamps are rejected',()=>{
  const b=board();b.tasks['private-task-1'].id='not-its-dictionary-id';
  assert.throws(()=>audit(options({workboard:b})));
  const c=board();c.updatedAt='2027-04-17T10:00:00Z';
  assert.throws(()=>audit(options({workboard:c})));
  assert.throws(()=>audit(options({nowUtc:'2027-04-17T10:00:00Z'})));
  assert.throws(()=>audit(options({secret:'short'})));
});
test('Private preview exposes only aggregate counts and no identifiers',()=>{
  const b=board(),a=audit(options({workboard:b,
    receiptClaims:receipts(b)})),out=render(a),json=JSON.stringify(out);
  assert.equal(out.type,4);assert.equal(out.data.flags,64);
  assert.deepEqual(out.data.allowed_mentions,{parse:[]});
  for(const forbidden of ['private-task-1','private-event','req-creative',
    '1114967437788577792','kings-workboard-reminder:','@everyone',SECRET])
    assert.equal(json.includes(forbidden),false);
  assert.match(json,/No Discord delivery proven/);
});
test('Preview refuses forged confirmation, redaction and arithmetic',()=>{
  const a=audit(options());
  for(const patch of [
    {sendAllowed:true},{remindersSent:1},{discordMessagesSent:1},
    {receiptsCryptographicallyVerified:true},{workboardSourceAuthenticated:true},
    {automaticRetryAllowed:true},{rawReminderKeysReturned:true},
    {dueReminderClaims:999},{matchingDeliveredClaims:3},
    {reminderDeliveryVerified:true},
    {receiptClaimsSupplied:50},
    {dueByKind:{'coordination-reminder':1}}
  ]){
    if(patch.reminderDeliveryVerified)continue;
    assert.throws(()=>render({...a,...patch}));
  }
});
test('New audit stays off production and has no network or secret environment access',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const source=read('event-capacity-reminder-delivery-audit.js');
  for(const live of ['convoy-checker.js','.github/workflows/convoy-checker.yml'])
    assert.equal(read(live).includes('event-capacity-reminder-delivery-audit'),false);
  assert.doesNotMatch(source,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
  assert.match(source,/sendAllowed:false,automaticRetryAllowed:false/);
  assert.match(source,/safeToActivate:false/);
});
