const {test}=require('node:test');const assert=require('node:assert/strict');const {evaluate}=require('../convoy-planning-limits');
function entry(id,type,date,departure,status='Scheduled'){return {eventId:String(id),threadId:String(id),name:'Convoy '+id,status,validation:{parsed:{eventType:type,eventDate:date,departureAtUtc:departure}}};}
test('monthly and daily quotas exclude Kings and cancelled entries',()=>{const items=[];for(let i=0;i<21;i++)items.push(entry(i,'External Convoy','2026-11-'+String(i<3?1:i).padStart(2,'0'),null));for(let i=30;i<34;i++)items.push(entry(i,'Partner Convoy','2026-11-01',null));items.push(entry(90,'Kings Convoy','2026-11-01',null));items.push(entry(91,'External Convoy','2026-11-01',null,'Cancelled'));const result=evaluate(items);assert.equal(result.months['2026-11'].external,21);assert.equal(result.months['2026-11'].partner,4);assert.equal(result.months['2026-11'].kings,1);assert.ok(result.warnings.some(w=>w.code==='external-month-over-limit'));assert.ok(result.warnings.some(w=>w.code==='external-day-over-limit'));assert.ok(result.warnings.some(w=>w.code==='partner-day-over-limit'));assert.ok(result.warnings.some(w=>w.code==='external-month-threshold'&&w.threshold===20));});
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


test('only verified Kings event relationships resolve missing advisory types', () => {
  const registry = require('../data/convoy-event-type-overrides.json');
  const rows = Object.entries(registry.events).map(([id,item]) => ({
    ...entry(id,null,'2027-04-01','2027-04-01T16:00:00Z'),
    truckersmpSync: {ok:true,authoritative:true},
    truckersmp: {id:Number(id),hostVtc: item.host}
  }));
  const result = evaluate(rows);
  assert.equal(result.unknownTypes.length,0);
  assert.equal(result.resolvedEventTypes.length,7);
  assert.equal(result.resolvedEventTypes.filter(x=>x.type==='Partner Convoy').length,4);
  assert.equal(result.resolvedEventTypes.filter(x=>x.type==='Kings Convoy').length,1);
  assert.equal(result.resolvedEventTypes.filter(x=>x.type==='External Convoy').length,2);
  assert.ok(result.resolvedEventTypes.every(x=>x.source==='verified-kings-event-registry'));
});

test('wrong host or unverified TruckersMP sync cannot create an invented partner classification', () => {
  const asEvent = (host,success) => ({
    ...entry('37926',null,'2027-04-01',null),
    truckersmpSync:{ok:success,authoritative:success},
    truckersmp:{id:37926,hostVtc:host}
  });
  const result = evaluate([asEvent('Random VTC',true),asEvent('Mileage Riot',false)]);
  assert.equal(result.resolvedEventTypes.length,0);
  assert.equal(result.unknownTypes.length,1, 'deduplicated untrusted event still requires staff confirmation');
  assert.equal(result.counted,0);
});

test('valid Event Type entered by staff always overrides registry suggestion', () => {
  const original = {
    ...entry('37926','External Convoy','2027-04-01','2027-04-01T16:00:00Z'),
    truckersmpSync:{ok:true,authoritative:true},
    truckersmp:{id:37926,hostVtc:'Mileage Riot'}
  };
  const result=evaluate([original]);
  assert.equal(result.resolvedEventTypes.length,0);
  assert.equal(result.months['2027-04'].external,1);
  assert.equal(result.months['2027-04'].partner,0);
});
