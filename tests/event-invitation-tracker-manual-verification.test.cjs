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

test('manual integrated source proof also checks actual stored Event dashboard, without public source export',()=>{
  const job=yaml.slice(yaml.indexOf('  event_integrated_source_verify:'),
    yaml.indexOf('\n  report:',yaml.indexOf('  event_integrated_source_verify:')));
  assert.match(job,/inputs\.report == 'integration-check'/);
  assert.match(job,/continue-on-error: \$\{\{ github\.event_name == 'push' \}\}/);
  assert.match(job,/node event-operations-integrated-readonly-proof\.js/);
  assert.match(job,/node event-review-dashboard-readonly-proof\.js/);
  assert.ok(job.indexOf('event-operations-integrated-readonly-proof.js')<
    job.lastIndexOf('event-review-dashboard-readonly-proof.js'));
  assert.match(job,/DRIVER_STATE_KEY: \$\{\{ secrets\.DRIVER_STATE_KEY \}\}/);
  assert.match(job,/DISCORD_BOT_TOKEN: \$\{\{ secrets\.DISCORD_BOT_TOKEN \}\}/);
  assert.match(job,/contents: read/);
  assert.doesNotMatch(job,/run: node leadership-dashboard\.js/);
  assert.doesNotMatch(job,/git push|gh workflow run|POST|PATCH|DELETE/);
});
