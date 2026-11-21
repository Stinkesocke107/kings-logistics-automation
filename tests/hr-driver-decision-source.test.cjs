'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseDriverIdentityRecord}=require('../driver-identity-register');
const {
  HEADER,hrApproverRole,authorizedHrApprover,assertPrivateHrDecisionChannel,
  parseHrDecisionRecord,verifyHrDecisionMessages,auditCurrentHrDecisions
}=require('../hr-driver-decision-source');

const GUILD='1114967437788577792';
const OWNER='999000000000000001',MGR='999000000000000002',BOT='999000000000000003';
const A='123456789012345678',B='123456789012345679';
const MGT_ROLE='170000000000000002',DRIVER_ROLE='1204836048845410405';
const NOW=new Date('2026-11-21T19:00:00Z');
const roles=[
  {id:MGT_ROLE,name:'HR Management',permissions:'0'},
  {id:DRIVER_ROLE,name:'Kings Driver',permissions:'0'},
  {id:'170000000000000004',name:'External Partner',permissions:'0'},
  {id:'170000000000000005',name:'Kings Systems',permissions:'0',tags:{bot_id:BOT}}
];
const members=[
  {user:{id:MGR,bot:false},roles:[MGT_ROLE]},
  {user:{id:OWNER,bot:false},roles:[]},
  {user:{id:BOT,bot:true},roles:['170000000000000005']},
  {user:{id:A,bot:false},roles:[DRIVER_ROLE]},
  {user:{id:B,bot:false},roles:[DRIVER_ROLE]}
];
const channel={
  guild_id:GUILD,type:0,
  permission_overwrites:[
    {id:GUILD,type:0,deny:'1024',allow:'0'},
    {id:MGT_ROLE,type:0,deny:'0',allow:'1024'},
    {id:'170000000000000005',type:0,deny:'0',allow:'1024'}
  ]
};
const text=(discordId,decision='approved',admission='first',ticket='1777777777777777770')=>
  HEADER+'\ndiscord_id: '+discordId+'\ndecision: '+decision+
  '\nadmission: '+admission+'\nticket_id: '+ticket;
const message=(id,content,author=MGR,timestamp='2026-11-21T17:00:00Z')=>({
  id,content,author:{id:author,bot:false},timestamp,edited_timestamp:null,webhook_id:null
});
function identityRegister(){
  const i1=parseDriverIdentityRecord('discord_id: '+A+'\nkings_join_date: 2.2.2021',NOW);
  const i2=parseDriverIdentityRecord('discord_id: '+B+'\nkings_join_date: 14.11.2026',NOW);
  return {enabled:true,identities:new Map([[A,i1],[B,i2]]),
    records:new Map([[A,i1.joinedAt],[B,i2.joinedAt]])};
}

test('private HR decision records require exact version, fields, IDs and enum decisions',()=>{
  assert.equal(parseHrDecisionRecord('This HR channel contains a probation review'),null);
  const a=parseHrDecisionRecord(text(A,'approved','return'));
  assert.deepEqual(a,{discordId:A,decision:'approved',admission:'return',
    ticketId:'1777777777777777770'});
  assert.ok(Object.isFrozen(a));
  for(const invalid of [
    text(A,'accepted','return'),text(A,'approved','other'),
    text('wrong','approved','first'),text(A,'approved','first','not-a-ticket'),
    text(A,'approved','first')+'\nextra: private',
    HEADER+'\ndiscord_id: '+A+'\ndiscord_id: '+A+
      '\ndecision: approved\nadmission: first',
    HEADER+'\ndecision: approved'
  ])assert.throws(()=>parseHrDecisionRecord(invalid),/Invalid/);
});

test('only human HR Management/Head Management/CEO/owner can sign approval evidence',()=>{
  assert.equal(hrApproverRole({name:'HR Management'}),true);
  assert.equal(hrApproverRole({name:'Kings Head Management'}),true);
  assert.equal(hrApproverRole({name:'Kings CEO'}),true);
  assert.equal(hrApproverRole({name:'Events Management'}),false);
  assert.equal(hrApproverRole({name:'Kings Driver'}),false);
  assert.equal(authorizedHrApprover(MGR,members,roles,OWNER),true);
  assert.equal(authorizedHrApprover(A,members,roles,OWNER),false);
  assert.equal(authorizedHrApprover(BOT,members,roles,OWNER),false);
  assert.equal(authorizedHrApprover(OWNER,members,roles,OWNER),true);
});

