'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.join(__dirname,'..',
  '.github/workflows/convoy-checker.yml'),'utf8');
function scheduledMinutes(){
  const values=[...workflow.matchAll(/^\s+- cron: '([^']+)'$/gm)];
  assert.equal(values.length,1,'One deliberately reviewed scheduled trigger');
  const parts=values[0][1].split(' ');
  assert.equal(parts.length,5);
  assert.equal(parts.slice(1).join(' '),'* * * *');
  return parts[0].split(',').map(Number);
}
test('Offset 15-minute schedule has four distinct UTC runs per hour',()=>{
  const minutes=scheduledMinutes();
  assert.deepEqual(minutes,[7,22,37,52]);
  assert.equal(new Set(minutes).size,4);
  for(const n of minutes)assert.ok(Number.isInteger(n)&&n>=0&&n<60);
  for(let i=1;i<4;i++)assert.equal(minutes[i]-minutes[i-1],15);
  assert.equal(60-minutes[3]+minutes[0],15);
});
test('Schedule never fires at 00/15/30/45 high-load moments',()=>{
  for(const n of scheduledMinutes())assert.notEqual(n%15,0);
  assert.equal(workflow.includes("cron: '*/15 * * * *'"),false);
});
test('Still restricted to default main branch and existing scheduled production path',()=>{
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/GITHUB_EVENT_NAME" = "schedule"/);
  assert.match(workflow,/DRY_RUN="false"/);
  assert.match(workflow,/run: node convoy-checker\.js/);
  assert.match(workflow,/name: kings-convoy-reports/);
});
test('No second schedule, workflow, permission scope or new Event write path',()=>{
  assert.match(workflow,/permissions:\n  contents: write/);
  assert.match(workflow,/group: kings-convoy-checker\n  cancel-in-progress: false/);
  assert.doesNotMatch(workflow,/repository_dispatch:|workflow_run:|pull_request:/);
  assert.doesNotMatch(workflow,/capacity_source_pilot|source-preflight/);
  assert.equal(scheduledMinutes().length,4);
});
test('Existing Convoy write guard and safe failure rules remain in place',()=>{
  assert.match(workflow,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(workflow,/continue-on-error: true/);
  assert.match(workflow,/Require convoy completeness/);
  assert.match(workflow,/Require successful convoy stages/);
  assert.match(workflow,/bash scripts\/git-safe-push\.sh main/);
});
