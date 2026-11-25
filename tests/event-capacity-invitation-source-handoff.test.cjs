'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {inspectKingsEventInvitationSourceHandoff:inspect}
  =require('../event-capacity-invitation-source-handoff');
const {evaluate}=require('../event-capacity-core');
const {auditKingsDiscordHistoryPagination}
  =require('../event-capacity-discord-history-pagination-audit');
const G='1114967437788577792';
const F='990000000000000001',BOT='990000000000000002',
  STAFF='990000000000000003',ADMIN='990000000000000004',
  BOTROLE='990000000000000005',HUMAN='990000000000000006',
  T='990000000000000007',M1='990000000000000101',
  M2='990000000000000102',M3='990000000000000103',
  CENTER='990000000000000099',C_THREAD='990000000000000098';
const NOW='2026-11-25T21:00:00.000Z';
const DEPART='2026-11-28T18:00:00.000Z';
const digest=s=>createHash('sha256').update(s).digest('hex');
const ow=(id,type,allow='0',deny='0')=>({id,type,allow,deny});
function fixture(mode='text'){
  const config={guildId:G,channelId:F,
    staffRoleIds:[STAFF],authorizedAdminRoleIds:[ADMIN]};
  const privateChannel={id:F,guild_id:G,type:mode==='forum'?15:0,
    permission_overwrites:[
      ow(G,0,'0','1024'),ow(STAFF,0,'66560','0'),
      ow(BOTROLE,0,'66560','0')]};
  const roles=[{id:G,permissions:'0'},{id:STAFF,permissions:'0'},
    {id:ADMIN,permissions:'8'},{id:BOTROLE,permissions:'0'}];
  const msg=(id,stamp,text,thread=F)=>({
    id,channel_id:thread,author:{id:HUMAN,bot:false},
    content:text,timestamp:stamp
  });
  const invite='KINGS_INVITE_V1 '+JSON.stringify({
    kind:'invitation',invitationId:'invite-A',eventId:'event-A',
    departureAtUtc:DEPART,replyDueAtUtc:'2026-11-26T18:00:00.000Z'
  });
  const status=(state)=>'KINGS_INVITE_V1 '+JSON.stringify({
    kind:'status',invitationId:'invite-A',status:state
  });
  const data={
    '/users/@me':{id:BOT,bot:true},
    ['/guilds/'+G+'/roles']:roles,
    ['/channels/'+F]:privateChannel,
    ['/guilds/'+G+'/members/'+BOT]:{user:{id:BOT,bot:true},roles:[BOTROLE]},
    ['/guilds/'+G+'/members/'+HUMAN]:{user:{id:HUMAN,bot:false},roles:[STAFF]}
  };
  if(mode==='text'){
    data['/channels/'+F+'/messages?limit=100']=[
      msg(M2,'2026-11-22T12:00:00.000Z',status('Sent')),
      msg(M1,'2026-11-20T10:00:00.000Z',invite)
    ];
  }else{
    data['/guilds/'+G+'/threads/active']={threads:[
      {id:T,parent_id:F,name:'Kings https://truckersmp.com/events/12345'}
    ]};
    data['/channels/'+F+'/threads/archived/public?limit=100']={
      threads:[],has_more:false
    };
    data['/channels/'+T+'/messages?limit=100']=[
      msg(M3,'2026-11-22T14:00:00.000Z',
        'VTC: Example Co\nVTC Link: https://truckersmp.com/vtc/99\nInvited by: Staff',T)
    ];
  }
  const requests=[];
  const client={get:async path=>{
    requests.push(path);
    if(!Object.hasOwn(data,path))throw Error('unknown route');
    return {status:200,data:data[path]};
  }};
  const sourceIntake={
    guildId:G,currentChannelId:CENTER,
    firstMonth:'2024-12',finalMonth:'2026-11',
    nowMs:Date.parse(NOW),
    reviewSecret:'synthetic fake key for offline source cross-system review 2026',
    channelInventory:[{
      channelId:CENTER,kind:'current',
      firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11',
      claimedThreadCount:1,claimedArchivedCount:0,claimedDeletedCount:0,
      currentThreadsRead:true,archivedThreadsRead:true,
      deletedThreadsReviewed:true,editHistoryReviewed:true
    }],
    convoyRecords:[{
      channelId:CENTER,threadId:C_THREAD,
      sourceKind:'current',eventId:'event-A',status:'Scheduled',
      category:'Partner Convoy',departureAtUtc:DEPART,
      modifiedAtUtc:'2026-11-20T12:00:00.000Z',
      sourceDigest:digest('center'),revisionDigests:[digest('rev')]
    }],tracker:null
  };
  const capacity=evaluate([{
    eventId:'event-A',status:'Scheduled',statusVerified:true,
    eventType:'Partner Convoy',eventTypeVerified:true,
    departureAtUtc:'2026-11-28T18:00:00Z',departureVerified:true,
    meetingAtUtc:'2026-11-28T17:00:00Z',
    plannedEndAtUtc:'2026-11-28T20:00:00Z'
  }],{dataFresh:true});
  const bridgeInput={sourceIntake,capacity,year:'2026',selectedMonth:'2026-11',
    historicalHoldsReports:[],historicalEvidenceReport:null};
  return {client,config,asOfUtc:NOW,bridgeInput,requests,data};
}
function syntheticAudit(){
  return auditKingsDiscordHistoryPagination({
    guildId:G,firstMonth:'2024-12',finalMonth:'2026-11',
    nowMs:Date.parse(NOW),
    reviewSecret:'synthetic fake key for offline historical paging audit 2026',
    channels:[{
      channelId:CENTER,channelKind:'current-forum',
      firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11'
    }],scans:[]
  });
}
test('Structured source goes through existing Event source intake and Calendar exactly once',async()=>{
  const f=fixture();
  const r=await inspect(f);
  assert.equal(r.sourceMode,'STRUCTURED_TEXT_CLAIMS_REVIEW');
  assert.equal(r.claimedStructuredInvitations,1);
  assert.equal(r.sourceClaimedExactEventIdMatches,1);
  assert.equal(r.independentConvoyCenterCalendarProjected,true);
  assert.equal(r.projectedCalendarDays,30);
  assert.equal(r.eventBookingsCreated,0);
  assert.equal(r.capacityReservationsChanged,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.originalOrganizerRepliesIndependentlyAuthenticated,false);
});
test('Forum source enters existing Center as UNKNOWN invitation evidence only, never Accepted',async()=>{
  const f=fixture('forum');
  const r=await inspect(f);
  assert.equal(r.sourceMode,'EXISTING_FORUM_MANUAL_REVIEW');
  assert.equal(r.claimedForumEntries,1);
  assert.equal(r.sourceClaimedExactEventIdMatches,0);
  assert.equal(r.independentConvoyCenterCalendarProjected,true);
  assert.equal(r.directForumFreeTextConvertedIntoBookings,0);
  assert.equal(r.staffApprovalsCommitted,0);
});
test('No separate Center snapshot means ONLY observed source claims, not Calendar truth',async()=>{
  const f=fixture();delete f.bridgeInput;
  const r=await inspect(f);
  assert.equal(r.independentConvoyCenterCalendarProjected,false);
  assert.equal(r.sourceClaimedExactEventIdMatches,0);
  assert.equal(r.projectedCalendarDays,0);
  assert.equal(r.original24MonthSourceHistoryAuthenticated,false);
});
test('Original history pagination audit remains independently unverified even if supplied',async()=>{
  const f=fixture();f.historicalAudit=syntheticAudit();
  const r=await inspect(f);
  assert.equal(r.history.supplied,true);
  assert.equal(r.history.monthsRequired,24);
  assert.ok(r.history.claimedPaginationGaps>0);
  assert.equal(r.history.sourceHistoryVerified,false);
  assert.equal(r.original24MonthSourceHistoryAuthenticated,false);
});
test('Forged historical verified flags and incompatible history window fail closed',async()=>{
  const f=fixture();f.historicalAudit={...syntheticAudit(),
    original24MonthHistoryCompletelyAuthenticated:true};
  await assert.rejects(()=>inspect(f));
  const g=fixture();g.historicalAudit={...syntheticAudit(),
    finalMonth:'2026-10'};
  await assert.rejects(()=>inspect(g));
});
test('Wrong source guild and mismatched snapshot freshness fail closed',async()=>{
  const f=fixture();f.bridgeInput.sourceIntake.guildId='990000000000000111';
  await assert.rejects(()=>inspect(f));
  const g=fixture();g.bridgeInput.sourceIntake.nowMs-=1000;
  await assert.rejects(()=>inspect(g));
});
test('Future source claim is accounted for as manual review, NOT history or booking',async()=>{
  const f=fixture();
  f.data['/channels/'+F+'/messages?limit=100'][1].content=
    f.data['/channels/'+F+'/messages?limit=100'][1].content.replace(
      DEPART,'2026-12-28T18:00:00.000Z');
  const r=await inspect(f);
  assert.equal(r.futureInvitationClaimsPendingReview,1);
  assert.equal(r.sourceClaimedExactEventIdMatches,0);
  assert.equal(r.claimedStructuredInvitations,1);
  assert.equal(r.capacityReservationsChanged,0);
});
test('Unmatched Event ID remains a source claim, never creates new Center event',async()=>{
  const f=fixture();
  f.data['/channels/'+F+'/messages?limit=100'][1].content=
    f.data['/channels/'+F+'/messages?limit=100'][1].content.replace(
      '"eventId":"event-A"','"eventId":"unknown-X"');
  const r=await inspect(f);
  assert.equal(r.claimedStructuredInvitations,1);
  assert.equal(r.sourceClaimedExactEventIdMatches,0);
  assert.equal(r.eventBookingsCreated,0);
});
test('No original identifiers, replies, private channel, or source records leave report',async()=>{
  const f=fixture(),r=await inspect(f);
  const str=JSON.stringify(r);
  for(const secret of [F,G,HUMAN,CENTER,C_THREAD,'event-A',
    'invite-A',DEPART,'2026-11-20T10:00:00.000Z',
    'https://truckersmp.com/events/12345'])
    assert.equal(str.includes(secret),false,secret);
  assert.equal(Object.hasOwn(r,'privateClaimsDoNotLog'),false);
});
test('Discord refused source/permissions stop the composed Calendar review',async()=>{
  const f=fixture();f.data['/channels/'+F].permission_overwrites=[];
  await assert.rejects(()=>inspect(f));
});
