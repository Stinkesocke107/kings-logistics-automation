'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {REPOS,createKingsPrivateGithubRequestGuard}
  =require('../event-capacity-private-runtime-request-guard');
const SHA='a'.repeat(64),GIT='b'.repeat(40);
const TOKEN='synthetic-role-scoped-token-for-test-only';
function gate(role='history',mode='read'){
  const calls=[];
  const transport=async (url,opts)=>{
    calls.push({url,method:opts.method});
    return {status:200,ok:true};
  };
  return {guard:createKingsPrivateGithubRequestGuard({role,mode,transport}),calls};
}
function call(suffix='',method='GET',body){
  const opts={method,redirect:'manual',headers:{
    Authorization:'Bearer '+TOKEN,
    Accept:'application/vnd.github+json'
  }};
  if(body!==undefined)opts.body=JSON.stringify(body);
  return opts;
}
const url=(role,path='')=>'https://api.github.com/repos/'+REPOS[role]+path;
function putPayload(data=Buffer.from('encrypted synthetic test bytes'),sha=undefined){
  return {branch:'main',message:'Synthetic private segment test',
    content:data.toString('base64'),...(sha===undefined?{}:{sha})};
}
test('History reader restricts GET to metadata, main branch, signed history index and segments',async()=>{
  const x=gate('history');
  for(const path of [
    '', '/branches/main',
    '/contents/capacity-history/current.json?ref=main',
    '/contents/capacity-history/segments/'+SHA+'.bin?ref=main'
  ])await x.guard.transport(url('history',path),call(path));
  assert.equal(x.calls.length,4);
  assert.ok(x.calls.every(c=>c.method==='GET'));
  assert.equal(x.guard.grantsActualGithubPermissions,false);
  assert.equal(x.guard.verifiesTokenScopes,false);
  assert.equal(x.guard.freeSlotsCertified,false);
});
test('History writer may use only exact signed-history CAS index and no-overwrite segments',async()=>{
  const x=gate('history','write');
  await x.guard.transport(url('history','/contents/capacity-history/current.json'),
    call('', 'PUT',putPayload(Buffer.from('encrypted index'),GIT)));
  await x.guard.transport(url('history','/contents/capacity-history/segments/'+SHA+'.bin'),
    call('', 'PUT',putPayload()));
  assert.equal(x.calls.length,2);
  await assert.rejects(x.guard.transport(
    url('history','/contents/capacity-history/current.json'),
    call('', 'PUT',putPayload())));
  await assert.rejects(x.guard.transport(
    url('history','/contents/capacity-history/segments/'+SHA+'.bin'),
    call('', 'PUT',putPayload(Buffer.from('cipher'),GIT))));
  assert.equal(x.calls.length,2);
});
test('Separate backup writer cannot write to historical index or witness repo',async()=>{
  const x=gate('backup','write');
  await x.guard.transport(url('backup',
    '/contents/capacity-backups/daily/2027-05-20.manifest.json'),
    call('', 'PUT',putPayload()));
  await x.guard.transport(url('backup',
    '/contents/capacity-backups/segments/'+SHA+'.bin'),
    call('', 'PUT',putPayload()));
  assert.equal(x.calls.length,2);
  for(const path of [
    '/contents/capacity-history/current.json',
    '/contents/capacity-witness/current.json',
    '/contents/capacity-backups/daily/2027-02-30.manifest.json',
    '/contents/capacity-backups/daily/2027-05-20.manifest.json/../secrets',
    '/contents/capacity-backups/segments/'+SHA.toUpperCase()+'.bin'
  ])await assert.rejects(x.guard.transport(url('backup',path),
    call('', 'PUT',putPayload())));
  await assert.rejects(x.guard.transport(url('history',
    '/contents/capacity-history/segments/'+SHA+'.bin'),
    call('', 'PUT',putPayload())));
  assert.equal(x.calls.length,2);
});
test('Witness account is strictly read-only; no custom credential can grant local writes',async()=>{
  const x=gate('witness','read');
  await x.guard.transport(url('witness'),call());
  await x.guard.transport(url('witness',
    '/contents/capacity-witness/current.json?ref=main'),call());
  for(const mode of ['write','admin'])assert.throws(()=>
    createKingsPrivateGithubRequestGuard({role:'witness',mode,
      transport:async()=>({status:200})}));
  await assert.rejects(x.guard.transport(url('witness',
    '/contents/capacity-witness/current.json'),
    call('', 'PUT',putPayload())));
  assert.equal(x.calls.length,2);
});
test('All readers prohibit PUT, DELETE, PATCH and POST regardless of token value',async()=>{
  for(const role of ['history','witness','backup']){
    const x=gate(role,'read');
    const endpoint=role==='history'?
      '/contents/capacity-history/current.json':
      role==='backup'?
      '/contents/capacity-backups/daily/2027-05-20.manifest.json':
      '/contents/capacity-witness/current.json';
    for(const method of ['PUT','DELETE','PATCH','POST']){
      await assert.rejects(x.guard.transport(url(role,endpoint),
        call('',method,putPayload(Buffer.from('secret')))));
    }
    assert.equal(x.calls.length,0);
  }
});
test('Any cross-repo URL, URL query trick or hidden path traversal is blocked',async()=>{
  const x=gate('history','write');
  for(const endpoint of [
    'https://api.github.com/repos/'+REPOS.backup,
    url('history')+'/branches/main?unexpected=1',
    url('history')+'/contents/capacity-history/current.json?ref=feature',
    url('history')+'/contents/capacity-history/current.json?ref=main&x=1',
    url('history')+'/contents/capacity-history/../.github/workflows/unsafe.yml',
    url('history')+'/contents/capacity-history/%2e%2e/secrets.json',
    url('history')+'/contents/capacity-history/current.json/../../secrets'
  ])await assert.rejects(x.guard.transport(endpoint,call()));
  assert.equal(x.calls.length,0);
});
test('Wrong branch, overwrite SHA, foreign metadata and oversized encrypted writes reject before transport',async()=>{
  const x=gate('backup','write'),path='/contents/capacity-backups/daily/2027-05-20.manifest.json';
  for(const payload of [
    {...putPayload(),branch:'dev'},
    {...putPayload(),sha:GIT},
    {...putPayload(),token:'SHOULD_NOT_PUBLISH'},
    {...putPayload(),content:'not-valid=='},
    {...putPayload(Buffer.alloc(120*1024))}
  ])await assert.rejects(x.guard.transport(url('backup',path),
    call('', 'PUT',payload)));
  assert.equal(x.calls.length,0);
});
test('No authorization header, embedded body on GET or non-manual redirects are denied',async()=>{
  const x=gate('history');
  const valid=call();
  for(const options of [
    {...valid,headers:{...valid.headers,Authorization:'Bearer short'}},
    {...valid,headers:{Accept:'application/json'}},
    {...valid,body:'{}'},
    {...valid,redirect:'follow'},
    {...valid,method:'get'},
    {...valid,unexpected:'private token'}
  ])await assert.rejects(x.guard.transport(url('history'),options));
  assert.equal(x.calls.length,0);
});
test('Write error never leads to automatic retry, deletion or private data exposure',async()=>{
  let calls=0;const x=createKingsPrivateGithubRequestGuard({
    role:'backup',mode:'write',
    transport:async()=>{calls++;throw Error('secret private token and event:100');}
  });
  await assert.rejects(x.transport(url('backup',
    '/contents/capacity-backups/segments/'+SHA+'.bin'),
    call('', 'PUT',putPayload())),e=>{
    assert.doesNotMatch(String(e),/secret private|event:100/);
    return true;
  });
  assert.equal(calls,1);
});
test('Cannot substitute another repository, role or GitHub user',()=>{
  for(const role of ['admin','source','public',null]){
    assert.throws(()=>createKingsPrivateGithubRequestGuard({
      role,mode:'read',transport:async()=>null
    }));
  }
  assert.throws(()=>createKingsPrivateGithubRequestGuard({
    role:'history',mode:'read',transport:null
  }));
  assert.equal(REPOS.history,'Stinkesocke107/kings-event-capacity-history');
});
