'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file='event-capacity-staged-import-external-anchor.js';
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Independent-witness contract remains disconnected from existing live Convoy Checker',()=>{
  const stem=file.slice(0,-3);
  for(const p of ['.github/workflows/convoy-checker.yml',
    'convoy-checker.js','scripts/event-capacity-github-actions.js'])
    assert.equal(read(p).includes(stem),false,p);
});
test('Injected witness adapter cannot read tokens, execute network requests, or access disks',()=>{
  const s=read(file);
  assert.doesNotMatch(s,/process\.env|DISCORD_BOT_TOKEN|GITHUB_TOKEN|\bfetch\(/);
  assert.doesNotMatch(s,/node:fs|writeFile|node:https|node:http|axios|undici/);
  assert.doesNotMatch(s,/\/channels\/|\/interactions\/|sendMessage/);
});
test('No external anchor provider, public deployment or real witness independence is claimed',()=>{
  const s=read(file);
  assert.match(s,/createKingsExternallyWitnessedStagedImportStore/);
  assert.match(s,/physicalWitnessIndependenceVerified:false/);
  assert.match(s,/actualOffsiteWitnessIndependentlyAuthenticated:false/);
  assert.match(s,/certifiedProductionReady:false/);
  assert.match(s,/freeSlotsCertified:false,safeToActivate:false/);
});
test('Only bounded stage progression; no deletion, overwrite or auto-recovery escape hatch',()=>{
  const s=read(file);
  assert.match(s,/expectedRevision<0\|\|expectedRevision>4/);
  assert.match(s,/oldReservationsReleased:0/);
  assert.match(s,/staffApprovalsCommitted:0/);
  assert.doesNotMatch(s,/DELETE FROM|DROP TABLE|restoreInto|autoRecover/);
});
test('Missing anchors and failed CAS return generic errors instead of secrets or success',()=>{
  const s=read(file);
  assert.match(s,/if\(!isDeepStrictEqual\(local,remote\)\)fail\(\)/);
  assert.match(s,/if\(advanced!==true\)fail\(\)/);
  assert.match(s,/if\(!isDeepStrictEqual\(after.local,next\)\)fail\(\)/);
});
