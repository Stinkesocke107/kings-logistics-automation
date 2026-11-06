'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const workflow = name => fs.readFileSync(path.join(root,'.github','workflows',name+'.yml'),'utf8');

test('one common recovery scheduler covers live, convoy, driver, news and changelog jobs', () => {
  const s=workflow('central-scheduler');
  for (const name of ['live-tracker','driver-updates','convoy-checker','news','changelog','hr-leadership','staff-management','staff-leadership-live-overview','convoy-announcement-verifier','self-healing','probation','system-monitoring','news-production-verification']) {
    assert.ok(s.includes('dispatch_if_due '+name+'.yml '),name);
    assert.ok(s.includes(name+'.yml; do') || s.includes(' '+name+'.yml '),name+' active-check');
  }
  assert.doesNotMatch(s,/social-news\.yml/,'Retired publisher must not be dispatched');
  assert.match(s,/latest_completed_run/);
  assert.match(s,/observing \$\{cooldown_seconds\}-second recovery cooldown/);
  assert.ok(s.includes("dispatch_if_due probation.yml 10800 '' 1200 3600"));
  assert.ok(s.includes('local cooldown_seconds="${5:-300}"'));
  assert.doesNotMatch(s,/dispatch_if_due core-recovery\.yml/);
  assert.match(s,/dispatch_if_due staff-leadership-live-overview\.yml 4500/);
  assert.match(s,/dispatch_if_due convoy-announcement-verifier\.yml 7200/);
  assert.match(s,/dispatch_if_due self-healing\.yml 5400/);
  assert.match(s,/dispatch_if_due system-monitoring\.yml 4500/);
  assert.match(s,/dispatch_if_due news-production-verification\.yml 4500/);
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

test('delayed daily Loyalty schedule uses only live-mode, bounded recovery with a persisted completion proof', () => {
  const scheduler=workflow('central-scheduler');
  const achievements=workflow('driver-achievements');
  assert.match(scheduler,/recover_missed_daily_loyalty\(\)/);
  assert.match(scheduler,/data\/driver-loyalty-roles-summary\.json/);
  assert.match(scheduler,/last_epoch" -ge "\$due"/);
  assert.match(scheduler,/due \+ 3600/);
  assert.match(scheduler,/active_managed_run "\$snapshot"/);
  assert.match(scheduler,/latest_completed_run "\$snapshot"/);
  assert.ok(scheduler.includes('-f "inputs[role_sync_mode]=live"'), 'Fallback must not default to manual dry-run');
  assert.match(scheduler,/dispatch_if_due news-production-verification\.yml 4500\s+recover_missed_daily_loyalty/);
  assert.match(achievements,/DRIVER_LOYALTY_ROLE_MODE: \$\{\{ steps\.loyalty_mode\.outputs\.mode \}\}/);
  assert.match(achievements,/if \[ "\$GITHUB_EVENT_NAME" = "schedule" \]; then[\s\S]*?MODE="live"/);
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

test('TruckersMP News and Changelog remain visible in the registry without critical severity', () => {
  const {SCHEDULED_WORKFLOWS} = require('../kings-workflow-registry.js');
  const monitor=fs.readFileSync(path.join(root,'system-monitoring.js'),'utf8');
  assert.match(monitor,/const WORKFLOWS = SCHEDULED_WORKFLOWS/);
  for(const name of ['news','changelog']){
    const item=SCHEDULED_WORKFLOWS.find(item=>item.file===name+'.yml');
    assert.ok(item,name+' is monitored');
    assert.equal(item.severity,'warning',name);
  }
});

test('Discord rate-limit retry creates a fresh timeout per attempt and HR does not impose one abort signal over all waits', async () => {
  const {discordResilientFetch} = require('../kings-branding.js');
  const source = fs.readFileSync(path.join(root,'hr-probation.js'),'utf8');
  assert.doesNotMatch(source,/signal:\s*AbortSignal\.timeout\(15000\)/);
  const attempts=[];
  const result=await discordResilientFetch(async (_url,init) => {
    attempts.push(init.signal);
    return attempts.length===1
      ? new Response('rate limited',{status:429,headers:{'retry-after':'0'}})
      : new Response('{}',{status:200});
  },'https://discord.com/api/v10/channels/123/messages',{method:'GET'});
  assert.equal(result.status,200);
  assert.equal(attempts.length,2);
  assert.ok(attempts.every(s=>s instanceof AbortSignal));
  assert.notEqual(attempts[0],attempts[1]);
});

test('Probation scheduler recovery may only run the existing advisory-only HR script, not personnel actions', () => {
  const source=fs.readFileSync(path.join(root,'probation.js'),'utf8');
  const flow=workflow('probation');
  assert.match(source,/Safety guard blocked Discord write/);
  assert.ok(source.includes('const allowedWrite ='));
  assert.ok(source.includes('method === "POST"'));
  assert.ok(source.includes('post an advisory reminder'));
  assert.match(flow,/run: node probation\.js/);
  assert.match(flow,/cancel-in-progress: false/);
  assert.match(workflow('central-scheduler'),/dispatch_if_due probation\.yml 10800 '' 1200 3600/);
});

test('missed TruckersMP publication verification is restarted separately from the working news fetcher',()=>{
 const code=workflow('news-production-verification');
 const scheduler=workflow('central-scheduler');
 assert.match(code,/workflow_dispatch:/);
 assert.match(code,/run: node news-production-verifier\.js/);
 assert.ok(scheduler.includes('dispatch_if_due news-production-verification.yml 4500'));
 assert.doesNotMatch(code,/post_latest_test=true/);
});
