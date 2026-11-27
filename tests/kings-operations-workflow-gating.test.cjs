'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Optional Operations notices use finalized Convoy source and stay default disabled',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/convoy-checker.yml'),'utf8');
  const first=source.indexOf('id: kings_operations_notices');
  const last=source.indexOf('- name: Sync convoy overview to Discord',first);
  assert.ok(first>=0&&last>first,'Operations step must be inside existing Convoy workflow');
  const stage=source.slice(first,last);
  for(const precondition of [
    "steps.mode.outputs.dry_run != 'true'",
    "steps.convoy_stage_0.outcome == 'success'",
    "steps.convoy_stage_1.outcome == 'success'",
    "steps.convoy_stage_2.outcome == 'success'",
    "steps.convoy_completeness.outcome == 'success'",
    "steps.convoy_stage_8.outcome == 'success'"
  ])assert.ok(stage.includes(precondition),precondition);
  for(const secret of [
    'KINGS_OPERATIONS_NOTIFICATIONS_ENABLED',
    'KINGS_OPERATIONS_CHANNEL_ID',
    'KINGS_OPERATIONS_ALLOWED_ROLE_IDS',
    'SYSTEM_ALERTS_CHANNEL_ID','DISCORD_BOT_TOKEN'
  ])assert.ok(stage.includes('secrets.'+secret),secret);
  assert.match(stage,/run: node kings-operations-notifications\.js/);
  assert.match(stage,/steps\.kings_operations_notices\.outcome == 'failure'/);
  const notifier=fs.readFileSync(path.join(__dirname,'../kings-operations-notifications.js'),'utf8');
  assert.match(notifier,/!== 'ENABLED'/);
  assert.match(notifier,/status:'DISABLED'/);
  assert.match(notifier,/validatePrivateOperationsChannel/);
  assert.match(notifier,/Operations notice Discord readback failed/);
});
