'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  officialWebhookId, selectChannel, assertPrivateLeadershipChannel,
  parseWelcomeMessage, selectEarliestWelcomes, currentDrivers,
  buildWelcomeRows, buildWelcomePages, generateWelcomeReview
} = require('../driver-welcome-register-review.js');

const GUILD = '1114967437788577792';
const SOURCE = '1777777777777777771';
const DEST = '1777777777777777772';
const WEBHOOK = '444444444444444444';
const DRIVER = '111111111111111111';
const TRIAL = '222222222222222222';
const FORMER = '333333333333333333';
const DRIVER_ROLE = '1204836048845410405';
const TRIAL_ROLE = '170000000000000001';
const MANAGEMENT_ROLE = '170000000000000002';
const webhookUrl = 'https://discord.com/api/webhooks/'+WEBHOOK+'/test-token';

function welcome(discordId=DRIVER, timestamp='2026-10-01T12:30:00.000Z', id='900000000000000001') {
  return {
    id, webhook_id:WEBHOOK, timestamp, content:'<@'+discordId+'>',
    embeds:[{
      title:'👑 Welcome to the Kings Family!',
      description:'Please welcome <@'+discordId+'> to **Kings Logistics** as a **Driver**!'
    }]
  };
}
function privateChannel() {
  return {
    id:DEST,guild_id:GUILD,name:'🚛｜driver-leadership',type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      {id:MANAGEMENT_ROLE,type:0,allow:'1024',deny:'0'}
    ]
  };
}
function roles() {
  return [
    {id:DRIVER_ROLE,name:'Kings Driver'},
    {id:TRIAL_ROLE,name:'Kings Trial'},
    {id:MANAGEMENT_ROLE,name:'Management'}
  ];
}
function members() {
  return [
    {user:{id:DRIVER,bot:false},roles:[DRIVER_ROLE]},
    {user:{id:TRIAL,bot:false},roles:[TRIAL_ROLE]},
    {user:{id:FORMER,bot:false},roles:[]}
  ];
}
test('extract only official webhook welcome messages with one unambiguous Discord ID',()=>{
  assert.equal(officialWebhookId(webhookUrl),WEBHOOK);
  assert.throws(()=>officialWebhookId('https://evil.example/api/webhooks/'+WEBHOOK+'/x'),/belong to Discord/);
  assert.throws(()=>officialWebhookId('not a URL'),/missing or invalid/);
  assert.equal(parseWelcomeMessage(welcome(),WEBHOOK).discordId,DRIVER);
  assert.equal(parseWelcomeMessage(welcome(),WEBHOOK).sentAt,'2026-10-01T12:30:00.000Z');
  assert.equal(parseWelcomeMessage(welcome(),FORMER),null,'Different webhook cannot impersonate welcome');
  const promo=welcome();promo.embeds[0].title='🎉 Congratulations on Becoming a Kings Driver!';
  assert.equal(parseWelcomeMessage(promo,WEBHOOK),null,'Promotion is not original onboarding');
  const other=welcome();other.content='<@'+TRIAL+'>';
  assert.equal(parseWelcomeMessage(other,WEBHOOK),null,'Conflicting mentions must be rejected');
  const wrong=welcome();wrong.embeds[0].description='Please welcome a named driver with no verified ID.';
  assert.equal(parseWelcomeMessage(wrong,WEBHOOK),null,'Do not match display names');
});

test('multiple welcomes for same member preserve oldest observed message, never claim verified join date',()=>{
  const messages=[
    welcome(DRIVER,'2026-11-01T12:30:00.000Z','900000000000000002'),
    welcome(DRIVER,'2026-10-01T12:30:00.000Z','900000000000000001'),
    welcome(TRIAL,'2026-11-05T12:30:00.000Z','900000000000000003')
  ];
  const map=selectEarliestWelcomes(messages,WEBHOOK);
  assert.equal(map.size,2);
  assert.equal(map.get(DRIVER).count,2);
  assert.equal(map.get(DRIVER).sentAt,'2026-10-01T12:30:00.000Z');
  assert.equal(map.get(DRIVER).messageId,'900000000000000001');
  const rows=buildWelcomeRows([{discordId:DRIVER,role:'Driver'},{discordId:FORMER,role:'Driver'}],map,GUILD,SOURCE);
  assert.equal(rows[0].welcomeFound,true);
  assert.match(rows[0].text,/01\.10\.2026/);
  assert.match(rows[0].text,/2×/);
  assert.match(rows[0].text,new RegExp('discord.com/channels/'+GUILD+'/'+SOURCE+'/900000000000000001'));
  assert.equal(rows[1].welcomeFound,false);
  assert.match(rows[1].text,/No verified welcome in scan/);
});

