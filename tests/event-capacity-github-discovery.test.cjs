'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPrivateGitHubReader}=require('../event-capacity-github-source');
const REPO='Stinkesocke107/kings-logistics-automation';
const NOW=Date.parse('2027-03-20T12:00:00Z'),SHA='1'.repeat(40);
const RUN='45502949674';
function valid(id=RUN,overrides={}){
  return {id:Number(id),name:'Kings Convoy Checker',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,status:'completed',conclusion:'success',
    event:'schedule',run_attempt:1,run_started_at:'2027-03-20T11:52:00Z',
    updated_at:'2027-03-20T11:59:00Z',...overrides};
}
function jsonResult(value){
  const bytes=Buffer.from(JSON.stringify(value));
  return {
    ok:true,status:200,headers:{get:x=>x==='content-length'?String(bytes.length):null},
    body:{getReader:()=>{
      let sent=false;
      return {read:async()=>{
        if(sent)return {done:true};
        sent=true;return {done:false,value:bytes};
      },cancel:async()=>{}};
    }}
  };
}
function reader(runs,{error=false}={}){
  const calls=[];
  const transport=async(url,config)=>{
    calls.push({url,config});
    if(error)throw Error('synthetic PRIVATE TOKEN never log');
    return jsonResult({total_count:runs.length,workflow_runs:runs});
  };
  return {client:createPrivateGitHubReader({
    token:'synthetic-private-token-of-at-least-16-chars',transport}),calls};
}
test('Private source discovery selects newest eligible recent scheduled main run',async()=>{
  const future=valid(String(BigInt(RUN)+2n),{event:'push'});
  const old=valid(String(BigInt(RUN)+1n),{
    updated_at:'2027-03-20T10:00:00Z'});
  const {client,calls}=reader([old,valid(),future]);
  const found=await client.getLatestScheduledRun({repository:REPO,nowMs:NOW});
  assert.deepEqual(found,{runId:RUN,attempt:1});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/event=schedule&per_page=20$/);
  assert.equal(calls[0].config.method,'GET');
  assert.equal(calls[0].config.redirect,'manual');
});
test('Scheduled list discovery never auto-promotes a manually dispatched run',async()=>{
  const {client}=reader([valid(RUN,{event:'workflow_dispatch',inputs:{mode:'live'}})]);
  await assert.rejects(client.getLatestScheduledRun({repository:REPO,nowMs:NOW}));
});
test('Unverified sources cannot pass source selection or expose raw errors',async()=>{
  const {client}=reader([valid(RUN,{head_repository:{full_name:'attacker/other'}})]);
  await assert.rejects(client.getLatestScheduledRun({repository:REPO,nowMs:NOW}));
  const errorClient=reader([],{error:true}).client;
  await assert.rejects(errorClient.getLatestScheduledRun({repository:REPO,nowMs:NOW}),
    err=>!String(err).includes('PRIVATE TOKEN'));
});
test('Wrong repo, stale sources and empty verified inventory fail closed',async()=>{
  const {client}=reader([]);
  await assert.rejects(client.getLatestScheduledRun({
    repository:'other/repo',nowMs:NOW}));
  await assert.rejects(client.getLatestScheduledRun({repository:REPO,nowMs:NOW}));
  await assert.rejects(client.getLatestScheduledRun({repository:REPO,nowMs:NaN}));
});
