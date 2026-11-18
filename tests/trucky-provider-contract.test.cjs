const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateRequestedRoster,
  parseFreshObservationTime,
  validateTruckyCandidateResponse
} = require('../trucky-player-provider-contract.js');

const NOW = new Date('2026-11-19T00:00:00.000Z');
const ts = Math.floor(NOW.getTime()/1000);
const idA=10000001, idB=10000002, idC=10000003;
const offline = id => ({mp_id:id,online:false});
const online = (id,game,server,at=ts) => ({
  mp_id:id,online:true,time:at,serverDetails:{game,name:server}
});
const response = players => ({response:{players}});
const validate = (players,ids=[idA,idB,idC]) =>
  validateTruckyCandidateResponse(response(players),ids,{now:NOW});

test('candidate Trucky response requires full, explicit roster coverage for online AND offline drivers',()=>{
  const r=validate([
    online(idA,'ETS2','Simulation 1'),
    offline(idB),
    online(idC,'ATS','Simulation')
  ]);
  assert.equal(r.source,'trucky-candidate');
  assert.equal(r.complete,true);
  assert.equal(r.requested,3);
  assert.equal(r.covered,3);
  assert.equal(r.onlineCount,2);
  assert.equal(r.ets2Online,1);
  assert.equal(r.atsOnline,1);
  assert.deepEqual(r.online.map(x=>x.tmpId),[idA,idC]);
  assert.equal(r.online[0].observedAt,'2026-11-19T00:00:00.000Z');
});

test('complete, explicit offline response is a valid verified zero, unlike missing rows',()=>{
  const r=validate([offline(idA),offline(idB),offline(idC)]);
  assert.equal(r.onlineCount,0);
  assert.deepEqual(r.online,[]);
  assert.throws(()=>validate([]),/incomplete roster coverage/);
  assert.throws(()=>validate([offline(idA),offline(idB)]),/incomplete roster coverage/);
});

test('online-only or ambiguous legacy API response never becomes false zero',()=>{
  const ids=[idA,idB,idC];
  for(const p of [
    {},{response:{}},{response:{players:[]}},
    {response:{players:false}},{response:{players:true}},
    {response:{players:{}}},{response:[offline(idA),offline(idB),offline(idC)]},
    {error:'unavailable',response:{players:[offline(idA),offline(idB),offline(idC)]}}
  ]){
    assert.throws(()=>validateTruckyCandidateResponse(p,ids,{now:NOW}));
  }
});

test('reject duplicate, unexpected, and missing player statuses',()=>{
  assert.throws(()=>validate([offline(idA),offline(idA),offline(idC)]),/duplicate/);
  assert.throws(()=>validate([offline(idA),offline(99999999),offline(idC)]),/Unexpected/);
  assert.throws(()=>validate([
    offline(idA),{mp_id:idB,online:undefined},offline(idC)
  ]),/explicit/);
  assert.throws(()=>validate([
    offline(idA),{mp_id:idB,online:0},offline(idC)
  ]),/explicit/);
});

test('reject stale or futuristic online observations, even if every ID is present',()=>{
  assert.throws(()=>validate([online(idA,'ETS2','Server',ts-500),offline(idB),offline(idC)]),/stale/);
  assert.throws(()=>validate([online(idA,'ETS2','Server',ts+90),offline(idB),offline(idC)]),/future/);
  assert.equal(parseFreshObservationTime(NOW.getTime(),NOW.getTime(),120000),
    '2026-11-19T00:00:00.000Z');
  assert.throws(()=>parseFreshObservationTime(null,NOW.getTime(),120000),/timestamp/);
});

test('online players require known ETS2 or ATS game and safe server metadata',()=>{
  assert.throws(()=>validate([online(idA,'UNKNOWN','Simulation'),offline(idB),offline(idC)]),/server\/game/);
  assert.throws(()=>validate([online(idA,'ETS2',''),offline(idB),offline(idC)]),/server\/game/);
  assert.throws(()=>validate([online(idA,'ETS2','@everyone'),offline(idB),offline(idC)]),/server\/game/);
  assert.throws(()=>validate([online(idA,'ETS2','Simulation\n1'),offline(idB),offline(idC)]),/server\/game/);
  assert.throws(()=>validate([
    {mp_id:idA,online:true,time:ts,server:123},
    offline(idB),offline(idC)
  ]),/server\/game/);
});

test('requested roster must contain unique positive real TMP IDs with bounded size',()=>{
  assert.deepEqual(validateRequestedRoster([idA,String(idB)]),[String(idA),String(idB)]);
  for(const invalid of [[idA,idA],[],[0],[-1],['abc'],['00001'],[null],
      Array.from({length:501},(_,i)=>i+1)]){
    assert.throws(()=>validateRequestedRoster(invalid));
  }
});

test('Trucky candidate is not wired to the live publisher while provider behavior is unverified',()=>{
  const tracker=fs.readFileSync(path.join(__dirname,'../tracker.js'),'utf8');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
  assert.doesNotMatch(tracker,/trucky-player-provider-contract|api\.truckyapp\.com/);
  assert.doesNotMatch(workflow,/trucky-player-provider-contract|TRUCKY_PROVIDER_ENABLED/);
});
