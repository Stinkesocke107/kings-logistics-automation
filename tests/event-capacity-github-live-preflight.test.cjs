'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {probeReadOnlyGithub,verifyContext}
  =require('../event-capacity-github-live-preflight');
const REPO='Stinkesocke107/kings-logistics-automation';
const TOKEN='synthetic-github-pull-request-token-readonly-00000001';
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const RUN='45502949674',SHA='d'.repeat(40);
const BASE='https://api.github.com/repos/'+REPO;
const URL=BASE+'/actions/workflows/convoy-checker.yml/runs'+
  '?branch=main&status=success&event=schedule&per_page=20';
const env=Object.freeze({
  GITHUB_REPOSITORY:REPO,
  GITHUB_HEAD_REPOSITORY:REPO,
  GITHUB_EVENT_NAME:'pull_request',
  GITHUB_BASE_REF:'main',
  GITHUB_HEAD_REF:'feature/event-capacity-foundation-2026-11',
  GITHUB_REF:'refs/pull/143/merge',
  KINGS_EVENT_CAPACITY_PREFLIGHT_ONLY:'true',
  GITHUB_TOKEN:TOKEN
});
function run(extra={}){
  return {id:Number(RUN),name:'Kings Convoy Checker (live)',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,
    status:'completed',conclusion:'success',event:'schedule',
    run_attempt:1,
    run_started_at:'2027-03-20T11:50:00Z',
    updated_at:'2027-03-20T11:55:00Z',...extra};
}
function fakeTransport({stale=false,spoof=false,network=false}={}){
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url,method:options.method,
      redirect:options.redirect,authorization:options.headers?.Authorization});
    if(network)throw Error('Secret payload: '+TOKEN);
    if(url===URL)
      return new Response(JSON.stringify({
        total_count:1,workflow_runs:[
          run(stale?{updated_at:'2027-03-20T10:00:00Z'}:{})
        ]
      }),{status:200});
    if(url===BASE+'/actions/runs/'+RUN)
      return new Response(JSON.stringify(run(spoof?{
        event:'workflow_dispatch',inputs:{mode:'live'}
      }:{})),{status:200});
    throw Error('Unsafe endpoint requested');
  };
  return {transport,calls};
}
test('A trusted same-repo PR can observe only current scheduled GitHub Actions metadata',async()=>{
  const f=fakeTransport();
  const result=await probeReadOnlyGithub({
    env,transport:f.transport,nowMs:NOW
  });
  assert.equal(result.state,'SCHEDULED_METADATA_VERIFIED');
  assert.equal(result.scheduledSourceVerified,true);
  assert.equal(result.githubMetadataVerified,true);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.decisionCommitted,false);
  assert.equal(result.artifactsDownloaded,false);
  assert.equal(result.discordContacted,false);
  assert.equal(result.repositoryWritten,false);
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.calls.map(x=>x.url),[
    URL,BASE+'/actions/runs/'+RUN
  ]);
  assert.equal(f.calls.every(x=>x.method==='GET'&&
    x.redirect==='manual'),true);
  assert.equal(f.calls.every(x=>x.authorization==='Bearer '+TOKEN),true);
  const output=JSON.stringify(result);
  assert.equal(output.includes(TOKEN),false);
  assert.equal(output.includes(RUN),false);
  assert.equal(output.includes(SHA),false);
});
test('Stale or manually dispatched runs are never claimed as verified scheduled sources',async()=>{
  for(const opts of [{stale:true},{spoof:true},{network:true}]){
    const f=fakeTransport(opts);
    const r=await probeReadOnlyGithub({
      env,transport:f.transport,nowMs:NOW
    });
    assert.equal(r.state,'SCHEDULED_METADATA_UNVERIFIED');
    assert.equal(r.scheduledSourceVerified,false);
    assert.equal(r.freeSlotsCertified,false);
    assert.equal(JSON.stringify(r).includes(TOKEN),false);
  }
});
test('Untrusted PR, fork, branch, main push, mode or supplied Discord secret blocks network',async()=>{
  for(const patch of [
    {GITHUB_REPOSITORY:'intruder/other'},
    {GITHUB_HEAD_REPOSITORY:'intruder/other'},
    {GITHUB_EVENT_NAME:'workflow_dispatch'},
    {GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main'},
    {GITHUB_BASE_REF:'feature'},
    {GITHUB_HEAD_REF:'main'},
    {GITHUB_REF:'refs/pull/144/merge'},
    {KINGS_EVENT_CAPACITY_PREFLIGHT_ONLY:'false'},
    {DISCORD_BOT_TOKEN:'PRIVATE-BOT-TOKEN'},
    {KINGS_EVENT_CAPACITY_PRIVATE_DATA_TOKEN:'PRIVATE-DATA'},
    {KINGS_EVENT_CAPACITY_PRIVATE_WITNESS_TOKEN:'PRIVATE-WITNESS'},
    {GITHUB_TOKEN:''}
  ]){
    const f=fakeTransport(),bad={...env,...patch};
    assert.equal(verifyContext(bad),false);
    const r=await probeReadOnlyGithub({
      env:bad,transport:f.transport,nowMs:NOW
    });
    assert.equal(r.state,'CONTEXT_REJECTED');
    assert.equal(r.freeSlotsCertified,false);
    assert.equal(f.calls.length,0);
  }
});
test('Read-only metadata probe is never a source for accepted event decisions',async()=>{
  const r=await probeReadOnlyGithub({
    env,transport:fakeTransport().transport,nowMs:NOW
  });
  assert.equal('acceptedEvents' in r,false);
  assert.equal('capacity' in r,false);
  assert.equal('privateStaff' in r,false);
  assert.equal('eventIds' in r,false);
});

test('Dry-run display name cannot impersonate scheduled live Convoy Checker',async()=>{
  const requestLog=[];
  const transport=async(url,options)=>{
    requestLog.push(url);
    if(url===URL)return new Response(JSON.stringify({
      total_count:1,workflow_runs:[
        run({name:'Kings Convoy Checker (dry-run)'})
      ]
    }),{status:200});
    throw Error('unnecessary fetch');
  };
  const result=await probeReadOnlyGithub({env,transport,nowMs:NOW});
  assert.equal(result.state,'SCHEDULED_METADATA_UNVERIFIED');
  assert.deepEqual(requestLog,[URL]);
});
