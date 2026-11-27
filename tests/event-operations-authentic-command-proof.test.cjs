'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {COUNT_FIELDS}=require('../event-leadership-observation');
const {encryptEventState}=require('../event-leadership-state');
const {renderPrivateReviewTokens}=require('../event-operations-manual-review-state');
const {ingest,GUILD}=require('../event-operations-discord-review-source');
const {verify,MAX_PROOF_DELAY_MS}=require('../event-operations-authentic-command-proof');

const NOW=Date.parse('2026-11-27T03:00:00.000Z');
const SECRET='SYNTHETIC_NEVER_REAL_PRIVATE_KEY_'.repeat(2);
const CHANNEL='777777777777777770',ROLE='777777777777777771';
const BOTROLE='777777777777777772',BOT='777777777777777773';
const STAFF='777777777777777774';
const CURSOR='777777777777777780',COMMAND='777777777777777781';
function state(){
  const iso=new Date(NOW).toISOString();
  return {
    version:1,createdAt:iso,updatedAt:iso,lastSnapshot:null,
    changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
    publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
    discordReviewCursor:CURSOR,
    eventSourceObservation:{
      version:1,observedAt:iso,
      sourceCompiledAt:new Date(NOW-300000).toISOString(),
      sourceReconciled:true,readOnly:true,historyVerified:false,
      staffApprovalsVerified:false,freeSlotsCertified:false,bookingsCreated:0,
      ...Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),
      tracked:4,scheduled:2,readyForApproval:1,needsInformation:1,
      historyCenterClaims:2,historyLegacyClaims:1,
      historyMonthsWithClaims:3,historyMonthsWithoutClaims:21,
      historyMonthsCenterOnly:2,historyMonthsLegacyOnly:1,
      historyLegacyEvidencePending:1,
      futureDaysOverDailyLimit:1,futureDaysRequiringReview:1,
      reviewAgenda:[{code:'FUTURE_LEGACY_HOLD',utcMonth:'2026-12',count:1}]
    }
  };
}
function commandToken(before){
  const line=renderPrivateReviewTokens(before,SECRET,NOW).split('\n')
    .find(t=>t.includes('Review UTC days above 3 source-claimed convoys'));
  assert.ok(line,'Synthetic worklist must issue an eligible token');
  const match=line.match(/KR[a-f0-9]{24}/);
  assert.ok(match);
  return match[0];
}
function message(id,content){
  return {id,channel_id:CHANNEL,author:{id:STAFF,bot:false},content};
}
function discord(messages){
  const requests=[];
  const response=async(url,options)=>{
    requests.push({url,method:options.method});
    assert.equal(options.method,'GET');
    let data;
    if(url.endsWith('/channels/'+CHANNEL))data={
      id:CHANNEL,guild_id:GUILD,type:0,permission_overwrites:[
        {id:GUILD,type:0,allow:'0',deny:'1024'},
        {id:ROLE,type:0,allow:'3072',deny:'0'},
        {id:BOTROLE,type:0,allow:'3072',deny:'0'}
      ]};
    else if(url.endsWith('/guilds/'+GUILD+'/roles'))data=[
      {id:GUILD,name:'@everyone',permissions:'0'},
      {id:ROLE,name:'Event Coordinator',permissions:'0'},
      {id:BOTROLE,name:'Bot',permissions:'0'}
    ];
    else if(url.endsWith('/users/@me'))data={id:BOT,bot:true};
    else if(url.endsWith('/guilds/'+GUILD+'/members/'+BOT))data={roles:[BOTROLE]};
    else if(url.endsWith('/guilds/'+GUILD+'/members/'+STAFF))data={roles:[ROLE]};
    else if(url.includes('/channels/'+CHANNEL+'/messages?')){
      const before=new URL(url).searchParams.get('before');
      data=messages.filter(m=>!before||BigInt(m.id)<BigInt(before))
        .sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1).slice(0,100);
    }else throw Error('Unexpected Discord route');
    return {ok:true,json:async()=>data};
  };
  return {transport:response,requests};
}
function env(){
  return {GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    INPUT_REPORT:'command-proof',RUNNER_TEMP:'/tmp',
    DRIVER_STATE_KEY:SECRET,DISCORD_BOT_TOKEN:'SYNTHETIC_BOT_TOKEN',
    KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID:CHANNEL,
    KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS:ROLE};
}
async function context(){
  const before=state();
  const cmd='!kings-review '+commandToken(before)+' start';
  const requests=discord([message(COMMAND,cmd),message(CURSOR,'setup')]);
  const result=await ingest({state:before,secret:SECRET,
    token:'SYNTHETIC_BOT_TOKEN',channelId:CHANNEL,
    staffRoleIds:[ROLE],transport:requests.transport,nowMs:NOW});
  assert.equal(result.mode,'SOURCE_REVIEWS_RECORDED');
  const prior=encryptEventState(before,SECRET);
  const recorded=encryptEventState(result.state,SECRET);
  const read=file=>{
    if(file.endsWith('/kings-event-command-before.json'))return JSON.stringify(prior);
    if(file.endsWith('/kings-event-command-after.json'))return JSON.stringify(recorded);
    if(file.endsWith('/data/event-leadership-report-state.json'))
      return JSON.stringify(recorded);
    throw Error('Unexpected private file read');
  };
  const readback=async()=>({status:'VERIFIED',readOnlyDiscord:true,
    discordWrites:0,bookingsCreated:0});
  return {before,after:result.state,recorded,read,readback,requests,
    env:env(),nowMs:NOW+1000};
}
test('actual Discord parser can reproduce one new protected Staff review and accepted dashboard readback',async()=>{
  const c=await context();
  const proof=await verify({
    env:c.env,nowMs:c.nowMs,transport:c.requests.transport,
    read:c.read,readback:c.readback
  });
  assert.equal(proof.status,'EVENT_STAFF_COMMAND_TO_STORED_DASHBOARD_VERIFIED');
  assert.equal(proof.readOnly,true);
  assert.equal(proof.discordWrites,0);
  assert.equal(proof.bookingsCreated,0);
  assert.equal(proof.finalOwnerAcceptance,false);
  assert.ok(c.requests.requests.every(x=>x.method==='GET'));
});
test('cannot accept older snapshots, unrecorded reviews or stale approval windows',async()=>{
  const c=await context();
  for(const config of [
    {env:{...c.env,GITHUB_REF:'refs/heads/feature'}},
    {env:{...c.env,INPUT_REPORT:'integration-check'}},
    {nowMs:NOW+MAX_PROOF_DELAY_MS+1},
    {read:file=>file.endsWith('kings-event-command-after.json')?
      JSON.stringify(encryptEventState(c.before,SECRET)):c.read(file)},
    {read:file=>file.endsWith('data/event-leadership-report-state.json')?
      JSON.stringify(encryptEventState(c.before,SECRET)):c.read(file)}
  ]){
    await assert.rejects(()=>verify({
      env:c.env,nowMs:c.nowMs,read:c.read,
      transport:c.requests.transport,readback:c.readback,...config
    }),/unverified/);
  }
});
test('changed or missing Discord replay or unverified actual dashboard never passes',async()=>{
  const c=await context();
  await assert.rejects(()=>verify({
    env:c.env,nowMs:c.nowMs,read:c.read,
    transport:discord([]).transport,readback:c.readback
  }),/unverified/);
  await assert.rejects(()=>verify({
    env:c.env,nowMs:c.nowMs,read:c.read,
    transport:c.requests.transport,
    readback:async()=>({status:'UNVERIFIED',readOnlyDiscord:true,
      discordWrites:0,bookingsCreated:0})
  }),/unverified/);
  await assert.rejects(()=>verify({
    env:c.env,nowMs:c.nowMs,read:c.read,
    transport:c.requests.transport,
    readback:async()=>({status:'VERIFIED',readOnlyDiscord:true,
      discordWrites:1,bookingsCreated:0})
  }),/unverified/);
  const extra=discord([
    message(String(BigInt(COMMAND)+1n),'unrelated new message'),
    message(COMMAND,'!kings-review '+commandToken(c.before)+' start'),
    message(CURSOR,'setup')
  ]);
  await assert.rejects(()=>verify({
    env:c.env,nowMs:c.nowMs,read:c.read,
    transport:extra.transport,readback:c.readback
  }),/unverified/);
});
test('existing Event Leadership workflow gates command proof as manual GET-only and without new workflow',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..',
    '.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.match(workflow,/          - command-proof/);
  assert.match(workflow,/event_staff_command_verify:/);
  assert.match(workflow,/inputs\.report == 'command-proof'/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/node event-operations-authentic-command-proof\.js/);
  assert.match(workflow,/inputs\.report != 'command-proof'/);
  assert.doesNotMatch(workflow,/command-proof[^\\n]*(?:POST|PATCH|DELETE)/);
});
