'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('New historical evidence journal is isolated from all scheduled and manual live event workflows',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const evidence=fs.readFileSync(path.join(root,
    'event-capacity-historical-lifecycle-journal.js'),'utf8');
  assert.doesNotMatch(runner,/require\(['"]\.\.\/event-capacity-historical-lifecycle-journal['"]\)/);
  assert.doesNotMatch(workflow,/historical-lifecycle-journal/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_IMPORT_ENABLED/);
  assert.match(evidence,/historicalCoverageCertified:false/);
  assert.match(evidence,/freeSlotsCertified:false/);
  assert.match(evidence,/signHistoricalTransitionOffline/);
  assert.doesNotMatch(evidence,/discord\.com|hooks\.slack\.com|process\.env\.DISCORD_BOT_TOKEN/);
});

test('Private encrypted history archive remains offline and cannot change live capacity',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const archive=fs.readFileSync(path.join(root,
    'event-capacity-historical-encrypted-archive.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-encrypted-archive/);
  assert.doesNotMatch(workflow,/event-capacity-historical-encrypted-archive/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_ARCHIVE_ENABLED/);
  assert.match(archive,/historicalCoverageCertified:false/);
  assert.match(archive,/freeSlotsCertified:false/);
  assert.match(archive,/verifyHistoricalJournal/);
  assert.doesNotMatch(archive,/DISCORD_BOT_TOKEN|fetch\(|discord\.com|process\.env/);
});
