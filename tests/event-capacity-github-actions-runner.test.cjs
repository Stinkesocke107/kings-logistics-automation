'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../scripts/event-capacity-github-actions');
const base={
  GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  KINGS_EVENT_CAPACITY_MODE:'preview'
};
test('Manual preview runs with zero credentials, roles and Discord setup',async()=>{
  const r=await main({...base});
  assert.deepEqual(r,{state:'Preview'});
});
test('GitHub PR, untrusted branches or unknown event cannot access private worker',async()=>{
  for(const env of [
    {...base,GITHUB_REF:'refs/heads/feature/event-capacity'},
    {...base,GITHUB_EVENT_NAME:'pull_request'},
    {...base,GITHUB_EVENT_NAME:'push'}
  ])await assert.rejects(main(env));
});
test('Scheduled mode is never allowed to write until CEO opt-in exists',async()=>{
  await assert.rejects(main({...base,GITHUB_EVENT_NAME:'schedule',
    KINGS_EVENT_CAPACITY_MODE:'sync',KINGS_EVENT_CAPACITY_ENABLED:'false'}));
});
test('Bootstrap cannot use the periodic schedule even with enabled flag',async()=>{
  await assert.rejects(main({...base,GITHUB_EVENT_NAME:'schedule',
    KINGS_EVENT_CAPACITY_MODE:'bootstrap',KINGS_EVENT_CAPACITY_ENABLED:'true'}));
});
