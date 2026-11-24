'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/convoy-checker.yml'),'utf8');
test('Hosting-free event capacity uses existing registered 15-minute workflow only',()=>{
  assert.match(workflow,/cron:\s*'\*\/15 \* \* \* \*'/);
  assert.match(workflow,/name: Kings Event Capacity \(GitHub-only opt-in\)/);
  assert.equal(fs.existsSync(path.join(root,
    '.github/workflows/kings-event-capacity-github-only.yml')),false);
});
test('Discord publishing remains opt-in with manual preview and off default',()=>{
  assert.match(workflow,/capacity_action:/);
  assert.match(workflow,/capacity_action:[\s\S]*?default:\s*"off"/);
  assert.match(workflow,/vars\.KINGS_EVENT_CAPACITY_ENABLED == 'true'/);
  assert.match(workflow,/inputs\.capacity_action == 'preview'/);
  assert.match(workflow,/inputs\.capacity_action == 'bootstrap'/);
  assert.match(workflow,/continue-on-error: true[\s\S]*?event_capacity_github_only/);
});
test('GitHub host receives only configured identities and existing bot secret',()=>{
  assert.match(workflow,/actions:\s*read/);
  assert.match(workflow,/KINGS_EVENT_CAPACITY_CHANNEL_ID/);
  assert.match(workflow,/KINGS_EVENT_CAPACITY_MESSAGE_ID/);
  assert.match(workflow,/KINGS_EVENT_COORDINATION_ROLE_ID/);
  assert.match(workflow,/KINGS_EVENT_LEADERSHIP_ROLE_ID/);
  assert.match(workflow,/KINGS_EVENT_CEO_ROLE_ID/);
  assert.match(workflow,/secrets\.DISCORD_BOT_TOKEN/);
  assert.match(workflow,/scripts\/event-capacity-github-actions\.js/);
});
