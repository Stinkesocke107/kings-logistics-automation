'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const draft=[
  'event-capacity-staged-source-handoff-review.js',
  'event-capacity-staged-source-team-queue.js'
];
test('New source migration rehearsal never enters live Convoy Checker or its workflow',()=>{
  const workflow=read('.github/workflows/convoy-checker.yml');
  const checker=read('convoy-checker.js');
  const runner=read('scripts/event-capacity-github-actions.js');
  for(const path of draft){
    const module=path.slice(0,-3);
    assert.equal(workflow.includes(module),false);
    assert.equal(checker.includes(module),false);
    assert.equal(runner.includes(module),false);
  }
});
test('Staged reviewers cannot read Discord tokens, connect to HTTP or write to providers',()=>{
  for(const path of draft){
    const code=read(path);
    assert.doesNotMatch(code,/process\.env|DISCORD_BOT_TOKEN|GITHUB_TOKEN|\bfetch\(/);
    assert.doesNotMatch(code,/\b(?:https|http)\.request\(/);
    assert.doesNotMatch(code,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
    assert.match(code,/safeToActivate:false/);
    assert.match(code,/freeSlotsCertified:false/);
  }
});
test('A lost source Event or old reserved date can never be auto-deleted or auto-released',()=>{
  const handoff=read(draft[0]);
  const team=read(draft[1]);
  assert.match(handoff,/missingFromLaterSourceNeverMeansDeleted:true/);
  assert.match(handoff,/physicalRecordsDeleted:0/);
  assert.match(handoff,/reschedulesDoNotReleasePreviouslyClaimedDates:true/);
  assert.match(team,/neverTreatMissingEventsAsDeleted:true/);
  assert.match(team,/actualEventChangesApplied:0/);
});
test('No private field names are copied to public logs by new source modules',()=>{
  for(const path of draft){
    const code=read(path);
    assert.doesNotMatch(code,/console\.log|console\.error|writeFileSync|appendFileSync/);
    assert.match(code,/PRIVATE_ONLY/);
  }
});
