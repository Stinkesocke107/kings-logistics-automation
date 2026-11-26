'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {COUNT_FIELDS}=require('../event-leadership-observation');
const {encryptEventState,decryptEventState}=require('../event-leadership-state');
const {renderPrivateReviewTokens}=require('../event-operations-manual-review-state');
const {GUILD,roleIdsFromSecret,validatePrivateChannel,parseCommand,ingest}
  =require('../event-operations-discord-review-source');
const {run}=require('../event-operations-discord-review');
const NOW=Date.parse('2026-11-26T14:00:00.000Z');
const SECRET='ENCRYPTED_FAKE_TOKEN_MATERIAL_'.repeat(2);
const CHANNEL='777777777777777770',ROLE='777777777777777771';
const BOTROLE='777777777777777772',BOT='777777777777777773';
const STAFF='777777777777777774',OUTSIDER='777777777777777775';
const MSG1='777777777777777780',MSG2='777777777777777781',MSG3='777777777777777782';
const everyone={id:GUILD,name:'@everyone',permissions:'0'};
const guildRoles=[
  everyone,{id:ROLE,name:'Event Coordinator',permissions:'0'},
  {id:BOTROLE,name:'Bots',permissions:'0'}
];
const channel={
  id:CHANNEL,guild_id:GUILD,type:0,
  permission_overwrites:[
    {id:GUILD,type:0,allow:'0',deny:'1024'},
    {id:ROLE,type:0,allow:'3072',deny:'0'},
    {id:BOTROLE,type:0,allow:'3072',deny:'0'}
  ]
};
const bot={id:BOT,bot:true},botMember={roles:[BOTROLE]};
function sourceState(now=NOW){
 const iso=new Date(now).toISOString();
 return {
   version:1,createdAt:iso,updatedAt:iso,lastSnapshot:null,
   changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
   publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
   eventSourceObservation:{
     version:1,observedAt:iso,
     sourceCompiledAt:new Date(now-300000).toISOString(),
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
function reviewToken(state=sourceState()){
 const line=renderPrivateReviewTokens(state,SECRET,NOW).split('\n')
   .find(x=>x.includes('Review UTC days above 3 source-claimed convoys'));
 assert.ok(line);
 return line.match(/KR[a-f0-9]{24}/)[0];
}
function message(id,content,author=STAFF){
 return {id,channel_id:CHANNEL,author:{id:author,bot:false},content};
}
function discordFetch(messages=[],opts={}){
 const seen=[];
 const t=async(url,options)=>{
   seen.push({url,method:options.method});
   assert.equal(options.method,'GET');
   assert.match(url,/^https:\/\/discord\.com\/api\/v10\//);
   let result;
   if(url.endsWith('/channels/'+CHANNEL))result=opts.channel||channel;
   else if(url.endsWith('/guilds/'+GUILD+'/roles'))result=opts.roles||guildRoles;
   else if(url.endsWith('/users/@me'))result=bot;
   else if(url.endsWith('/guilds/'+GUILD+'/members/'+BOT))result=botMember;
   else if(url.endsWith('/guilds/'+GUILD+'/members/'+STAFF))
     result={roles:opts.staffRoles||[ROLE]};
   else if(url.endsWith('/guilds/'+GUILD+'/members/'+OUTSIDER))
     result={roles:[]};
   else if(url.includes('/channels/'+CHANNEL+'/messages?')){
     const before=new URL(url).searchParams.get('before');
     result=messages.filter(m=>!before||BigInt(m.id)<BigInt(before))
       .slice(0,100);
   }else throw Error('Unexpected synthetic GET route');
   return {ok:true,json:async()=>result};
 };
 return {transport:t,seen};
}
const args={secret:SECRET,token:'SYNTHETIC_BOT_TOKEN',channelId:CHANNEL,
  staffRoleIds:[ROLE],nowMs:NOW};
test('staff channel is private, Event Coordination role verified, and no broad guild access is accepted',()=>{
 assert.deepEqual(roleIdsFromSecret(ROLE),[ROLE]);
 assert.equal(validatePrivateChannel({
   channel,roles:guildRoles,bot,botMember,allowedRoles:[ROLE],
   channelId:CHANNEL
 }),true);
 for(const broken of [
   {...channel,permission_overwrites:channel.permission_overwrites.slice(1)},
   {...channel,permission_overwrites:[
     {...channel.permission_overwrites[0],deny:'0'},
     ...channel.permission_overwrites.slice(1)]},
   {...channel,permission_overwrites:[...channel.permission_overwrites,
     {id:OUTSIDER,type:1,allow:'1024',deny:'0'}]},
   {...channel,permission_overwrites:[...channel.permission_overwrites,
     {id:OUTSIDER,type:0,allow:'1024',deny:'0'}]},
   {...channel,type:5},
   {...channel,guild_id:OUTSIDER}
 ])assert.throws(()=>validatePrivateChannel({
   channel:broken,roles:guildRoles,bot,botMember,
   allowedRoles:[ROLE],channelId:CHANNEL
 }),/unverified/);
 assert.throws(()=>validatePrivateChannel({
   channel,roles:[everyone,
     {id:ROLE,name:'Verified Driver',permissions:'0'},
     ...guildRoles.slice(2)],bot,botMember,
   allowedRoles:[ROLE],channelId:CHANNEL
 }),/unverified/);
 for(const invalid of ['',ROLE+','+ROLE,GUILD,'123','not-a-role'])
   assert.throws(()=>roleIdsFromSecret(invalid),/unverified/);
});
test('Discord command format is strict and never accepts original evidence, URLs or mentions',()=>{
 const token=reviewToken();
 assert.deepEqual(parseCommand('!kings-review '+token+' start'),{
   token,action:'start',evidenceKind:'NONE',confirmation:''
 });
 assert.deepEqual(parseCommand('!kings-review '+token+
   ' record_check STAFF_RECORD ORIGINAL_RECORDS_CHECKED'),{
     token,action:'record_check',evidenceKind:'STAFF_RECORD',
     confirmation:'ORIGINAL_RECORDS_CHECKED'
   });
 for(const input of [
   '!kings-review '+token+' approve',
   '!kings-review '+token+' record_check',
   '!kings-review '+token+' start https://private.url',
   '!kings-review '+token+' start @everyone',
   '!kings-review '+token+' record_check STAFF_RECORD message-link',
   '!kings-review '+token+' record_check NONE ORIGINAL_RECORDS_CHECKED',
   '!kings-review '+token+' start\n!kings-review '+token+' block'
 ])assert.equal(parseCommand(input),null);
});
test('first activation BOOTSTRAPS cursor but never executes old Discord messages',async()=>{
 const state=sourceState(),token=reviewToken(state);
 const {transport,seen}=discordFetch([message(MSG1,'!kings-review '+token+' start')]);
 const x=await ingest({state,...args,transport});
 assert.equal(x.mode,'BOOTSTRAPPED');
 assert.equal(x.state.discordReviewCursor,MSG1);
 assert.equal(x.state.operationReviews,undefined);
 assert.equal(x.readOnlyDiscord,true);
 assert.ok(seen.every(x=>x.method==='GET'));
 const again=await ingest({state:x.state,...args,transport});
 assert.equal(again.mode,'NO_NEW_MESSAGES');
 assert.equal(again.changed,false);
});
test('authorized human command changes only encrypted Staff journal, not source flags',async()=>{
 const state={...sourceState(),discordReviewCursor:MSG1},token=reviewToken(state);
 const {transport,seen}=discordFetch([
   message(MSG2,'!kings-review '+token+' start'),
   message(MSG1,'initial setup')
 ]);
 const result=await ingest({state,...args,transport});
 assert.equal(result.mode,'SOURCE_REVIEWS_RECORDED');
 assert.equal(result.state.discordReviewCursor,MSG2);
 assert.equal(result.state.operationReviews.length,1);
 assert.equal(result.state.operationReviews[0].status,'IN_REVIEW');
 assert.equal(result.state.operationReviews[0].actor,'discord-'+STAFF);
 assert.equal(result.state.eventSourceObservation.staffApprovalsVerified,false);
 assert.equal(result.state.eventSourceObservation.freeSlotsCertified,false);
 assert.equal(result.state.eventSourceObservation.bookingsCreated,0);
 assert.ok(seen.every(x=>x.method==='GET'));
 const replay=await ingest({state:result.state,...args,transport});
 assert.equal(replay.changed,false);
});
test('historical review can be manually checked only after start and explicit original-record confirmation',async()=>{
 const state={...sourceState(),discordReviewCursor:MSG1};
 const historicLine=renderPrivateReviewTokens(state,SECRET,NOW)
   .split('\n').find(x=>x.includes('2026-12'));
 assert.ok(historicLine);
 const historicToken=historicLine.match(/KR[a-f0-9]{24}/)[0];
 const messages=[
   message(MSG3,'!kings-review '+historicToken+
     ' record_check STAFF_RECORD ORIGINAL_RECORDS_CHECKED'),
   message(MSG2,'!kings-review '+historicToken+' start'),
   message(MSG1,'setup')
 ];
 const {transport}=discordFetch(messages);
 const x=await ingest({state,...args,transport});
 assert.equal(x.state.operationReviews.length,1);
 assert.equal(x.state.operationReviews[0].scope,'history');
 assert.equal(x.state.operationReviews[0].month,'2026-12');
 assert.equal(x.state.operationReviews[0].status,'STAFF_CHECK_RECORDED');
 assert.equal(x.state.operationReviews[0].audit.length,2);
 assert.equal(x.state.operationReviews[0].actor,'discord-'+STAFF);
 assert.equal(x.state.discordReviewIgnored,0);
});
test('unauthorized members and expired tokens never change review records',async()=>{
 const state={...sourceState(),discordReviewCursor:MSG1};
 const token=reviewToken(state);
 const messages=[
   message(MSG3,'!kings-review '+token+' start',OUTSIDER),
   message(MSG2,'!kings-review KR'+'0'.repeat(24)+' start',STAFF),
   message(MSG1,'setup')
 ];
 const {transport}=discordFetch(messages);
 const x=await ingest({state,...args,transport});
 assert.equal(x.changed,true);
 assert.equal(x.state.operationReviews,undefined);
 assert.equal(x.state.discordReviewIgnored,2);
 assert.equal(x.state.discordReviewCursor,MSG3);
});
test('no MESSAGE_CONTENT privileged intent and lost backlog fail closed without saving anything',async()=>{
 const state={...sourceState(),discordReviewCursor:MSG1};
 const {transport}=discordFetch([
   message(MSG2,''),message(MSG1,'setup')
 ]);
 await assert.rejects(()=>ingest({state,...args,transport}),/unverified/);
 const wrong={...channel,type:15};
 const f=discordFetch([message(MSG2,'!kings-review '+reviewToken(state)+' start')],
   {channel:wrong});
 await assert.rejects(()=>ingest({state,...args,transport:f.transport}),/unverified/);
 const oldMessages=Array.from({length:800},(_,i)=>
   message(String(880000000000000000n-BigInt(i)),
     '!kings-review '+reviewToken(state)+' start'));
 const many=discordFetch(oldMessages);
 await assert.rejects(()=>ingest({state,...args,transport:many.transport}),/unverified/);
});
test('VERIFY_ONLY checks real private Discord source access without reading commands or state',async()=>{
 const requests=discordFetch([message(MSG2,'!kings-review '+reviewToken()+' start')]);
 let stateReads=0,encryptedWrites=0;
 const env={
   GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
   KINGS_EVENT_DISCORD_REVIEW_ENABLED:'VERIFY_ONLY',
   KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID:CHANNEL,
   KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS:ROLE,
   DISCORD_BOT_TOKEN:'SYNTHETIC_BOT_TOKEN'
 };
 const opts={
   env,nowMs:NOW,transport:requests.transport,
   read:()=>{stateReads++;throw Error('preflight must not read private state');},
   write:()=>{encryptedWrites++;throw Error('preflight must not write state');}
 };
 const result=await run(opts);
 assert.deepEqual(result,{
   status:'SOURCE_PRIVACY_VERIFIED',changed:false,
   readOnlyDiscord:true,discordWrites:0
 });
 assert.equal(stateReads,0);
 assert.equal(encryptedWrites,0);
 assert.equal(requests.seen.length,4);
 assert.ok(requests.seen.every(x=>x.method==='GET'));
 assert.ok(requests.seen.every(x=>!x.url.includes('/messages?')));
 assert.ok(requests.seen.every(x=>!x.url.includes('/members/'+STAFF)));
 const invalid=discordFetch([],{channel:{...channel,type:5}});
 await assert.rejects(()=>run({
   ...opts,transport:invalid.transport
 }),/unverified/);
 assert.equal(stateReads,0);
 assert.equal(encryptedWrites,0);
 assert.ok(invalid.seen.every(x=>!x.url.includes('/messages?')));
 await assert.rejects(()=>run({...opts,env:{
   ...env,GITHUB_REF:'refs/heads/untrusted'
 }}),/not authorized/);
 assert.equal(stateReads,0);
});
test('disabled entrypoint performs no reads; enabled path encrypts cursor, never prints private data',async()=>{
 const state=sourceState(),container=encryptEventState(state,SECRET);
 const writes=[];
 const fetcher=discordFetch([]);
 const env={
   GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',
   DISCORD_BOT_TOKEN:'SYNTHETIC_BOT_TOKEN',
   DRIVER_STATE_KEY:SECRET,
   KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID:CHANNEL,
   KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS:ROLE
 };
 const opts={
   env,nowMs:NOW,transport:fetcher.transport,
   read:()=>JSON.stringify(container),
   write:(file,data)=>writes.push({file,data})
 };
 const disabled=await run(opts);
 assert.equal(disabled.status,'DISABLED');
 assert.equal(fetcher.seen.length,0);
 assert.equal(writes.length,0);
 const enabled=await run({...opts,env:{
   ...env,KINGS_EVENT_DISCORD_REVIEW_ENABLED:'ENABLED'
 }});
 assert.equal(enabled.status,'BOOTSTRAPPED');
 assert.equal(writes.length,1);
 assert.equal(JSON.parse(writes[0].data).encrypted,true);
 assert.ok(!writes[0].data.includes(CHANNEL));
 assert.ok(!writes[0].data.includes(ROLE));
 assert.equal(decryptEventState(JSON.parse(writes[0].data),SECRET)
   .discordReviewCursor,'0');
 await assert.rejects(()=>run({...opts,env:{
   ...env,KINGS_EVENT_DISCORD_REVIEW_ENABLED:'ENABLED',
   KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS:''
 }}),/unverified/);
 assert.equal(writes.length,1);
});
test('GitHub schedule is opt-in; private source command channel and role IDs exist only as secrets',()=>{
 const root=path.resolve(__dirname,'..');
 const workflow=fs.readFileSync(path.join(root,
   '.github/workflows/event-operations-discord-review.yml'),'utf8');
 assert.match(workflow,/concurrency:\s*\n\s*group: kings-event-leadership-reports/);
 assert.match(workflow,/KINGS_EVENT_DISCORD_REVIEW_ENABLED: \$\{\{ secrets\.KINGS_EVENT_DISCORD_REVIEW_ENABLED \}\}/);
 assert.match(workflow,/KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID: \$\{\{ secrets\.KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID \}\}/);
 assert.match(workflow,/KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS: \$\{\{ secrets\.KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS \}\}/);
 assert.match(workflow,/git add data\/event-leadership-report-state\.json/);
 assert.doesNotMatch(workflow,/run:.*(?:post|patch|delete)|DISCORD_WRITE_MODE: 'true'/i);
 const source=fs.readFileSync(path.join(root,
   'event-operations-discord-review-source.js'),'utf8');
 assert.match(source,/method:'GET'/);
 assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});
