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

test('Manual Discord preflight cannot run as live Convoy job and does not require write opt-in',async()=>{
  await assert.rejects(main({...base,KINGS_EVENT_CAPACITY_MODE:'preflight',
    CONVOY_DRY_RUN:'false',KINGS_EVENT_CAPACITY_ENABLED:'false'}));
  await assert.rejects(main({...base,KINGS_EVENT_CAPACITY_MODE:'preflight',
    GITHUB_EVENT_NAME:'schedule',CONVOY_DRY_RUN:'true'}));
  await assert.rejects(main({...base,KINGS_EVENT_CAPACITY_MODE:'preflight',
    CONVOY_DRY_RUN:'true'}));
  // No real Discord token or destination provided; fail safely.
});

test('Source-preflight is manual main-only and always forced dry-run, no write enable needed',async()=>{
  const mode='source-preflight';
  for(const env of [
    {...base,KINGS_EVENT_CAPACITY_MODE:mode,CONVOY_DRY_RUN:'false'},
    {...base,KINGS_EVENT_CAPACITY_MODE:mode,GITHUB_EVENT_NAME:'schedule',
      CONVOY_DRY_RUN:'true'},
    {...base,KINGS_EVENT_CAPACITY_MODE:mode,CONVOY_DRY_RUN:'true',
      GITHUB_REF:'refs/heads/feature/event-capacity'},
    {...base,KINGS_EVENT_CAPACITY_MODE:mode,CONVOY_DRY_RUN:'true'}
  ])await assert.rejects(main(env));
  // The last case is rejected for missing GitHub source credentials, not
  // because any Discord secret or the writes ENABLED variable was required.
});