test('private HR decision channel rejects everyone access, unrelated roles, members and administrator bypass',()=>{
  assert.equal(assertPrivateHrDecisionChannel(channel,GUILD,roles,members,OWNER,BOT),true);
  assert.throws(()=>assertPrivateHrDecisionChannel({
    ...channel,permission_overwrites:[{id:GUILD,type:0,deny:'0',allow:'1024'}]
  },GUILD,roles,members,OWNER,BOT),/deny View Channel/);
  assert.throws(()=>assertPrivateHrDecisionChannel({
    ...channel,permission_overwrites:[...channel.permission_overwrites,
      {id:'170000000000000004',type:0,allow:'1024',deny:'0'}]
  },GUILD,roles,members,OWNER,BOT),/unauthorized view-role/);
  assert.throws(()=>assertPrivateHrDecisionChannel({
    ...channel,permission_overwrites:[...channel.permission_overwrites,
      {id:A,type:1,allow:'1024',deny:'0'}]
  },GUILD,roles,members,OWNER,BOT),/unauthorized member/);
  assert.throws(()=>assertPrivateHrDecisionChannel(channel,GUILD,
    [...roles,{id:'170000000000000099',name:'External admin',permissions:'8'}],
    members,OWNER,BOT),/unrelated Discord administrators/);
});

test('later human return approval supersedes earlier first admission without erasing either private audit event',()=>{
  const first=message('1777777777777777771',text(A,'approved','first'),
    MGR,'2026-11-16T17:00:00Z');
  const returned=message('1777777777777777773',text(A,'approved','return'),
    MGR,'2026-11-21T17:00:00Z');
  const declined=message('1777777777777777772',text(B,'declined','first'),
    MGR,'2026-11-20T17:00:00Z');
  const evidence=verifyHrDecisionMessages([returned,declined,first],members,roles,OWNER,NOW);
  assert.equal(evidence.events.length,3);
  assert.equal(evidence.latest.get(A).admission,'return');
  const audited=auditCurrentHrDecisions([A,B],identityRegister(),evidence,NOW);
  assert.equal(audited.status,'requires-human-review');
  assert.equal(audited.approvedReturn,1);
  assert.equal(audited.approvedFirst,0);
  assert.equal(audited.conflictingDecisions,1);
  assert.equal(audited.noFormalDecisionEvidence,0);
  assert.equal(audited.originalIdentityRegistered,2);
  const aggregates=JSON.stringify(audited);
  for(const privateValue of [A,B,MGR,'1777777777777777771','2026-11-21T17']) {
    assert.equal(aggregates.includes(privateValue),false);
  }
});

test('existing registered Drivers without new HR records remain unverified, never implicitly approved or rejected',()=>{
  const evidence=verifyHrDecisionMessages([],members,roles,OWNER,NOW);
  const aggregate=auditCurrentHrDecisions([A,B],identityRegister(),evidence,NOW);
  assert.equal(aggregate.status,'partial-evidence');
  assert.equal(aggregate.noFormalDecisionEvidence,2);
  assert.equal(aggregate.approvedFirst,0);
  assert.equal(aggregate.approvedReturn,0);
  assert.equal(aggregate.conflictingDecisions,0);
});

test('invalid, edited, bot-written, unauthorized or untrusted HR entries fail closed',()=>{
  const msg=message('1777777777777777771',text(A));
  assert.throws(()=>verifyHrDecisionMessages([{...msg,edited_timestamp:NOW.toISOString()}],
    members,roles,OWNER,NOW),/trusted unedited/);
  assert.throws(()=>verifyHrDecisionMessages([{...msg,author:{id:BOT,bot:true}}],
    members,roles,OWNER,NOW),/trusted unedited/);
  assert.throws(()=>verifyHrDecisionMessages([{...msg,author:{id:A,bot:false}}],
    members,roles,OWNER,NOW),/trusted unedited/);
  assert.throws(()=>verifyHrDecisionMessages([msg,msg],members,roles,OWNER,NOW),
    /trusted unedited/);
  assert.throws(()=>verifyHrDecisionMessages([{...msg,content:text(A,'unexpected','first')}],
    members,roles,OWNER,NOW),/Invalid/);
  assert.throws(()=>verifyHrDecisionMessages([{...msg,timestamp:'2028-01-01T00:00:00Z'}],
    members,roles,OWNER,NOW),/trusted unedited/);
  assert.throws(()=>auditCurrentHrDecisions([A,B],{enabled:false,records:new Map(),
    identities:new Map()},verifyHrDecisionMessages([msg],members,roles,OWNER,NOW),NOW),
    /verified private identity/);
});

test('HR evidence model cannot perform role changes or write to public files',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','hr-driver-decision-source.js'),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(|writeFileSync\s*\(|appendFileSync\s*\(|method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.doesNotMatch(source,/console\.(?:log|warn|error)\(/);
  assert.match(source,/management-approved-private-discord|activeDriverSourceCoverage/);
});
