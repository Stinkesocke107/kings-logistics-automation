const {test}=require('node:test');const assert=require('node:assert/strict');const {evaluate}=require('../convoy-planning-limits');
function entry(id,type,date,departure,status='Scheduled'){return {eventId:String(id),threadId:String(id),name:'Convoy '+id,status,validation:{parsed:{eventType:type,eventDate:date,departureAtUtc:departure}}};}
test('operational planning uses 3 total/day including Kings, 20/month External and Partner separately',()=>{
  const items=[];
  for(let i=0;i<21;i++)items.push(entry(i,'External Convoy',
    '2026-11-'+String(i<3?1:i).padStart(2,'0'),null));
  for(let i=30;i<34;i++)items.push(entry(i,'Partner Convoy','2026-11-01',null));
  items.push(entry(90,'Kings Convoy','2026-11-01',null));
  items.push(entry(91,'External Convoy','2026-11-01',null,'Cancelled'));
  const result=evaluate(items);
  assert.equal(result.version,2);
  assert.equal(result.months['2026-11'].external,21);
  assert.equal(result.months['2026-11'].partner,4);
  assert.equal(result.months['2026-11'].kings,1);
  assert.equal(result.days['2026-11-01'].total,8);
  assert.ok(result.warnings.some(w=>w.code==='external-month-over-limit'));
  assert.ok(result.warnings.some(w=>w.code==='total-day-over-limit'&&w.limit===3));
  assert.ok(result.warnings.some(w=>w.code==='external-month-threshold'&&w.threshold===20));
  assert.equal(result.warnings.some(w=>w.code==='external-day-over-limit'||w.code==='partner-day-over-limit'),false);
  assert.deepEqual({...result.limits},{dailyTotal:3,partnerMonthly:20,externalMonthly:20,kingsMonthly:null,separationMinutes:120});
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.historicalApprovalsVerified,false);
});
test('departure gap uses start time across types and midnight',()=>{const r=evaluate([entry(1,'Kings Convoy','2026-11-01','2026-11-01T23:30:00Z'),entry(2,'Partner Convoy','2026-11-02','2026-11-02T00:30:00Z'),entry(3,'External Convoy','2026-11-02','2026-11-02T03:00:00Z')]);assert.equal(r.warnings.filter(w=>w.code==='departure-under-two-hours').length,1);assert.equal(r.warnings.find(w=>w.code==='departure-under-two-hours').minutesApart,60);});
test('unknown types and missing departure stay visible but never guessed',()=>{const r=evaluate([entry(1,'Legacy Calendar','2026-11-01',null),entry(2,'External Convoy','2026-11-01',null),entry(2,'External Convoy','2026-11-01',null)]);assert.equal(r.counted,1);assert.equal(r.unknownTypes.length,1);assert.equal(r.missingDepartures.length,1);});

test('TruckersMP UTC wall-clock departure is not falsely marked missing', () => {
  const items = [
    entry(37606, 'External Convoy', '2027-03-20', '2027-03-20 16:00:00'),
    entry(38056, 'External Convoy', '2027-03-20', '2027-03-20 17:00:00')
  ];
  const result = evaluate(items);
  assert.equal(result.missingDepartures.length, 0);
  const gap = result.warnings.find(w => w.code === 'departure-under-two-hours');
  assert.ok(gap, 'One-hour gap must be checked instead of skipped');
  assert.equal(gap.minutesApart, 60);
});

test('Convoy planning rejects unclear timezone and invalid date, accepts explicit offsets', () => {
  const items = [
    entry(1,'External Convoy','2027-03-20','2027-03-20 16:00:00'),
    entry(2,'External Convoy','2027-03-20','2027-03-20T18:00:00+01:00'),
    entry(3,'External Convoy','2027-03-20','2027-03-20T18:00:00'),
    entry(4,'External Convoy','2027-03-20','2027-02-31 18:00:00')
  ];
  const result = evaluate(items);
  assert.deepEqual(result.missingDepartures.map(x => x.eventId),['3','4']);
  assert.equal(result.warnings.filter(x => x.code === 'departure-under-two-hours').length, 1);
});

test('TruckersMP API timestamps normalize as explicit UTC without local-time ambiguity', () => {
  const {sandbox} = require('./sandbox.cjs');
  const s = sandbox('convoy-truckersmp-sync.js',{
    env:{DISCORD_BOT_TOKEN:'test-token'},
    files:{'output/convoy-check-results.json':'{"threads":[]}'}
  });
  const normalized = s.run("buildAuthoritativeFields({id:37606,meetup_at:'2027-03-20 15:00:00',start_at:'2027-03-20 16:00:00',departure:{city:'Zürich'},arrive:{city:'Milan'}})");
  assert.equal(normalized.eventDate,'2027-03-20');
  assert.equal(normalized.meetupTime,'15:00 UTC');
  assert.equal(normalized.departureTime,'16:00 UTC');
  assert.equal(normalized.departureAtUtc,'2027-03-20T16:00:00.000Z');
  const offset = s.run("truckersMpUtcInstant('2027-03-20T17:00:00+01:00')");
  assert.equal(offset,'2027-03-20T16:00:00.000Z');
  assert.equal(s.run("truckersMpUtcInstant('2027-02-31 16:00:00')"),null);
  assert.equal(s.run("truckersMpUtcInstant('2027-03-20T16:00:00')"),null);
});


