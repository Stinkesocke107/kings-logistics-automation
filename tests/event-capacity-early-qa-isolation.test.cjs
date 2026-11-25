'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const added=['event-capacity-cross-channel-evidence-assurance.js',
  'event-capacity-prelaunch-test-scorecard.js'];
test('New early QA modules are not imported by live Convoy Checker job',()=>{
  const workflow=read('.github/workflows/convoy-checker.yml'),
    runner=read('convoy-checker.js');
  for(const file of added){
    const stem=file.replace(/\.js$/,'');
    assert.equal(workflow.includes(stem),false);
    assert.equal(runner.includes(stem),false);
  }
});
test('Source assurance is private and never certifies archived/deleted data from claims',()=>{
  const src=read(added[0]);
  assert.match(src,/complete24MonthOriginalSourceHistoryVerified:false/);
  assert.match(src,/originalPrivateDiscordMessagesRead:0/);
  assert.match(src,/staffDecisionsMade:0/);
  assert.match(src,/freeSlotsCertified:false,safeToActivate:false/);
});
test('Prelaunch test scorecard has no authority to send messages or release slots',()=>{
  const src=read(added[1]);
  assert.match(src,/actualLiveDiscordEventsVerified:0/);
  assert.match(src,/CIActuallyFetchedAndValidatedByThisModule:false/);
  assert.match(src,/noAutomaticActivationAfterMaintenance:true/);
  assert.match(src,/freeSlotsCertified:false,safeToActivate:false/);
});
test('Private early QA modules cannot read environment keys or call Discord HTTP',()=>{
  for(const file of added){
    const src=read(file);
    assert.doesNotMatch(src,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
    assert.doesNotMatch(src,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  }
});
