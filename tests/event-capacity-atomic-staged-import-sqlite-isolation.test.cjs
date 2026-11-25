'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file='event-capacity-atomic-staged-import-sqlite.js';
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Durable synthetic SQLite import rehearsal is not imported by live Convoy Checker',()=>{
  const name=file.slice(0,-3);
  for(const source of ['.github/workflows/convoy-checker.yml',
    'convoy-checker.js','scripts/event-capacity-github-actions.js'])
    assert.equal(read(source).includes(name),false,source);
});
test('Protected SQLite drill never imports an HTTP client, Discord token or runtime API',()=>{
  const code=read(file);
  assert.doesNotMatch(code,/DISCORD_BOT_TOKEN|GITHUB_TOKEN|process\.env|\bfetch\(/);
  assert.doesNotMatch(code,/https?\.request\(|axios|undici/);
  assert.doesNotMatch(code,/\/interactions\/|\/channels\/.*\/messages/);
  assert.match(code,/SYNTHETIC_OFFLINE_ONLY/);
});
test('Database write targets only dedicated quarantined SQLite table',()=>{
  const code=read(file);
  assert.match(code,/staged_quarantine_drills/);
  assert.match(code,/kings-capacity-quarantine-drill\.sqlite/);
  assert.doesNotMatch(code,/INSERT INTO (?:convoy|events|invitations|capacity_snapshots)/);
  assert.doesNotMatch(code,/DROP TABLE|DELETE FROM|TRUNCATE TABLE/);
});
test('Disk commits are AES-256-GCM encrypted and SQLite journal is FULL synchronous',()=>{
  const code=read(file);
  assert.match(code,/aes-256-gcm/);
  assert.match(code,/BEGIN IMMEDIATE/);
  assert.match(code,/db\.exec\('COMMIT'\)/);
  assert.match(code,/db\.exec\('ROLLBACK'\)/);
  assert.match(code,/synchronous=FULL/);
  assert.match(code,/mode&0o077/);
  assert.match(code,/timingSafeEqual|createKingsStagedImportQuarantinePlan/);
});
test('Synthetic checkpoint does not claim independent owner highwater or real Event imports',()=>{
  const code=read(file);
  for(const marker of [
    'independentOffsiteHighwaterProven:false',
    'realEventImportsOrDeletes:0','oldBookingsReleased:0',
    'staffDecisionsCommitted:0','actualDiscordOrGitHubApiCalls:0',
    'freeSlotsCertified:false,safeToActivate:false'])
    assert.ok(code.includes(marker),marker);
});