test('public TruckersMP Kings-hosted event resolves missing advisory event type', () => {
  const record = {
    ...entry('38746',null,'2027-03-26','2027-03-26T17:00:00Z'),
    truckersmpSync:{ok:true,authoritative:true},
    truckersmp:{id:38746,hostVtc:'- Kings Logistics -'}
  };
  const result=evaluate([record]);
  assert.equal(result.counted,1);
  assert.equal(result.unknownTypes.length,0);
  assert.equal(result.months['2027-03'].kings,1);
  assert.deepEqual(result.resolvedEventTypes,[{
    threadId:'38746',eventId:'38746',type:'Kings Convoy',
    source:'truckersmp-authoritative-kings-host'
  }]);
});

test('partner/friend distinctions are never guessed from external TruckersMP hosts', () => {
  const hosts=['Unrelated VTC A','Other Organization B','Friendly Community C'];
  const records=hosts.map((host,index)=>({
    ...entry(String(37926+index),null,'2027-03-26','2027-03-26T17:00:00Z'),
    truckersmpSync:{ok:true,authoritative:true},
    truckersmp:{id:37926+index,hostVtc:host}
  }));
  const result=evaluate(records);
  assert.equal(result.counted,0);
  assert.equal(result.resolvedEventTypes.length,0);
  assert.equal(result.unknownTypes.length,3);
});

test('invalid sync, mismatched event ID, and staff-entered type are never overridden', () => {
  const base={
    ...entry('38746',null,'2027-03-26','2027-03-26T17:00:00Z'),
    truckersmpSync:{ok:true,authoritative:true},
    truckersmp:{id:38746,hostVtc:'Kings Logistics'}
  };
  assert.equal(evaluate([{...base,truckersmpSync:{ok:false,authoritative:false}}]).unknownTypes.length,1);
  assert.equal(evaluate([{...base,truckersmp:{...base.truckersmp,id:999}}]).unknownTypes.length,1);
  const manual={...base,validation:{parsed:{eventType:'External Convoy',eventDate:'2027-03-26',departureAtUtc:'2027-03-26T17:00:00Z'}}};
  const r=evaluate([manual]);
  assert.equal(r.resolvedEventTypes.length,0);
  assert.equal(r.months['2027-03'].external,1);
});


test('unclassified planning events include a public link and staff action, without guessing partnership', () => {
  const record={
    ...entry('37926',null,'2026-10-30','2026-10-30T18:00:00Z'),
    name:'30. October - Unclassified Convoy',
    truckersmpSync:{ok:true,authoritative:true},
    truckersmp:{id:37926,hostVtc:'External Event Organizer'}
  };
  const result=evaluate([record]);
  assert.equal(result.unknownTypes.length,1);
  assert.equal(result.unknownTypes[0].publicEventUrl,'https://truckersmp.com/events/37926');
  assert.equal(result.unknownTypes[0].publicHost,'External Event Organizer');
  assert.match(result.unknownTypes[0].actionRequired,/Event Staff/);
});

test('Partner monthly ceiling is independent from External, Kings have no monthly ceiling',()=>{
  const items=[];
  for(let i=0;i<21;i++)items.push(entry(100+i,'Partner Convoy','2027-01-'+String(i+1).padStart(2,'0'),null));
  for(let i=0;i<33;i++)items.push(entry(200+i,'Kings Convoy','2027-01-'+String(i%28+1).padStart(2,'0'),null));
  const r=evaluate(items);
  assert.equal(r.months['2027-01'].partner,21);
  assert.equal(r.months['2027-01'].external,0);
  assert.equal(r.months['2027-01'].kings,33);
  assert.ok(r.warnings.some(w=>w.code==='partner-month-over-limit'));
  assert.ok(r.warnings.some(w=>w.code==='partner-month-threshold'&&w.threshold===20));
  assert.equal(r.warnings.some(w=>w.code==='external-month-over-limit'),false);
  assert.equal(r.warnings.some(w=>/kings-month|weekly/.test(w.code)),false);
});

test('four Kings Convoys in the same UTC day also trigger the combined 3/day advisory',()=>{
  const rows=Array.from({length:4},(_,i)=>
    entry(500+i,'Kings Convoy','2027-04-08','2027-04-08T'+String(8+i*3).padStart(2,'0')+':00:00Z'));
  const r=evaluate(rows);
  assert.equal(r.days['2027-04-08'].total,4);
  const issue=r.warnings.find(w=>w.code==='total-day-over-limit');
  assert.equal(issue.count,4);
  assert.equal(issue.limit,3);
  assert.equal(r.warnings.some(w=>w.code==='departure-under-two-hours'),false);
});

test('canonical UTC departure overrides a different local display day and month',()=>{
  const r=evaluate([
    entry(610,'Partner Convoy','2027-03-31','2027-03-31T23:30:00-02:00'),
    entry(611,'External Convoy','2027-03-31','2027-04-01T02:00:00Z')
  ]);
  assert.equal(r.months['2027-03'],undefined);
  assert.equal(r.months['2027-04'].partner,1);
  assert.equal(r.months['2027-04'].external,1);
  assert.equal(r.days['2027-04-01'].total,2);
});

test('invalid display dates cannot silently create artificial capacity days',()=>{
  const r=evaluate([
    entry(700,'Partner Convoy','2027-02-31',null),
    entry(701,'External Convoy','2027-01-01',null)
  ]);
  assert.equal(r.months['2027-02'],undefined);
  assert.equal(r.counted,1);
  assert.equal(r.missingDepartures.length,1);
  assert.equal(r.freeSlotsCertified,false);
});
