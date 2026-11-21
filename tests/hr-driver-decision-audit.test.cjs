'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {auditHrDecisions}=require('../hr-driver-decision-audit');

const GUILD='1114967437788577792';
const REGISTER='1572736232969084948';
const DECISIONS='1777777777777777778';
const OWNER='999000000000000001',MGR='999000000000000002',BOT='999000000000000003';
const DRIVER_ROLE='1204836048845410405',MGT_ROLE='170000000000000002';
const BOT_ROLE='170000000000000005';
const A='123456789012345678',B='123456789012345679';
const roles=[
  {id:GUILD,name:'everyone',permissions:'0'},
  {id:MGT_ROLE,name:'HR Management',permissions:'0'},
  {id:DRIVER_ROLE,name:'Kings Driver',permissions:'0'},
  {id:BOT_ROLE,name:'Kings Systems Bot',permissions:'0',tags:{bot_id:BOT}}
];
const members=[
  {user:{id:OWNER,bot:false},roles:[]},
  {user:{id:MGR,bot:false},roles:[MGT_ROLE]},
  {user:{id:BOT,bot:true},roles:[BOT_ROLE]},
  {user:{id:A,bot:false},roles:[DRIVER_ROLE]},
  {user:{id:B,bot:false},roles:[DRIVER_ROLE]}
];
const channel=(id)=>({id,guild_id:GUILD,type:0,permission_overwrites:[
  {id:GUILD,type:0,deny:'1024',allow:'0'},
  {id:MGT_ROLE,type:0,deny:'0',allow:'1024'},
  {id:BOT_ROLE,type:0,deny:'0',allow:'1024'}
]});
const registerMessages=[{
  id:'1777777777777777766',author:{id:MGR,bot:false},
  content:'discord_id: '+A+'\nkings_join_date: 2.2.2021'
    +'\n\ndiscord_id: '+B+'\nkings_join_date: 14.11.2026'
}];
function decisionMessage(id,person,admission) {
  return {
    id,author:{id:MGR,bot:false},timestamp:'2026-11-21T16:00:00Z',
    content:'KINGS_HR_DRIVER_DECISION_V1\ndiscord_id: '+person+
      '\ndecision: approved\nadmission: '+admission+
      '\nticket_id: 1777777777777777771',
    edited_timestamp:null,webhook_id:null
  };
}
function mockServer({decisions=[
  decisionMessage('1777777777777777781',A,'first'),
  decisionMessage('1777777777777777782',B,'return')
],hrChannel=channel(DECISIONS)}={}) {
  const calls=[];
  const transport=async (url,opts)=>{
    calls.push({url,method:opts.method,headers:opts.headers});
    assert.equal(opts.method,'GET');
    const request=new URL(url),p=request.pathname.replace(/^\/api\/v10/,'');
    let value;
    if(p==='/guilds/'+GUILD+'/roles')value=roles;
    else if(p==='/guilds/'+GUILD+'/members')value=members;
    else if(p==='/channels/'+DECISIONS)value=hrChannel;
    else if(p==='/guilds/'+GUILD)value={owner_id:OWNER};
    else if(p==='/users/@me')value={id:BOT};
    else if(p==='/guilds/'+GUILD+'/channels')value=[channel(REGISTER),hrChannel];
    else if(p==='/channels/'+REGISTER+'/messages')value=registerMessages;
    else if(p==='/channels/'+DECISIONS+'/messages')value=decisions;
    else throw Error('Unexpected mocked GET request path');
    return new Response(JSON.stringify(value),{status:200,
      headers:{'Content-Type':'application/json'}});
  };
  return {calls,transport};
}

test('unconfigured HR decision source does not read network or silently approve old Drivers',async()=>{
  let calls=0;
  const result=await auditHrDecisions({token:'fake',channelId:'',
    transport:async()=>{calls++;throw Error('No network allowed');}});
  assert.deepEqual(result,{status:'not-configured'});
  assert.equal(calls,0);
});

test('authorized HR decisions verify first admission and return approvals for current registered Drivers',async()=>{
  const mock=mockServer();
  const result=await auditHrDecisions({token:'fake-read-only',channelId:DECISIONS,
    transport:mock.transport});
  assert.deepEqual(result,{
    status:'complete-evidence',activeDrivers:2,originalIdentityRegistered:2,
    approvedFirst:1,approvedReturn:1,conflictingDecisions:0,
    approvedWithoutIdentity:0,noFormalDecisionEvidence:0,
    verifiedDecisionEvents:2,authority:'hr-human-approved-private-discord',
    privateCaseReviewCount:0,privateCaseViewPages:2,
    legacyNoFormalEvidence:0
  });
  assert.ok(mock.calls.length>=7);
  assert.ok(mock.calls.every(c=>c.method==='GET'));
  const sanitized=JSON.stringify(result);
  for(const secret of [A,B,MGR,'1777777777777777771','2021-02-02']) {
    assert.equal(sanitized.includes(secret),false);
  }
});