test('verified Kings Driver and Trial roles determine list, former members excluded',()=>{
  const out=currentDrivers(roles(),members());
  assert.equal(out.length,2);
  assert.deepEqual(out.map(x=>x.discordId),[DRIVER,TRIAL]);
  assert.deepEqual(out.map(x=>x.role),['Driver','Trial']);
  assert.throws(()=>currentDrivers([{id:DRIVER_ROLE,name:'Separator'}],members()),/role not found/);
  assert.throws(()=>currentDrivers(roles(),[members()[0],members()[0]]),/Duplicate Kings Discord/);
});

test('Leadership output is private: @everyone and Driver roles cannot view explicitly',()=>{
  assert.doesNotThrow(()=>assertPrivateLeadershipChannel(privateChannel(),roles(),GUILD));
  const everyone={...privateChannel(),permission_overwrites:[
    {id:GUILD,type:0,allow:'1024',deny:'0'}
  ]};
  assert.throws(()=>assertPrivateLeadershipChannel(everyone,roles(),GUILD),/@everyone View Channel denied/);
  const driverAccess={...privateChannel(),permission_overwrites:[
    ...privateChannel().permission_overwrites,
    {id:DRIVER_ROLE,type:0,allow:'1024',deny:'0'}
  ]};
  assert.throws(()=>assertPrivateLeadershipChannel(driverAccess,roles(),GUILD),/non-Leadership role/);
});

test('Driver Leadership and Driver Management roles are not mistaken for ordinary Kings Driver roles',()=>{
  const access=[
    {id:'170000000000000010',name:'Driver Leadership'},
    {id:'170000000000000011',name:'Driver Management'},
    {id:'170000000000000012',name:'Kings Driver Leadership'}
  ];
  const channel={...privateChannel(),permission_overwrites:[
    ...privateChannel().permission_overwrites,
    ...access.map(role=>({id:role.id,type:0,allow:'1024',deny:'0'}))
  ]};
  assert.doesNotThrow(()=>assertPrivateLeadershipChannel(channel,[...roles(),...access],GUILD));
  const broad={...channel,permission_overwrites:[
    ...channel.permission_overwrites,
    {id:'170000000000000013',type:0,allow:'1024',deny:'0'}
  ]};
  const entries=[...roles(),...access,{id:'170000000000000013',name:'Kings Trial'}];
  assert.throws(()=>assertPrivateLeadershipChannel(broad,entries,GUILD),/non-Leadership role.*kings-trial/);
  assert.throws(()=>assertPrivateLeadershipChannel({
    ...privateChannel(),permission_overwrites:[
      ...privateChannel().permission_overwrites,{id:DRIVER_ROLE,type:0,allow:'1024',deny:'0'}
    ]
  },roles(),GUILD),/non-Leadership role.*kings-driver/);
});

test('read-only preview can inspect welcome history without private publish permission but publish cannot',async()=>{
  const publicDestination={...privateChannel(),permission_overwrites:[
    {id:GUILD,type:0,allow:'1024',deny:'0'}
  ]};
  const payload=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  const transport=async (url,options)=>{
    assert.equal(options.method,'GET');
    const route=url.replace('https://discord.com/api/v10','');
    if(route==='/guilds/'+GUILD+'/channels') return payload([
      {id:SOURCE,guild_id:GUILD,name:'🚛｜driver-updates',type:0},publicDestination
    ]);
    if(route==='/guilds/'+GUILD+'/roles') return payload(roles());
    if(route.startsWith('/guilds/'+GUILD+'/members?'))return payload(members());
    if(route.startsWith('/channels/'+SOURCE+'/messages?'))return payload([welcome()]);
    throw Error('Unexpected read-only Discord path');
  };
  const preview=await generateWelcomeReview({
    token:'test-bot',webhookUrl,transport,enforcePrivateDestination:false
  });
  assert.equal(preview.counts.withWelcome,1);
  assert.equal(preview.pages.length,1);
  await assert.rejects(generateWelcomeReview({
    token:'test-bot',webhookUrl,transport,enforcePrivateDestination:true
  }),/@everyone View Channel denied/);
});

