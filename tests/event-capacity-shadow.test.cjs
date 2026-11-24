'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../event-capacity-shadow');
test('Shadow output is aggregate-only and contains no private IDs or raw event text',()=>{
  const original={
    adapter:{dataFresh:false,counts:{center:1,legacy:1,pendingVerification:2},issues:[
      {code:'unverified-classification',ref:'event:31337',personal:'secret'}
    ]},
    capacity:{counted:1,pending:[{id:'event:33001',name:'private title'}],
      issues:[{code:'end-time-unknown',id:'event:31337'}],
      warnings:[{code:'meeting-end-overlap',first:'event:31337',second:'event:33001'}],
      globalUncertainty:true,uncertainDates:['2027-03-20','2027-03-21']}
  };
  const output=summarize(original);
  const printed=JSON.stringify(output);
  assert.equal(output.sourceVerifiedFresh,false);
  assert.equal(output.acceptedCount,1);
  assert.equal(output.pendingCount,1);
  assert.equal(output.uncertainUtcDayCount,2);
  assert.equal(output.issueTypes['end-time-unknown'],1);
  assert.equal(output.warningTypes['meeting-end-overlap'],1);
  for(const secret of ['31337','33001','2027-03-20','private title','secret']){
    assert.equal(printed.includes(secret),false);
  }
  assert.equal(output.liveDeployment,false);
});