test('historical current Drivers without a stored HR decision remain NOT VERIFIED, not denied',async()=>{
  const mock=mockServer({decisions:[]});
  const result=await auditHrDecisions({token:'fake',channelId:DECISIONS,
    transport:mock.transport});
  assert.equal(result.status,'partial-evidence');
  assert.equal(result.noFormalDecisionEvidence,2);
  assert.equal(result.approvedFirst,0);
  assert.equal(result.privateCaseReviewCount,0);
  assert.equal(result.privateCaseViewPages,1);
  assert.equal(result.legacyNoFormalEvidence,2);
  assert.equal(result.conflictingDecisions,0);
});

test('an insecure HR evidence channel is rejected before reading any decision text',async()=>{
  const mock=mockServer({hrChannel:{...channel(DECISIONS),permission_overwrites:[
    {id:GUILD,type:0,deny:'0',allow:'1024'}
  ]}});
  await assert.rejects(auditHrDecisions({
    token:'fake',channelId:DECISIONS,transport:mock.transport
  }),/deny View Channel/);
  assert.equal(mock.calls.some(x=>new URL(x.url).pathname==='/channels/'+DECISIONS+'/messages'),false);
});

test('untrusted HR human author fails before an approval is counted',async()=>{
  const untrusted={...decisionMessage('1777777777777777781',A,'return'),
    author:{id:A,bot:false}};
  const mock=mockServer({decisions:[untrusted]});
  await assert.rejects(auditHrDecisions({
    token:'fake',channelId:DECISIONS,transport:mock.transport
  }),/trusted unedited human authorization/);
  assert.ok(mock.calls.every(c=>c.method==='GET'));
});

test('workflow checks decision source in existing daily audit but never writes HR decisions',()=>{
  const root=path.resolve(__dirname,'..');
  const workflow=fs.readFileSync(path.join(root,'.github','workflows','driver-register-onboarding.yml'),'utf8');
  const script=fs.readFileSync(path.join(root,'hr-driver-decision-audit.js'),'utf8');
  assert.match(workflow,/node hr-driver-decision-audit\.js/);
  assert.match(workflow,/secrets\.KINGS_HR_DECISIONS_CHANNEL_ID/);
  assert.match(workflow,/node --check hr-driver-decision-source\.js/);
  assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.doesNotMatch(script,/writeFileSync\(|appendFileSync\(/);
  assert.doesNotMatch(script,/console\.log\([^\n]*(?:discordId|ticketId|message\.content|approvedBy)/);
});


test('only authorized private callback receives HR identifiers; public audit output stays aggregate-only',async()=>{
  const mock=mockServer();
  let confidentialPages=null;
  const result=await auditHrDecisions({
    token:'fake-private',channelId:DECISIONS,transport:mock.transport,
    privateCaseSink:async pages=>{confidentialPages=pages;}
  });
  assert.equal(result.privateCaseViewPages,2);
  assert.equal(result.privateCaseReviewCount,0);
  assert.ok(confidentialPages);
  const detail=confidentialPages.map(p=>p.content).join('\\n');
  assert.ok(detail.includes(A));
  assert.ok(detail.includes(B));
  assert.ok(detail.includes('HR ticket ID: 1777777777777777771'));
  const safe=JSON.stringify(result);
  for(const privateToken of [A,B,MGR,'1777777777777777771','2021-02-02']){
    assert.ok(!safe.includes(privateToken),'Public aggregate must never include HR case details');
  }
  assert.ok(mock.calls.every(c=>c.method==='GET'));
});

test('without protected source configuration no private HR report is produced or sent',async()=>{
  let calls=0,sinkCalls=0;
  const r=await auditHrDecisions({
    token:'fake',channelId:'',transport:async()=>{calls++;throw Error('No fetch');},
    privateCaseSink:async()=>{sinkCalls++;}
  });
  assert.equal(r.status,'not-configured');
  assert.equal(calls,0);
  assert.equal(sinkCalls,0);
});

test('insecure decision source is rejected before confidential private pages reach a sink',async()=>{
  const mock=mockServer({hrChannel:{...channel(DECISIONS),permission_overwrites:[
    {id:GUILD,type:0,deny:'0',allow:'1024'}
  ]}});
  let sinkCalls=0;
  await assert.rejects(auditHrDecisions({
    token:'fake',channelId:DECISIONS,transport:mock.transport,
    privateCaseSink:async()=>{sinkCalls++;}
  }),/deny View Channel/);
  assert.equal(sinkCalls,0);
});
