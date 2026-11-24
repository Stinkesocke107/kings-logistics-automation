'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,apply,listForActor,validate}=require('../event-capacity-saved-filters');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const TIME='2027-03-20T12:00:00Z';
const actor=(id,roles=['Event Coordination'])=>({
  id,source:'trusted-server-gateway',verifiedRoles:roles
});
const ALICE=actor('111111111111111111');
const BOB=actor('222222222222222222',['Event Leadership']);
function change(s,cmd,a=ALICE){
  return apply(s,{expectedRevision:s.revision,...cmd},a,TIME);
}
test('Only privately authenticated staff may save a combined search filter',()=>{
  const initial=empty(SCOPE,TIME);
  const s=change(initial,{action:'save',id:'march-partners',
    title:'March Partners',
    filters:{dateFrom:'2027-03-01',dateTo:'2027-03-31',
      type:'Partner Convoy',conflict:'yes'}});
  assert.equal(initial.revision,0);
  assert.equal(s.revision,1);
  assert.equal(listForActor(s,ALICE).length,1);
  assert.deepEqual(listForActor(s,BOB),[]);
  assert.throws(()=>listForActor(s,actor(ALICE.id,[])));
  assert.throws(()=>change(s,{action:'save',id:'foo',title:'New',filters:{}},
    {...ALICE,source:'untrusted-client'}));
});
test('Maximum five per user, update same key and delete cannot bypass quota',()=>{
  let s=empty(SCOPE,TIME);
  for(let i=0;i<5;i++)s=change(s,{action:'save',id:'filter-'+i,
    title:'Filter '+i,filters:{type:'Partner Convoy'}});
  assert.equal(listForActor(s,ALICE).length,5);
  assert.throws(()=>change(s,{action:'save',id:'sixth',
    title:'More',filters:{type:'Partner Convoy'}}));
  s=change(s,{action:'save',id:'filter-0',title:'New name',filters:{status:'Pending'}});
  assert.equal(listForActor(s,ALICE)[0].title,'New name');
  s=change(s,{action:'delete',id:'filter-1'});
  assert.equal(listForActor(s,ALICE).length,4);
  assert.throws(()=>change(s,{action:'delete',id:'filter-1'}));
});
test('Personal searches of two users are isolated, even under same leadership access',()=>{
  let s=empty(SCOPE,TIME);
  s=change(s,{action:'save',id:'mine',title:'Alice Filter',
    filters:{quality:'Needs Verification'}});
  s=change(s,{action:'save',id:'mine',title:'Bob Filter',
    filters:{sort:'priority'}},BOB);
  assert.equal(listForActor(s,ALICE)[0].title,'Alice Filter');
  assert.equal(listForActor(s,BOB)[0].title,'Bob Filter');
  s=change(s,{action:'delete',id:'mine'},BOB);
  assert.equal(listForActor(s,BOB).length,0);
  assert.equal(listForActor(s,ALICE).length,1);
});
test('Unexpected filter fields and control character titles are rejected',()=>{
  const s=empty(SCOPE,TIME);
  assert.throws(()=>change(s,{action:'save',id:'id',title:'Untrusted\n@everyone',
    filters:{}}));
  assert.throws(()=>change(s,{action:'save',id:'id',title:'Valid',
    filters:{eventId:'inject;script'}}));
  assert.throws(()=>change(s,{action:'save',id:'id',title:'Valid',
    filters:{someExternalUrl:'https://secret.example'}}));
});
test('Optimistic revision checks and scope validation stop stale writes',()=>{
  let s=empty(SCOPE,TIME);
  s=change(s,{action:'save',id:'id',title:'Valid',filters:{}});
  assert.throws(()=>apply(s,{expectedRevision:0,action:'delete',id:'id'},ALICE,TIME));
  assert.throws(()=>validate(s,{guildId:'999999999999999999',forumId:SCOPE.forumId}));
  assert.equal(s.history.length,s.revision);
});
