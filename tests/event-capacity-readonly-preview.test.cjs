'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview,contextAllowed,validateRun}
  =require('../event-capacity-readonly-preview');
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const LIST=BASE+'/actions/workflows/convoy-checker.yml/runs?branch=main&status=success&event=schedule&per_page=20';
const TOKEN='synthetic-only-readonly-gh-token-00000000000001';
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const ID='45502949674',SHA='a'.repeat(40);
const PR={GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'pull_request',
  GITHUB_REF:'refs/pull/999/merge',GITHUB_BASE_REF:'main',
  GITHUB_HEAD_REF:'feature/event-capacity-readonly-main-preview-2026-11',
  GITHUB_HEAD_REPOSITORY:REPO,
  GITHUB_TOKEN:TOKEN,KINGS_CAPACITY_READONLY_PREVIEW:'true'};
const MANUAL={GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REF:'refs/heads/main',GITHUB_INPUT_CAPACITY_PREVIEW:'true',
  GITHUB_TOKEN:TOKEN,KINGS_CAPACITY_READONLY_PREVIEW:'true'};
function run(extra={}){
  return {id:Number(ID),name:'Kings Convoy Checker (live)',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,run_attempt:1,
    event:'schedule',status:'completed',conclusion:'success',
    run_started_at:'2027-03-20T11:50:00Z',
    updated_at:'2027-03-20T11:55:00Z',...extra};
}
function server({listExtra={},runExtra={},fail=false,tooLarge=false}={}){
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url,method:options.method,
      redirect:options.redirect,
      authorization:options.headers?.Authorization});
    if(fail)throw Error('Secret '+TOKEN);
    if(url===LIST)return new Response(JSON.stringify({
      total_count:1,workflow_runs:[run(listExtra)]
    }),{status:200});
    if(url===BASE+'/actions/runs/'+ID){
      if(tooLarge)return new Response('A'.repeat(600000),{status:200});
      return new Response(JSON.stringify(run(runExtra)),{status:200});
    }
    throw Error('unexpected URL');
  };
  return {transport,calls};
}
test('Explicit manual main preview only fetches two fixed GitHub metadata endpoints',async()=>{
  const s=server(),result=await preview({env:MANUAL,nowMs:NOW,transport:s.transport});
  assert.equal(result.status,'SCHEDULED_SOURCE_METADATA_VERIFIED');
  assert.equal(result.githubVerified,true);
  for(const k of ['discordContacted','artifactDownloaded','privateLedgerRead',
    'eventChanged','staffDecisionCommitted','freeSlotsCertified'])
    assert.equal(result[k],false);
  assert.deepEqual(s.calls.map(x=>x.url),[LIST,BASE+'/actions/runs/'+ID]);
  assert.equal(s.calls.every(x=>x.method==='GET'&&x.redirect==='manual'),true);
  assert.equal(s.calls.every(x=>x.authorization==='Bearer '+TOKEN),true);
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
  assert.equal(JSON.stringify(result).includes(ID),false);
});
test('Same-repository preview pull request also verifies live metadata read-only',async()=>{
  const r=await preview({env:PR,nowMs:NOW,transport:server().transport});
  assert.equal(r.githubVerified,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Fork, arbitrary workflow, push, main default and missing opt-in all block network access',async()=>{
  for(const patch of [
    {GITHUB_HEAD_REPOSITORY:'fork/untrusted'},
    {GITHUB_BASE_REF:'feature'},
    {GITHUB_HEAD_REF:'another-feature'},
    {GITHUB_REF:'refs/pull/999/head'},
    {GITHUB_EVENT_NAME:'push'},
    {GITHUB_EVENT_NAME:'schedule'},
    {KINGS_CAPACITY_READONLY_PREVIEW:'false'},
    {GITHUB_TOKEN:''},
    {GITHUB_TOKEN:'invalid\ninjected'}
  ]){
    const s=server(),env={...PR,...patch};
    assert.equal(contextAllowed(env),false);
    const r=await preview({env,transport:s.transport,nowMs:NOW});
    assert.equal(r.status,'CONTEXT_REJECTED');
    assert.equal(s.calls.length,0);
  }
  for(const patch of [
    {GITHUB_INPUT_CAPACITY_PREVIEW:'false'},
    {GITHUB_REF:'refs/heads/feature-branch'},
    {GITHUB_EVENT_NAME:'pull_request'}
  ]){
    const s=server();
    const r=await preview({env:{...MANUAL,...patch},
      transport:s.transport,nowMs:NOW});
    assert.equal(r.status,'CONTEXT_REJECTED');
    assert.equal(s.calls.length,0);
  }
});
test('No scheduled run, spoofed dry-run, stale or changed SHA fails closed',async()=>{
  for(const opts of [
    {listExtra:{name:'Kings Convoy Checker (dry-run)'}},
    {listExtra:{event:'workflow_dispatch'}},
    {listExtra:{conclusion:'failure'}},
    {listExtra:{updated_at:'2027-03-20T10:00:00Z'}},
    {listExtra:{head_branch:'feature'}},
    {listExtra:{head_repository:{full_name:'attacker/repo'}}},
    {runExtra:{head_sha:'f'.repeat(40)}},
    {runExtra:{run_attempt:2}},
    {runExtra:{event:'workflow_dispatch'}}
  ]){
    const s=server(opts);
    const r=await preview({env:MANUAL,nowMs:NOW,transport:s.transport});
    assert.equal(r.status,'SCHEDULED_SOURCE_METADATA_UNVERIFIED');
    assert.equal(r.freeSlotsCertified,false);
  }
});
test('No secrets or private source identifiers leak on GitHub network failure or oversized response',async()=>{
  for(const opts of [{fail:true},{tooLarge:true}]){
    const s=server(opts);
    const r=await preview({env:PR,nowMs:NOW,transport:s.transport});
    assert.equal(r.status,'SCHEDULED_SOURCE_METADATA_UNVERIFIED');
    assert.equal(JSON.stringify(r).includes(TOKEN),false);
    assert.equal(JSON.stringify(r).includes(ID),false);
    assert.equal(r.artifactDownloaded,false);
  }
});
test('Validated metadata cannot be mistaken for event acceptance or real capacity',()=>{
  assert.equal(validateRun(run(),NOW),true);
  assert.equal(validateRun(run({event:'push'}),NOW),false);
  assert.equal(validateRun(run({name:'Kings Convoy Checker (dry-run)'}),NOW),false);
});
