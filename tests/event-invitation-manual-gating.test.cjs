'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('The public Offline System Verification stays token-free on PRs and pushes',()=>{
  const yml=read('.github/workflows/system-tests.yml');
  assert.doesNotMatch(yml,/DISCORD_BOT_TOKEN|KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID/);
  assert.doesNotMatch(yml,/event-invitation-readonly-probe\.js/);
  assert.doesNotMatch(yml,/invitation_readonly_probe/);
});
test('Invitation source can only be requested in existing Convoy Checker manual dry-run with capacity off',()=>{
  const yml=read('.github/workflows/convoy-checker.yml');
  assert.match(yml,/invitation_readonly_probe:\s*\n[\s\S]{0,220}default: false/);
  const lines=yml.split('\n');
  const idx=lines.findIndex(x=>x.includes('name: Kings Event Invitation source GET-only preflight'));
  assert.ok(idx>0);
  const section=lines.slice(idx,idx+18).join('\n');
  for(const guard of [
    "github.event_name == 'workflow_dispatch'",
    "github.ref == 'refs/heads/main'",
    "inputs.mode == 'dry-run'",
    "inputs.capacity_action == 'off'",
    "inputs.invitation_readonly_probe == true",
    'KINGS_INVITATION_CONVOY_MODE:',
    'run: node scripts/event-invitation-readonly-probe.js'
  ])assert.ok(section.includes(guard),guard);
  assert.doesNotMatch(section,/continue-on-error:\s*true/);
});
test('No additional Github Actions schedule or workflow is introduced for Invitation review',()=>{
  const yamlFiles=fs.readdirSync(path.join(root,'.github/workflows')).filter(x=>x.endsWith('.yml'));
  assert.equal(yamlFiles.length,44);
  assert.equal(yamlFiles.some(x=>/invitation/.test(x)),false);
  const node=read('scripts/event-invitation-readonly-probe.js');
  assert.match(node,/KINGS_INVITATION_CONVOY_MODE!=='dry-run'/);
  assert.match(node,/GITHUB_EVENT_NAME!=='workflow_dispatch'/);
  assert.match(node,/method:'GET'/);
  assert.match(node,/redirect:'error'/);
});
