'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {fixture,hash}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {createKingsGithubFreeQuarantineLedger:make}
  =require('../event-capacity-github-free-quarantine-ledger');
const ENC='synthetic github free only encryption passphrase never deploy';
const WIT='synthetic github free only witness passphrase never deploy';
const STATE='kings-test/private-event-quarantine';
const WITNESS='kings-test/private-event-quarantine-witness';
const sha=s=>createHash('sha1').update(s).digest('hex');
function setup(){
  const sourceInput=fixture();
  const scope={guildId:sourceInput.current.guildId,
    forumId:sourceInput.current.currentChannelId};
  const stored=new Map();
  const privacy=new Map([[STATE,true],[WITNESS,true]]);
  let fault=null;
  const calls=[];
  const pathKey=(repo,path)=>repo+'\0'+path;
  const transport={
    describe:async({repository})=>{
      if(!privacy.has(repository))throw Error('not found');
      return {full_name:repository,private:privacy.get(repository)};
    },
    read:async({repository,path})=>{
      const row=stored.get(pathKey(repository,path));
      return row?structuredClone(row):null;
    },
    put:async({repository,path,expectedSha,content,message})=>{
      calls.push({repository,path,expectedSha,message});
      const key=pathKey(repository,path),prior=stored.get(key)||null;
      if((prior?.sha??null)!==expectedSha)throw Error('409 conflict');
      if(fault?.repository===repository&&fault?.phase==='BEFORE_WRITE')
        throw Error('synthetic network failed');
      const row={sha:sha(content),content};
      stored.set(key,row);
      if(fault?.repository===repository&&fault?.phase==='AFTER_WRITE')
        throw Error('synthetic lost acknowledgment');
      return {sha:row.sha};
    }
  };
  function client(extra={}){
    return make({scope,stateRepository:STATE,witnessRepository:WITNESS,
      encryptionSecret:ENC,witnessSecret:WIT,reviewSecret:sourceInput.reviewSecret,
      transport,mode:'INJECTED_GITHUB_FREE_TEST_ONLY',...extra});
  }
  return {sourceInput,scope,stored,privacy,transport,calls,client,
    fault:x=>{fault=x;},clearFault:()=>{fault=null;},
    records:()=>[...stored.values()].map(x=>x.content),
    corrupt:(repo,fn)=>{
      const entry=[...stored.keys()].find(k=>k.startsWith(repo+'\0'));
      const row=stored.get(entry);
      stored.set(entry,{sha:sha(fn(row.content)),content:fn(row.content)});
    },
    deleteRepoFile:repo=>{
      for(const k of [...stored.keys()])if(k.startsWith(repo+'\0'))stored.delete(k);
    }
  };
}
const inspect=(s,c)=>c.inspect({sourceInput:s.sourceInput});
const stage=(s,c,n)=>c.advance({sourceInput:s.sourceInput,expectedRevision:n});
test('Two empty separate private GitHub-Free repositories are not independent external backup',async()=>{
  const s=setup(),r=await inspect(s,s.client());
  assert.equal(r.revision,0);
  assert.equal(r.state,'TWO_EMPTY_PRIVATE_GITHUB_REPOS');
  assert.equal(r.twoPrivateGitHubRepositoriesAreNOTIndependentOffProviderBackup,true);
  assert.equal(r.actualIndependentHighwaterAuthenticated,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Quarantine phase is encrypted in state repository and independently witness-checked within GitHub',async()=>{
  const s=setup(),c=s.client();
  const r=await stage(s,c,0);
  assert.equal(r.revision,1);
  assert.equal(r.state,'GITHUB_PRIVATE_QUARANTINE_CLAIMS_MATCH');
  assert.equal(r.sameProviderCommitWasNotDistributedAtomic,true);
  assert.equal(s.stored.size,2);
  assert.equal((await inspect(s,c)).revision,1);
  const texts=s.records().join('\n');
  for(const hidden of ['evt100','inv1','990000000000000000',
    '990000000000000001','synthetic private source-handoff'])
    assert.equal(texts.includes(hidden),false);
  assert.equal(texts.includes('ENCRYPTED_OFFLINE_QUARANTINE_ONLY'),true);
});
test('Four steps persist across new ledger instances, with no fifth phase or Event approvals',async()=>{
  const s=setup();
  for(let n=0;n<4;n++)
    assert.equal((await stage(s,s.client(),n)).revision,n+1);
  assert.equal((await inspect(s,s.client())).revision,4);
  assert.equal((await stage(s,s.client(),4)).state,'SYNTHETIC_DRILL_ALREADY_COMPLETE');
  const r=await stage(s,s.client(),3);
  assert.equal(r.state,'ALREADY_WITNESSED_GITHUB_REPLAY');
  assert.equal(r.realEventImports,undefined);
});
test('Replaying a confirmed previous step does not write another state or witness',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  const calls=s.calls.length;
  assert.equal((await stage(s,c,0)).state,'ALREADY_WITNESSED_GITHUB_REPLAY');
  assert.equal(s.calls.length,calls);
});
test('Wrong or stale expected revision is rejected rather than skipping steps',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);await stage(s,c,1);
  await assert.rejects(stage(s,c,0));
  await assert.rejects(stage(s,c,3));
  assert.equal((await inspect(s,c)).revision,2);
});
test('Concurrent first-revision requests allow one success only, no double commit',async()=>{
  const s=setup(),c=s.client();
  const results=await Promise.allSettled([stage(s,c,0),stage(s,c,0)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await inspect(s,c)).revision,1);
});
test('State write fails before persistence: both records remain empty and can be retried',async()=>{
  const s=setup(),c=s.client();
  s.fault({repository:STATE,phase:'BEFORE_WRITE'});
  await assert.rejects(stage(s,c,0));
  assert.equal((await inspect(s,c)).revision,0);
  s.clearFault();
  assert.equal((await stage(s,c,0)).revision,1);
});
test('State write succeeds but acknowledgment lost: mismatched state/witness fails closed',async()=>{
  const s=setup(),c=s.client();
  s.fault({repository:STATE,phase:'AFTER_WRITE'});
  await assert.rejects(stage(s,c,0));
  s.clearFault();
  assert.equal(s.stored.size,1);
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,0));
});
test('Witness fails before write after state commit: no automatic repair of partial state',async()=>{
  const s=setup(),c=s.client();
  s.fault({repository:WITNESS,phase:'BEFORE_WRITE'});
  await assert.rejects(stage(s,c,0));
  assert.equal(s.stored.size,1);
  s.clearFault();
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,0));
});
test('Witness writes but acknowledgment is lost: subsequent inspection verifies exact matching pair',async()=>{
  const s=setup(),c=s.client();
  s.fault({repository:WITNESS,phase:'AFTER_WRITE'});
  await assert.rejects(stage(s,c,0));
  s.clearFault();
  assert.equal((await inspect(s,c)).revision,1);
  assert.equal((await stage(s,c,0)).state,'ALREADY_WITNESSED_GITHUB_REPLAY');
});
test('A GitHub Free repo cannot be made public and still carry quarantined records',async()=>{
  const s=setup();s.privacy.set(STATE,false);
  await assert.rejects(inspect(s,s.client()));
  await assert.rejects(stage(s,s.client(),0));
  assert.equal(s.stored.size,0);
});
test('State and witness repositories must be separate but same owner in supported contract',()=>{
  const s=setup();
  assert.throws(()=>s.client({witnessRepository:STATE}));
  assert.throws(()=>s.client({witnessRepository:'other-owner/private-witness'}));
  assert.throws(()=>s.client({stateRepository:'../public-file'}));
});
test('No automatic GitHub repo creation, API token or real provider authentication is implied',()=>{
  const s=setup();
  assert.throws(()=>s.client({mode:'LIVE_GITHUB'}));
  assert.throws(()=>s.client({transport:{}}));
  assert.throws(()=>s.client({encryptionSecret:'too short'}));
  assert.throws(()=>s.client({witnessSecret:ENC}));
});
test('Original Event changed after a witnessed commit: plan mismatch blocks read and updates',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.sourceInput.current.convoyRecords[0].sourceDigest=hash('modified');
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,1));
});
test('Archive page changed but Event rows identical: previous GitHub state is not reusable',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.sourceInput.currentPagination.scans[0].pages[0].responseDigest='f'.repeat(64);
  await assert.rejects(inspect(s,c));
});
test('Changed Tracker connection does not silently accept stale staged data',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.sourceInput.current.tracker.connected=false;
  await assert.rejects(inspect(s,c));
});
test('A restored older state repository and newer witness fails even with valid AES ciphertext',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  const original=[...s.stored.entries()].find(([k])=>k.startsWith(STATE+'\0'));
  await stage(s,c,1);
  s.stored.set(original[0],original[1]);
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,2));
});
test('Deleted local state but preserved witness is rejected instead of initializing again',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.deleteRepoFile(STATE);
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,0));
});
test('Deleted witness but local encrypted state remains cannot count as empty history',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.deleteRepoFile(WITNESS);
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,0));
});
test('Tampered state ciphertext at unchanged revision is rejected by AES-GCM and witness digest',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.corrupt(STATE,raw=>raw.replace('"version":1','"version":2'));
  await assert.rejects(inspect(s,c));
});
test('Forged witness MAC or fake future revision cannot become independent source proof',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.corrupt(WITNESS,raw=>raw.replace('"revision":1','"revision":2'));
  await assert.rejects(inspect(s,c));
});
test('Provider disclosure of private=false after commit prevents any further reads/writes',async()=>{
  const s=setup(),c=s.client();
  await stage(s,c,0);
  s.privacy.set(WITNESS,false);
  await assert.rejects(inspect(s,c));
  await assert.rejects(stage(s,c,1));
});
test('Same GitHub provider commit semantics never produce independently certified free slots',async()=>{
  const s=setup(),c=s.client(),r=await stage(s,c,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.independentBackupAndOwnerHighwaterNOTCertified,true);
  assert.equal(r.realEventImports,0);
  assert.equal(r.realEventDeletions,0);
  assert.equal(r.oldBookingsReleased,0);
});