test('paginate Discord output within strict message length and never set Kings joining dates automatically',()=>{
  const base=Array.from({length:80},(_,i)=>({
    discordId:String(200000000000000001n+BigInt(i)),role:'Driver',
    welcomeFound:false,text:'• \`'+String(200000000000000001n+BigInt(i))+'\` • Driver • *No verified welcome in scan*'
  }));
  const pages=buildWelcomePages(base,{completeScan:false,scannedMessages:3000});
  assert.ok(pages.length>1);
  assert.ok(pages.every(page=>page.length<=1900));
  assert.match(pages[0],/Welcome message timestamp ≠ verified Kings joining date/);
  assert.match(pages[0],/Only most recent 3000 messages checked/);
  assert.doesNotMatch(pages.join('\n'),/kings_join_date: \d|auto-assigned|automatic award/i);
});

test('read-only Discord source scan yields ID/date leadership candidates without register writes',async()=>{
  const calls=[];
  const payload=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  const transport=async (url,options)=>{
    calls.push({url,method:options.method});
    if (options.method!=='GET') throw new Error('Review may not write Discord');
    const route=url.replace('https://discord.com/api/v10','');
    if(route==='/guilds/'+GUILD+'/channels')return payload([
      {id:SOURCE,guild_id:GUILD,name:'🚛｜driver-updates',type:0},
      privateChannel()
    ]);
    if(route==='/guilds/'+GUILD+'/roles')return payload(roles());
    if(route.startsWith('/guilds/'+GUILD+'/members?'))return payload(members());
    if(route.startsWith('/channels/'+SOURCE+'/messages?'))return payload([
      welcome(DRIVER),
      welcome(FORMER,'2026-10-02T12:30:00.000Z','900000000000000004')
    ]);
    throw Error('Unexpected Discord route '+route);
  };
  const r=await generateWelcomeReview({token:'test-bot',webhookUrl,transport});
  assert.equal(r.counts.currentDrivers,2);
  assert.equal(r.counts.withWelcome,1);
  assert.equal(r.counts.withoutWelcome,1);
  assert.equal(r.counts.completeScan,true);
  assert.equal(r.leadershipChannelId,DEST);
  assert.match(r.pages.join('\n'),new RegExp(DRIVER));
  assert.match(r.pages.join('\n'),new RegExp(TRIAL));
  assert.doesNotMatch(r.pages.join('\n'),new RegExp(FORMER),'Former driver not listed');
  assert.ok(calls.every(c=>c.method==='GET'),'Read-only scan must not write messages');
});

test('reuses existing 42-workflow registry and only runs manual welcome review modes',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/driver-leadership-reports.yml'),'utf8');
  assert.match(workflow,/welcome-review-preview/);
  assert.match(workflow,/welcome-review-publish/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/LEADERSHIP_CONSOLIDATED_ONLY: 'false'/);
  assert.match(workflow,/DRIVER_UPDATES_WEBHOOK_URL: \$\{\{ secrets\.DRIVER_UPDATES_WEBHOOK_URL \}\}/);
  assert.match(workflow,/DRIVER_WELCOME_REVIEW_MODE: \$\{\{ inputs\.report/);
  assert.match(workflow,/Read-only Welcome Review privacy preflight/);
  assert.match(workflow,/DRIVER_WELCOME_REVIEW_MODE: preflight/);
  assert.match(workflow,/continue-on-error: true/);
  assert.doesNotMatch(workflow,/run: node driver-welcome-register-review.js[\s\S]*Save.+Register/i);
});
