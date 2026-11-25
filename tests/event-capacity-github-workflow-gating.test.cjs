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
  assert.match(workflow,/KINGS_EVENT_CAPACITY_COMMANDS_ENABLED/);
  assert.match(workflow,/KINGS_EVENT_CAPACITY_EVIDENCE_ENABLED/);
  assert.match(workflow,/event-capacity-github-decision-evidence\.test\.cjs/);
  assert.match(workflow,/event-capacity-github-staff-commands\.test\.cjs/);
  assert.match(workflow,/KINGS_EVENT_COORDINATION_ROLE_ID/);
  assert.match(workflow,/KINGS_EVENT_LEADERSHIP_ROLE_ID/);
  assert.match(workflow,/KINGS_EVENT_CEO_ROLE_ID/);
  assert.match(workflow,/secrets\.DISCORD_BOT_TOKEN/);
  assert.match(workflow,/scripts\/event-capacity-github-actions\.js/);
});

test('New monthly historical analysis cannot silently activate live capacity or staff decisions',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  assert.doesNotMatch(runner,/require\(['"]\.\.\/event-capacity-github-monthly-coverage['"]\)/);
  assert.doesNotMatch(runner,/require\(['"]\.\.\/event-capacity-owner-controlled-commit['"]\)/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_MONTHLY_COVERAGE_ENABLED/);
  assert.match(workflow,/vars\.KINGS_EVENT_CAPACITY_ENABLED == 'true'/);
  assert.match(workflow,/inputs\.capacity_action == 'preview'/);
  const analysis=fs.readFileSync(path.join(root,
    'event-capacity-github-monthly-coverage.js'),'utf8');
  assert.match(analysis,/freeSlotsCertified:false/);
  assert.match(analysis,/historicalCoverageCertified:false/);
});

test('PR-only live preflight uses the current offline verification workflow and never touches Discord',()=>{
  const offline=fs.readFileSync(path.join(root,
    '.github/workflows/system-tests.yml'),'utf8');
  const preflight=fs.readFileSync(path.join(root,
    'event-capacity-github-live-preflight.js'),'utf8');
  assert.match(offline,/actions:\s*read/);
  assert.match(offline,/name: Kings Event Capacity safe PR live GitHub metadata preflight/);
  assert.match(offline,/github\.event\.pull_request\.number == 143/);
  assert.match(offline,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(offline,/KINGS_EVENT_CAPACITY_PREFLIGHT_ONLY: 'true'/);
  assert.match(offline,/run: node event-capacity-github-live-preflight\.js/);
  assert.doesNotMatch(offline,/DISCORD_BOT_TOKEN:/);
  assert.doesNotMatch(offline,/KINGS_EVENT_CAPACITY_PRIVATE_DATA_TOKEN:/);
  assert.match(preflight,/artifactsDownloaded:false/);
  assert.match(preflight,/discordContacted:false/);
  assert.match(preflight,/repositoryWritten:false/);
  assert.match(preflight,/freeSlotsCertified:false/);
  assert.equal(fs.existsSync(path.join(root,
    '.github/workflows/kings-event-capacity-live-preview.yml')),false);
});

test('Optional live-map status cannot activate the production Event Capacity runner',()=>{
  const runner=fs.readFileSync(path.join(root,'scripts/event-capacity-github-actions.js'),'utf8');
  const dashboard=fs.readFileSync(path.join(root,'event-capacity-dashboard.js'),'utf8');
  const optional=fs.readFileSync(path.join(root,'event-capacity-optional-tracker.js'),'utf8');
  assert.match(dashboard,/projectOptionalTracker\(trackerSource/);
  assert.match(optional,/mode:'WITHOUT_MAP'/);
  assert.match(optional,/capacityIndependent:true/);
  assert.doesNotMatch(runner,/event-capacity-optional-tracker/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_LIVE_MAP_ENABLED/);
});
