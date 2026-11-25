'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPrivateStoragePreflight}
  =require('../event-capacity-private-storage-preflight');
const REPOS={
  history:'kings-private-example/capacity-history',
  witness:'kings-private-example/capacity-witness',
  backup:'kings-private-example/capacity-backups'
};
const TOKENS={
  history:'synthetic-private-history-token-for-tests',
  witness:'synthetic-private-witness-token-for-tests',
  backup:'synthetic-private-backup-token-for-tests'
};
function scenario(){
  let n=0;const calls=[],roles=new Map();
  for(const role of Object.keys(REPOS))roles.set(REPOS[role],role);
  const protectedMap={history:true,witness:true,backup:false};
  let changedRole=null,publicRole=null,hiddenRole=null,failedRole=null,largeRole=null;
  async function transport(url,options){
    n++;const rest=url.replace('https://api.github.com/repos/','');
    const pair=[...roles.entries()].find(([r])=>rest===r||rest===r+'/branches/main');
    assert.ok(pair);
    const [repository,role]=pair;
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer '+TOKENS[role]);
    assert.equal(options.redirect,'manual');
    assert.equal('body' in options,false);
    calls.push({method:options.method,role,route:rest});
    if(role===failedRole)throw Error('SECRET TOKEN SHOULD NEVER LEAK');
    if(role===hiddenRole)return new Response('Unauthorized',{status:403});
    if(role===largeRole){
      const data={padding:'Z'.repeat(200000)};
      return Response.json(data);
    }
    if(rest.endsWith('/branches/main')){
      const sha=changedRole===role&&n>3?'b'.repeat(40):'a'.repeat(40);
      return Response.json({name:'main',commit:{sha},protected:protectedMap[role]});
    }
    return Response.json({full_name:repository,private:role!==publicRole,
      archived:false,disabled:false,default_branch:'main'});
  }
  const cfg={
    history:{repository:REPOS.history,token:TOKENS.history},
    witness:{repository:REPOS.witness,token:TOKENS.witness},
    backup:{repository:REPOS.backup,token:TOKENS.backup},
    transport
  };
  return {cfg,calls,protectedMap,
    publicRole:role=>{publicRole=role;},
    hiddenRole:role=>{hiddenRole=role;},
    failedRole:role=>{failedRole=role;},
    largeRole:role=>{largeRole=role;},
    changedRole:role=>{changedRole=role;}
  };
}
test('Three separate private repositories checked twice using GET only',async()=>{
  const x=scenario(),report=await createPrivateStoragePreflight(x.cfg).read();
  assert.equal(report.observedPrivateRepositories,3);
  assert.equal(report.distinctRepositoryNamesObserved,true);
  assert.equal(report.distinctCredentialStringsSupplied,true);
  assert.equal(report.branchProtectionReportedForAll,false);
  assert.equal(report.repos.find(r=>r.role==='backup').branchProtectionReported,false);
  assert.equal(report.githubFreePrivateRepositoryCompatible,true);
  assert.equal(report.premiumPrivateBranchRulesAssumed,false);
  assert.equal(report.privateBranchProtectionMandatoryForPreflight,false);
  assert.equal(report.independentOwnerHighwaterRequired,true);
  assert.equal(report.separatedCredentialCustodyRequired,true);
  assert.equal(x.calls.length,12);
  assert.ok(x.calls.every(c=>c.method==='GET'));
  assert.equal(report.safeToActivate,false);
  assert.equal(report.actualHistoricalDataStored,false);
  assert.equal(report.backupsRetentionEnforced,false);
  assert.equal(report.freeSlotsCertified,false);
});
test('All branch protected flags visible still cannot attest token scope or production safety',async()=>{
  const x=scenario();x.protectedMap.backup=true;
  const report=await createPrivateStoragePreflight(x.cfg).read();
  assert.equal(report.branchProtectionReportedForAll,true);
  assert.equal(report.branchProtectionRulesIndependentlyInspected,false);
  assert.equal(report.credentialGrantIsolationIndependentlyVerified,false);
  assert.equal(report.ownerOfflineKeyCustodyVerified,false);
  assert.equal(report.safeToActivate,false);
});
test('Public or inaccessible repository fails closed without partial ready report',async()=>{
  for(const role of ['history','witness','backup']){
    const x=scenario();x.publicRole(role);
    await assert.rejects(createPrivateStoragePreflight(x.cfg).read());
    const y=scenario();y.hiddenRole(role);
    await assert.rejects(createPrivateStoragePreflight(y.cfg).read());
  }
});
test('Distinct repository names and credential strings required before any GET',()=>{
  for(const update of [
    c=>{c.backup.repository=c.history.repository;},
    c=>{c.backup.repository=c.history.repository.toUpperCase();},
    c=>{c.backup.token=c.history.token;},
    c=>{c.history.repository='Stinkesocke107/kings-logistics-automation';},
    c=>{c.history.repository='owner/../other';},
    c=>{c.witness.token='weak';}
  ]){
    const x=scenario(),value=structuredClone({
      history:x.cfg.history,witness:x.cfg.witness,backup:x.cfg.backup
    });
    update(value);
    assert.throws(()=>createPrivateStoragePreflight({...value,transport:x.cfg.transport}));
    assert.equal(x.calls.length,0);
  }
});
test('Transport faults and overlong JSON bodies fail with safe public messages',async()=>{
  for(const issue of ['failedRole','largeRole']){
    const x=scenario();x[issue]('backup');
    await assert.rejects(createPrivateStoragePreflight(x.cfg).read(),err=>{
      assert.doesNotMatch(String(err),/synthetic-private|SECRET TOKEN/);
      return true;
    });
  }
});
test('Repository branch changes during verification must abort',async()=>{
  const x=scenario();x.changedRole('history');
  await assert.rejects(createPrivateStoragePreflight(x.cfg).read());
});
test('Unverified GitHub branch protection metadata is not silently assumed',async()=>{
  const x=scenario();
  const transport=(url,options)=>url.endsWith('/branches/main')?
    Response.json({name:'main',commit:{sha:'f'.repeat(40)}}):
    x.cfg.transport(url,options);
  await assert.rejects(createPrivateStoragePreflight({...x.cfg,transport}).read());
});
test('No GitHub secrets or private repository names are returned in report',async()=>{
  const x=scenario(),report=await createPrivateStoragePreflight(x.cfg).read();
  const output=JSON.stringify(report);
  for(const candidate of [...Object.values(REPOS),...Object.values(TOKENS)])
    assert.equal(output.includes(candidate),false);
});
