'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectOptionalTracker}=require('../event-capacity-optional-tracker');
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const valid={sourceAuthenticated:true,coverageComplete:true,mapAvailable:true,
  provider:'TruckersMP',observedAtUtc:'2027-03-20T11:59:00.000Z'};
test('No provider is a usable map-free mode, never a zero-online assertion',()=>{
  const state=projectOptionalTracker(null,{nowMs:NOW});
  assert.equal(state.mode,'WITHOUT_MAP');
  assert.equal(state.status,'Unavailable');
  assert.equal(state.capacityIndependent,true);
  assert.equal(state.positionsIncluded,false);
  assert.equal('onlinePlayers' in state,false);
  assert.equal('coordinates' in state,false);
});
test('Only current authenticated full-coverage provider status can indicate map availability',()=>{
  for(const provider of ['TruckersMP','HaulMP']){
    const state=projectOptionalTracker({...valid,provider},{nowMs:NOW});
    assert.equal(state.mode,'WITH_MAP');
    assert.equal(state.provider,provider);
    assert.equal(state.positionsIncluded,false);
  }
});
test('Provider outage, partial map, stale cache and untrusted records degrade independently',()=>{
  const sources=[
    {...valid,mapAvailable:false},
    {...valid,coverageComplete:false},
    {...valid,sourceAuthenticated:false},
    {...valid,provider:'Unknown'},
    {...valid,observedAtUtc:'2027-03-20T11:40:00.000Z'},
    {...valid,observedAtUtc:'2027-03-20T12:02:00.000Z'},
    {...valid,observedAtUtc:'2027-02-30T11:59:00.000Z'},
    {...valid,observedAtUtc:'not a timestamp'},
    {provider:'TruckersMP',players:0},
    'untrusted',[],null
  ];
  for(const source of sources){
    const state=projectOptionalTracker(source,{nowMs:NOW});
    assert.equal(state.mode,'WITHOUT_MAP');
    assert.equal(state.provider,null);
    assert.equal(state.positionsIncluded,false);
  }
});
test('Map provider failure cannot turn optional tracker into a false capacity proof',()=>{
  assert.equal(projectOptionalTracker(valid,{nowMs:NaN}).mode,'WITHOUT_MAP');
  assert.equal(Object.isFrozen(projectOptionalTracker(valid,{nowMs:NOW})),true);
  assert.equal(Object.isFrozen(projectOptionalTracker(null,{nowMs:NOW})),true);
});

test('Throwing map provider getters and proxies cannot crash the map-free fallback',()=>{
  const throwing=Object.defineProperty({ ...valid },'mapAvailable',{
    enumerable:true,get(){throw new Error('UPSTREAM_PRIVATE_ERROR');}
  });
  const state=projectOptionalTracker(throwing,{nowMs:NOW});
  assert.equal(state.mode,'WITHOUT_MAP');
  const proxy=new Proxy({}, {getPrototypeOf(){throw new Error('PROVIDER_FAILED');}});
  assert.equal(projectOptionalTracker(proxy,{nowMs:NOW}).mode,'WITHOUT_MAP');
});
