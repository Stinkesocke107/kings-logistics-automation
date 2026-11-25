'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const yaml=fs.readFileSync(
  path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8'
);
test('manual Invitation Tracker check is source-only, does not accidentally publish daily Event reports',()=>{
  assert.match(yaml,/options:\s*\n\s*- invitation-check/);
  assert.match(yaml,/invitation_source_verify:\s*\n\s*if: .*inputs\.report == 'invitation-check'/);
  assert.match(yaml,/report:\s*\n\s*if: .*inputs\.report != 'invitation-check'/);
  assert.match(yaml,/node event-invitation-tracker-readonly-proof\.js/);
  assert.match(yaml,/contents: read/);
  assert.match(yaml,/DISCORD_INVITATION_TAG_IDS: \$\{\{ secrets\.DISCORD_INVITATION_TAG_IDS \}\}/);
  assert.doesNotMatch(yaml,/run: node event-invitation-tracker-tag-write/);
});
test('manual Invitation check does not grant permissions or create invitations',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../event-invitation-tracker-source.js'),'utf8');
  const probe=fs.readFileSync(path.join(__dirname,'../event-invitation-tracker-readonly-proof.js'),'utf8');
  assert.match(source,/method:'GET'/);
  assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
  assert.doesNotMatch(probe,/fetch\(.+method:\s*['"]POST/);
  assert.doesNotMatch(probe,/JSON\.stringify\(result\)/);
});
