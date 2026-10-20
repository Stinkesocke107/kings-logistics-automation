'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const workflow = name => fs.readFileSync(path.join(root,'.github','workflows',name+'.yml'),'utf8');

test('one common recovery scheduler covers live, convoy, driver, news, YouTube and changelog jobs', () => {
  const s=workflow('central-scheduler');
  for (const name of ['live-tracker','driver-updates','convoy-checker','news','social-news','changelog','hr-leadership','staff-management']) {
    assert.ok(s.includes('dispatch_if_due '+name+'.yml '),name);
    assert.ok(s.includes(name+'.yml; do') || s.includes(' '+name+'.yml '),name+' active-check');
  }
  assert.match(s,/social-news\.yml[\s\S]*inputs\[verify_connections_only\]=false[\s\S]*inputs\[post_latest_test\]=false/);
  assert.match(s,/latest_completed_run/);
  assert.match(s,/observing 5-minute recovery cooldown/);
  assert.doesNotMatch(s,/if \[ "\$GITHUB_EVENT_NAME" = "push" \]; then\s*force_all=true/);
});

test('central scheduler recovery script is valid Bash and reads each producer snapshot once', () => {
  const s=workflow('central-scheduler');
  const pos=s.indexOf('      - name: Run one resilient scheduler pass');
  const begin=s.indexOf('        run: |\n',pos);
  const end=s.indexOf('\n      - name: Scheduler summary',begin);
  assert.ok(pos>=0 && begin>pos && end>begin);
  const script=s.slice(begin+'        run: |\n'.length,end).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
  const check=spawnSync('bash',['-n'],{input:script,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  assert.equal((script.match(/snapshot="\$\(managed_run_snapshot "\$workflow"\)"/g)||[]).length,1);
});

test('verification follows successful real producers, with independent hourly fallback', () => {
  const news=workflow('news-production-verification');
  const convoy=workflow('convoy-announcement-verifier');
  assert.match(news,/workflow_run:\s*\n\s*workflows: \["Kings TruckersMP News"\]/);
  assert.match(news,/conclusion == 'success'/);
  assert.match(news,/cron: '11 \* \* \* \*'/);
  assert.match(convoy,/workflow_run:\s*\n\s*workflows: \["Kings Convoy Checker"\]/);
  assert.match(convoy,/contains\(github\.event\.workflow_run\.display_title, '\(live\)'\)/);
  assert.match(convoy,/cron: '14 \* \* \* \*'/);
});

test('News, YouTube and Changelog remain visible in monitoring without claiming core outages on third-party RSS errors', () => {
  const monitor=fs.readFileSync(path.join(root,'system-monitoring.js'),'utf8');
  for(const name of ['news','social-news','changelog']){
    assert.ok(monitor.includes("file: '"+name+".yml'"),name);
    assert.match(monitor,new RegExp("file: '"+name+"\\.yml'[^\\n]*severity: 'warning'"));
  }
});
