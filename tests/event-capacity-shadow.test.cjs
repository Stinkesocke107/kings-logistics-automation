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

test('Shadow loads only encrypted authenticated decisions from protected external file',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const os=require('node:os');
  const {createEmptyLedger,applyDecision,sealLedger}=require('../event-capacity-decision-ledger');
  const {loadPrivateDecisions}=require('../event-capacity-shadow');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kings-ledger-test-'));
  const file=path.join(temp,'private-state.json');
  const scope={guildId:'1114967437788577792',forumId:'1550619824005062697'};
  const key='synthetic-development-key-only-with-more-than-32-characters';
  try{
    let state=createEmptyLedger(scope,'2027-03-20T12:00:00Z');
    state=applyDecision(state,{ref:'event:1234',action:'classification',
      value:'Partner Convoy',expectedRevision:0,evidenceRef:'proof-in-private-store'},
      {id:'synthetic-user-id',source:'trusted-server-gateway',verifiedRoles:['Event Coordination']},
      '2027-03-20T12:00:00Z');
    fs.writeFileSync(file,JSON.stringify(sealLedger(state,key)));
    const env={
      KINGS_EVENT_CAPACITY_PRIVATE_DECISIONS_PATH:file,
      KINGS_EVENT_CAPACITY_STATE_KEY:key,
      DISCORD_GUILD_ID:scope.guildId,DISCORD_CONVOY_FORUM_ID:scope.forumId
    };
    const decisions=loadPrivateDecisions(env);
    assert.equal(decisions['event:1234'].eventType,'Partner Convoy');
    assert.equal(decisions['event:1234'].approved,true);
    assert.throws(()=>loadPrivateDecisions({...env,KINGS_EVENT_CAPACITY_STATE_KEY:'wrong-dedicated-key-with-more-than-32-characters'}));
    assert.throws(()=>loadPrivateDecisions({...env,DISCORD_GUILD_ID:'999999999999999999'}));
    fs.writeFileSync(file,JSON.stringify(state));
    assert.throws(()=>loadPrivateDecisions(env),'Plaintext private state must be rejected');
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
