'use strict';
// Prelaunch static audit only: checks existing GitHub workflow wiring but
// CANNOT prove live Discord availability, token validity or authorization.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function load(file){return fs.readFileSync(path.join(__dirname,'..',file),'utf8');}
const workflow=load('.github/workflows/convoy-checker.yml');
const offline=load('.github/workflows/system-tests.yml');
const checker=load('convoy-checker.js');
const overview=load('convoy-overview.js');
test('Operational Convoy workflow remains gated to main, not to draft Event Capacity PR',()=>{
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(offline,/pull_request:/);
  assert.match(offline,/contents: read/);
});
test('Existing Convoy read stage disables Discord writes during initial Discord source fetch',()=>{
  assert.match(workflow,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(workflow,/- name: Run convoy checker/);
  assert.match(workflow,/run: node convoy-checker\.js/);
});
test('Convoy Center uses one Guild and its configured forum in existing scripts and workflow',()=>{
  assert.match(workflow,/DISCORD_GUILD_ID: '1114967437788577792'/);
  assert.match(workflow,/DISCORD_CONVOY_FORUM_ID: '1550619824005062697'/);
  assert.match(checker,/1550619824005062697/);
  assert.match(overview,/1550619824005062697/);
});
test('Current original Convoy Center reader has a paginated public archived thread path',()=>{
  assert.match(checker,/threads\/archived\/public/);
  assert.match(checker,/has_more/);
  assert.match(checker,/getThreadMessages/);
  // This only checks source code. Deleted or inaccessible history is not recovered.
});
test('Original frozen older legacy calendar is loaded separately by existing Convoy Overview',()=>{
  assert.match(overview,/data\/legacy-convoys\.json/);
  assert.match(overview,/loadLegacyConvoys/);
  assert.match(overview,/legacyImportedConvoys/);
});
test('Scheduled Convoy Checker workflow is configured, but this says nothing about live success',()=>{
  assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow,/timeout-minutes: 10/);
  assert.match(workflow,/node convoy-completeness\.js/);
});
test('Actual Event Capacity on the shared runner is optional and disabled unless explicit variables or choice',()=>{
  assert.match(workflow,/default: "off"/);
  assert.match(workflow,/vars\.KINGS_EVENT_CAPACITY_ENABLED == 'true'/);
  assert.match(workflow,/inputs\.capacity_action == 'preview'/);
  assert.match(workflow,/inputs\.capacity_action == 'bootstrap'/);
  assert.match(workflow,/inputs\.capacity_action == 'sync'/);
});
test('Existing Convoy automation writes and sends are distinct from GitHub-only offline test workflow',()=>{
  assert.match(workflow,/Run convoy checker/);
  assert.match(workflow,/Sync convoy overview to Discord/);
  assert.match(workflow,/Send one-time convoy notifications/);
  assert.match(workflow,/Archive finished convoy threads/);
  assert.doesNotMatch(offline,/secrets\.DISCORD_BOT_TOKEN/);
  assert.match(offline,/permissions:\s*\n\s*contents: read/);
});
test('Existing workflow uploads only short-lived reports, not an independently complete 24-month archive',()=>{
  assert.match(workflow,/name: kings-convoy-reports/);
  assert.match(workflow,/retention-days: 14/);
  assert.match(workflow,/output\/convoy-check-results\.json/);
  assert.match(workflow,/output\/convoy-overview\.json/);
  assert.doesNotMatch(workflow,/retention-days: 730/);
});
test('A separate dry-run mode exists; this static test cannot determine actual bot reachability',()=>{
  assert.match(workflow,/default: "dry-run"/);
  assert.match(workflow,/CONVOY_DRY_RUN:/);
  assert.match(workflow,/Dry-run safety summary/);
  assert.match(workflow,/Convoy checker writes were disabled/);
});
test('New cross-system modules do not appear in the already deployed shared Convoy production job',()=>{
  for(const name of [
    'event-capacity-prelaunch-diagnostics',
    'event-capacity-convoy-multi-source-intake',
    'event-capacity-convoy-system-calendar-bridge',
    'event-capacity-frozen-legacy-calendar-audit'
  ])assert.equal(workflow.includes(name),false);
});
test('PR verification never claims that executing offline tests also connects to live Discord',()=>{
  assert.match(offline,/node --test tests\/\*\.test\.cjs/);
  assert.match(offline,/No Discord\/Staff\/private-store secret and no artifact downloads/);
  assert.match(offline,/live GitHub metadata preflight/);
  assert.doesNotMatch(offline,/run: node convoy-checker\.js/);
});
