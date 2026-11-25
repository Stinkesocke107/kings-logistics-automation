'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const modules=['event-capacity-atomic-import-rehearsal.js',
  'event-capacity-import-recovery-team-preview.js'];
test('Atomic import drill and private progress view do not enter live Convoy Checker',()=>{
  const workflow=read('.github/workflows/convoy-checker.yml'),
    checker=read('convoy-checker.js');
  for(const file of modules){
    const stem=file.slice(0,-3);
    assert.equal(workflow.includes(stem),false);
    assert.equal(checker.includes(stem),false);
  }
});
test('Synthetic transaction modules have no env tokens or HTTP clients',()=>{
  for(const file of modules){
    const code=read(file);
    assert.doesNotMatch(code,/process\.env|DISCORD_BOT_TOKEN|GITHUB_TOKEN|\bfetch\s*\(/);
    assert.doesNotMatch(code,/\b(?:http|https)\.request\s*\(/);
    assert.doesNotMatch(code,/writeFileSync|appendFileSync|console\.log/);
    assert.match(code,/safeToActivate:false/);
    assert.match(code,/freeSlotsCertified:false/);
  }
});
test('All fake recovery progress stays blocked from actual transaction and Event deletes',()=>{
  const code=read(modules[0]);
  for(const value of ['productionTransactionCommitted:false',
    'externalDurableCheckpointPersisted:false',
    'actualRecoveryOrRollbackPerformed:false',
    'realEventImports:0','realEventDeletes:0',
    'oldReservationsReleased:0','staffApprovalsCommitted:0',
    'externalCallsOrWritesPerformed:0'])
    assert.equal(code.includes(value),true,value);
});
test('Staged checkpoints are HMAC sealed and previous proof compared without leaked secrets',()=>{
  const code=read(modules[0]);
  assert.match(code,/createHmac\('sha256',secret\)/);
  assert.match(code,/timingSafeEqual/);
  assert.match(code,/KINGS_OFFLINE_IMPORT_DRILL_ONLY/);
  assert.doesNotMatch(code,/createPrivateKey|randomBytes|signHistoricalTransitionOffline/);
});
test('Event Team previews are ephemeral and cannot inject a runtime approval button',()=>{
  const code=read(modules[1]);
  assert.match(code,/flags:64,allowed_mentions:\{parse:\[\]\}/);
  assert.match(code,/actualEventImportsOrDeletions:0/);
  assert.match(code,/previousCalendarReservationsReleased:0/);
  assert.doesNotMatch(code,/\/interactions\/|roleId|channelSend|sendMessage/);
});
