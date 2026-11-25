'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('Only offline system verification workflow gains a manual read-only capacity flag',()=>{
  const wf=fs.readFileSync(path.join(root,'.github/workflows/system-tests.yml'),'utf8');
  const live=fs.readFileSync(path.join(root,'.github/workflows/convoy-checker.yml'),'utf8');
  const preview=fs.readFileSync(path.join(root,'event-capacity-readonly-preview.js'),'utf8');
  assert.match(wf,/capacity_preview:\n\s+description:/);
  assert.match(wf,/default: false/);
  assert.match(wf,/actions: read/);
  assert.match(wf,/contents: read/);
  assert.match(wf,/inputs.capacity_preview == true/);
  assert.match(wf,/github.event.pull_request.head.repo.full_name == github.repository/);
  assert.match(wf,/node event-capacity-readonly-preview\.js/);
  assert.doesNotMatch(wf,/DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(wf,/KINGS_EVENT_CAPACITY_ENABLED/);
  assert.doesNotMatch(wf,/KINGS_EVENT_CAPACITY_PRIVATE_/);
  assert.doesNotMatch(preview,/\/actions\/artifacts\//);
  assert.doesNotMatch(preview,/discord\.com|discordapp\.com/);
  assert.match(preview,/githubMetadataOnly:true/);
  assert.match(preview,/freeSlotsCertified:false/);
  assert.match(live,/name: Kings Convoy Checker/);
  assert.doesNotMatch(live,/capacity_preview/);
  assert.equal(fs.existsSync(path.join(root,
    '.github/workflows/event-capacity-readonly-preview.yml')),false);
});
