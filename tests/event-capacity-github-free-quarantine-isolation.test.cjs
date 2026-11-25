'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const name='event-capacity-github-free-quarantine-ledger.js';
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('No GitHub-only private ledger is wired to the production Convoy Checker yet',()=>{
  for(const f of ['convoy-checker.js','.github/workflows/convoy-checker.yml',
    'scripts/event-capacity-github-actions.js']){
    assert.equal(read(f).includes(name.slice(0,-3)),false);
  }
});
test('No real GitHub API, Discord token, filesystem or remote transport in pure contract',()=>{
  const s=read(name);
  assert.doesNotMatch(s,/process\.env|GITHUB_TOKEN|DISCORD_BOT_TOKEN|\bfetch\(/);
  assert.doesNotMatch(s,/node:https|node:http|node:fs|axios|undici/);
  assert.doesNotMatch(s,/create_repository|\/repos\/.*\/contents/);
  assert.match(s,/INJECTED_GITHUB_FREE_TEST_ONLY/);
});
test('Every offline record remains unsafe for production booking despite GitHub matching',()=>{
  const s=read(name);
  for(const v of ['twoPrivateGitHubRepositoriesAreNOTIndependentOffProviderBackup:true',
    'actualIndependentHighwaterAuthenticated:false',
    'originalDiscordSourcesAuthenticated:false',
    'sameProviderCommitWasNotDistributedAtomic:true',
    'realEventImports:0','oldBookingsReleased:0',
    'freeSlotsCertified:false,safeToActivate:false'])
    assert.equal(s.includes(v),true,v);
});
test('State envelope encrypted locally and witness remains MAC authenticated',()=>{
  const s=read(name);
  assert.match(s,/aes-256-gcm/);
  assert.match(s,/crypto\.createHmac\('sha256',key\)/);
  assert.match(s,/crypto\.timingSafeEqual/);
  assert.match(s,/quarantine\/.*scopeDigest/);
  assert.match(s,/witness\/.*scopeDigest/);
});
test('Data updates require exact file content SHA and no force-push path exists',()=>{
  const s=read(name);
  assert.match(s,/expectedSha:before\.state\?\.sha\?\?null/);
  assert.match(s,/expectedSha:before\.witness\?\.sha\?\?null/);
  assert.doesNotMatch(s,/force:\s*true|git push --force|updateRef/);
});
