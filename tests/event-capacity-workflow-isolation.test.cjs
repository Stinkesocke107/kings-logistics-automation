'use strict';
// Structural guard: capacity-only manual dispatch must run no Convoy stage.
// This deliberately tests the actual existing workflow (not a second
// synthetic isolated runner) without contacting real Discord or GitHub.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.join(__dirname,'..',
  '.github/workflows/convoy-checker.yml'),'utf8');
const base=path.join(__dirname,'..');
function step(name){
  const needle='      - name: '+name+'\n';
  const idx=workflow.indexOf(needle);
  assert.ok(idx>=0,'Missing workflow stage '+name);
  assert.equal(workflow.lastIndexOf(needle),idx,
    'Duplicate workflow stage '+name);
  const stop=workflow.indexOf('      - name: ',idx+needle.length);
  return workflow.slice(idx,stop<0?undefined:stop);
}
function condition(name){
  const block=step(name);
  const m=block.match(/^        if: (.*)$/m);
  assert.ok(m,'Missing if guard for '+name);
  return m[1];
}
const OPERATIONS=[
  'Verify convoy safety engines',
  'Run convoy checker',
  'Auto-fill convoy data from TruckersMP Event ID',
  'Finalize TruckersMP data and Kings overrides',
  'Audit imminent approved convoy reminder eligibility (read-only, no messages)',
  'Send one-time convoy notifications',
  'Handle post-convoy follow-up',
  'Check internal Convoy Driver reminders',
  'Check Kings-only convoy announcements',
  'Archive finished convoy threads',
  'Verify convoy completeness',
  'Persist healthy convoy count baseline',
  'Generate convoy overview statistics',
  'Notify Event Leadership about new planning conflicts',
  'Persist sent planning alert keys',
  'Sync convoy overview to Discord',
  'Dry-run safety summary',
  'Upload convoy reports',
  'Save API Health State',
  'Require successful convoy planning notification and persistence',
  'Require convoy completeness',
  'Require successful convoy stages'
];
test('Manual preview/preflight/bootstrap/sync runs with zero Convoy operational stages',()=>{
  for(const name of OPERATIONS){
    const guarded=condition(name);
    assert.match(guarded,/steps\.mode\.outputs\.capacity_only != 'true'/,
      'Missing skip condition for '+name);
  }
  assert.equal(OPERATIONS.length,22);
});
test('Every security-sensitive operational shell is skipped in capacity-only mode',()=>{
  const noWrites=[
    'Run convoy checker','Send one-time convoy notifications',
    'Finalize TruckersMP data and Kings overrides',
    'Handle post-convoy follow-up','Check internal Convoy Driver reminders',
    'Check Kings-only convoy announcements','Archive finished convoy threads',
    'Persist healthy convoy count baseline',
    'Notify Event Leadership about new planning conflicts',
    'Persist sent planning alert keys','Sync convoy overview to Discord',
    'Save API Health State'
  ];
  for(const name of noWrites)assert.match(condition(name),/capacity_only != 'true'/);
});
test('Manual capacity-only mode is selected before live mode and forced dry-run',()=>{
  const mode=step('Determine convoy run mode');
  assert.match(mode,/GITHUB_EVENT_NAME" = "workflow_dispatch"/);
  assert.match(mode,/CAPACITY_ACTION" =~ \^\(preview\|preflight\|bootstrap\|sync\)\$/);
  const chosen=mode.indexOf('CAPACITY_ONLY="true"');
  const realLive=mode.indexOf('REQUESTED_MODE" = "live"');
  assert.ok(chosen>=0&&realLive>chosen);
  assert.match(mode,/CAPACITY_ONLY="true"\n            DRY_RUN="true"/);
  assert.match(mode,/echo "capacity_only=\$CAPACITY_ONLY"/);
  assert.match(mode,/elif \[ "\$GITHUB_EVENT_NAME" = "schedule" \]; then\s+DRY_RUN="false"/);
  assert.match(mode,/elif \[ "\$GITHUB_EVENT_NAME" = "push" \]/);
});
test('Event Capacity step still runs for the four explicitly requested actions',()=>{
  const block=step('Kings Event Capacity (GitHub-only opt-in)');
  assert.match(block,/github\.event_name == 'schedule'/);
  assert.match(block,/inputs\.capacity_action == 'preview'/);
  assert.match(block,/inputs\.capacity_action == 'preflight'/);
  assert.match(block,/inputs\.capacity_action == 'bootstrap'/);
  assert.match(block,/inputs\.capacity_action == 'sync'/);
  assert.match(block,/KINGS_EVENT_CAPACITY_ENABLED == 'true'/);
  assert.match(block,/CONVOY_DRY_RUN: .*steps\.mode\.outputs\.dry_run/);
  assert.match(block,/node scripts\/event-capacity-github-actions\.js/);
});
test('A manually invoked failed preflight, preview, bootstrap or sync cannot be green',()=>{
  const preflight=step('Require private Event Capacity preflight readiness when explicitly requested');
  const other=step('Require manually requested Event Capacity publication outcome');
  assert.match(preflight,/PREFLIGHT_OUTCOME" != "success"/);
  assert.match(other,/CAPACITY_OUTCOME" != "success"/);
  for(const action of ['preview','bootstrap','sync'])
    assert.ok(other.includes("inputs.capacity_action == '"+action+"'"));
  assert.match(preflight,/exit 1/);
  assert.match(other,/exit 1/);
});
test('Manual capacity-only outcome is distinct from regular Convoy dry-run reporting',()=>{
  assert.match(condition('Event Capacity capacity-only summary'),
    /capacity_only == 'true'/);
  assert.match(condition('Dry-run safety summary'),
    /capacity_only != 'true'/);
  assert.match(step('Event Capacity capacity-only summary'),
    /no Convoy operational stages were run/);
});
test('Existing scheduled/live Convoy system and trigger remain configured',()=>{
  assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/concurrency:\n  group: kings-convoy-checker/);
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/event_name == 'workflow_dispatch'/);
  assert.match(workflow,/run-name: Kings Convoy Checker \(\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.capacity_action/);
  assert.match(workflow,/KINGS_EVENT_CAPACITY_MODE:/);
});
test('Preflight helper and runner remain detached from production Convoy implementation',()=>{
  const convoy=fs.readFileSync(path.join(base,'convoy-checker.js'),'utf8');
  assert.equal(convoy.includes('event-capacity-private-channel-preflight'),false);
  const helper=fs.readFileSync(path.join(base,
    'event-capacity-private-channel-preflight.js'),'utf8');
  assert.doesNotMatch(helper,/https?:\/\/discord\.com|process\.env|fetch\(|POST|PATCH/);
  const runner=fs.readFileSync(path.join(base,
    'scripts/event-capacity-github-actions.js'),'utf8');
  assert.match(runner,/mode==='preflight'/);
  assert.match(runner,/inspectKingsPrivateEventCapacityChannel/);
});
