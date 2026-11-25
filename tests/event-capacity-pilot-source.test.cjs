'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {inspect,monthsFrom,verdict,contextAllowed,runShape,
  artifactFor,allowedRedirect,createReader,main}
  =require('../event-capacity-pilot-source');
const {makeSyntheticCapacityZip}=require('./helpers/event-capacity-pilot-zip.cjs');
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const G='1114967437788577792',F='1550619824005062697';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const RUN=45502949674,ART=15007117159,SHA='a'.repeat(40);
const TOKEN='SYNTHETIC_GITHUB_TOKEN_NOT_REAL_123456';
const MODE={GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:REPO,
  GITHUB_EVENT_NAME:'workflow_dispatch',KINGS_CAPACITY_PILOT_SOURCE:'true',
  GITHUB_TOKEN:TOKEN};
function info(patch={}){
  return {id:RUN,name:'Kings Convoy Checker (live)',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,
    run_started_at:'2027-03-20T11:44:00Z',
    updated_at:'2027-03-20T11:56:00Z',run_attempt:1,
    status:'completed',conclusion:'success',event:'schedule',...patch};
}
function data(){
  const thread={eventId:'fake_event_do_not_log',
    threadId:'777777777777777777',
    name:'synthetic sample, no real individual',
    status:'Scheduled',ignored:false,testThread:false,
    validation:{parsed:{eventType:'Partner Convoy',
      departureAtUtc:'2027-03-24T18:00:00Z'}}};
  const report={guildId:G,forumId:F,generatedAt:'2027-03-20T11:50:00Z',
    finalization:{finalizedAt:'2027-03-20T11:55:00Z'},
    summary:{totalThreads:1,actualConvoys:1},threads:[thread]};
  const legacy=Array.from({length:3},(_,i)=>({
    eventId:'legacy_fake_'+i,
    source:'legacy-calendar',threadId:'66666666666666666'+i,
    status:'Legacy Past',departureAtUtc:null
  }));
  const overview={guildId:G,forumId:F,generatedAt:'2027-03-20T11:56:00Z',
    overall:{realConvoySubmissions:1,convoyReadErrors:0,
      legacyImportedConvoys:3,legacyDuplicatesSuppressed:0},
    registeredConvoys:[{source:'convoy-center',threadId:thread.threadId,
      eventId:thread.eventId,status:thread.status,
      departureAtUtc:thread.validation.parsed.departureAtUtc},...legacy]};
  return {report,overview};
}
function zip(payload=data()){
  return makeSyntheticCapacityZip([
    {name:'convoy-check-results.json',data:JSON.stringify(payload.report)},
    {name:'convoy-overview.json',data:JSON.stringify(payload.overview)}
  ]);
}
function fakeReader(opts={}){
  const bytes=opts.zip||zip();
  const r=opts.run||info();
  const calls=[];
  const obj={
    latest:async()=>{calls.push('latest');return {
      workflow_runs:opts.empty?[]:[r],total_count:opts.empty?0:1
    };},
    run:async()=>{calls.push('run');return opts.runDirect||r;},
    artifacts:async()=>{calls.push('artifacts');return {total_count:1,
      artifacts:[{id:ART,name:'kings-convoy-reports',
        expired:false,size_in_bytes:bytes.length,
        workflow_run:{id:RUN,head_branch:'main',head_sha:SHA}}]};},
    zip:async()=>{calls.push('zip');return bytes;}
  };
  return {reader:obj,calls};
}
test('Public-safe source readiness checks actual ZIP format and privately projects 12 months',async()=>{
  const {reader,calls}=fakeReader(),r=await inspect({reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_CALENDAR_READONLY_READY');
  assert.equal(r.sourceCalendarReady,true);
  assert.deepEqual(calls,['latest','run','artifacts','zip']);
  assert.equal(r.discordAccessed,false);
  assert.equal(r.discordMessagesChanged,0);
  assert.equal(r.githubWrites,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.automaticActivationAuthorized,false);
  for(const privateData of [
    G,F,'777777777777777777','fake_event_do_not_log',
    'legacy_fake_',TOKEN,'2027-03-24'
  ])assert.equal(JSON.stringify(r).includes(privateData),false);
});
test('Internal synthetic calendar sees 3 undated historical claims but cannot publish them',()=>{
  const r=monthsFrom(data(),NOW);
  assert.equal(r.months.length,12);
  assert.equal(r.months[0].centerClaims,1);
  assert.equal(r.months[0].scheduled,1);
  assert.equal(r.legacyClaims,3);
  assert.equal(r.undatedLegacy,3);
  assert.equal(r.months[0].legacyDatedKeptSeparate,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('An old scheduled source is detected before any private ZIP download',async()=>{
  const run=info({run_started_at:'2027-03-20T09:00:00Z',
    updated_at:'2027-03-20T09:15:00Z'});
  const f=fakeReader({run}),r=await inspect({reader:f.reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_NOT_RECENT');
  assert.deepEqual(f.calls,['latest']);
  assert.equal(r.sourceCalendarReady,false);
});
test('Success of a manual dry-run is never accepted as scheduled source',async()=>{
  const run=info({event:'workflow_dispatch'});
  const f=fakeReader({run}),r=await inspect({reader:f.reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_UNVERIFIED');
  assert.deepEqual(f.calls,['latest']);
});
test('Tampered ZIP, wrong source inventory and mismatched artifact provenance fail closed',async()=>{
  const bad=Buffer.from(zip());bad[49]^=123;
  const invalid=await inspect({reader:fakeReader({zip:bad}).reader,nowMs:NOW});
  assert.equal(invalid.status,'SOURCE_UNVERIFIED');
  const d=data();d.overview.registeredConvoys[0].eventId='conflicting_fake';
  const different=await inspect({reader:fakeReader({zip:zip(d)}).reader,nowMs:NOW});
  assert.equal(different.status,'CALENDAR_UNVERIFIED');
  const mismatch=fakeReader();
  const a=mismatch.reader.artifacts;
  mismatch.reader.artifacts=async()=>{const v=await a();v.artifacts[0].workflow_run.head_sha='b'.repeat(40);return v;};
  assert.equal((await inspect({reader:mismatch.reader,nowMs:NOW})).status,
    'SOURCE_UNVERIFIED');
});
test('No missing source report can mean permission to create Event bookings',async()=>{
  const f=fakeReader({empty:true});
  const r=await inspect({reader:f.reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_UNVERIFIED');
  assert.equal(r.bookingsCreated,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.staffApprovalsVerified,false);
});
test('Only manual protected main invocation may use GitHub token, without Discord credentials',()=>{
  assert.equal(contextAllowed(MODE),true);
  for(const patch of [
    {GITHUB_EVENT_NAME:'schedule'},{GITHUB_REF:'refs/heads/feature'},
    {GITHUB_REPOSITORY:'untrusted/fork'},
    {KINGS_CAPACITY_PILOT_SOURCE:'false'},
    {GITHUB_TOKEN:'short'},
    {GITHUB_TOKEN:TOKEN+'\nATTACK'}
  ])assert.equal(contextAllowed({...MODE,...patch}),false);
});
test('Fixed URLs and redirects keep auth token off any signed blob URL',()=>{
  assert.equal(runShape(info()),true);
  assert.equal(runShape(info({name:'Kings Convoy Checker (dry-run)'})),false);
  assert.throws(()=>allowedRedirect('https://evil.invalid/zip'));
  assert.throws(()=>allowedRedirect('http://a.blob.core.windows.net/zip'));
  assert.throws(()=>allowedRedirect('https://a.blob.core.windows.net.evil/zip'));
  assert.equal(allowedRedirect('https://a.blob.core.windows.net/abc'),
    'https://a.blob.core.windows.net/abc');
  assert.equal(artifactFor({total_count:1,
    artifacts:[{id:ART,name:'kings-convoy-reports',expired:false,
      size_in_bytes:zip().length,workflow_run:{id:RUN,head_branch:'main',head_sha:SHA}}]},
    info()).id,ART);
});
test('Reader sends only fixed GETs and omits GitHub token for ZIP redirects',async()=>{
  const dataBytes=zip(),calls=[],base=BASE;
  const route={
    [base+'/actions/workflows/convoy-checker.yml/runs?branch=main&status=success&event=schedule&per_page=20']:{
      total_count:1,workflow_runs:[info()]
    },
    [base+'/actions/runs/'+RUN]:info(),
    [base+'/actions/runs/'+RUN+'/artifacts?per_page=100']:{
      total_count:1,artifacts:[{id:ART,name:'kings-convoy-reports',
        expired:false,size_in_bytes:dataBytes.length,
        workflow_run:{id:RUN,head_branch:'main',head_sha:SHA}}]}
  };
  const transport=async (url,options)=>{
    calls.push({url,options});
    if(route[url])return new Response(JSON.stringify(route[url]),{status:200});
    if(url===base+'/actions/artifacts/'+ART+'/zip')
      return new Response(null,{status:302,headers:{
        location:'https://archive.blob.core.windows.net/fake-zip'}});
    if(url==='https://archive.blob.core.windows.net/fake-zip')
      return new Response(dataBytes,{status:200});
    throw Error('Unapproved URL');
  };
  const r=await inspect({reader:createReader({token:TOKEN,transport}),nowMs:NOW});
  assert.equal(r.status,'SOURCE_CALENDAR_READONLY_READY');
  assert.equal(calls.length,5);
  assert.equal(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='manual'),true);
  assert.equal(calls.slice(0,4).every(c=>c.options.headers.Authorization==='Bearer '+TOKEN),true);
  assert.equal(calls[4].options.headers.Authorization,undefined);
  assert.equal(calls[4].url.startsWith('https://archive.blob.core.windows.net/'),true);
});
test('Main public CI logs never emit source claims, location, identities or tokens',async()=>{
  const chunks=[];const original=console.log;
  console.log=(x)=>chunks.push(String(x));
  try{
    const r=await main({env:MODE,transport:async()=>{throw Error('TOKEN '+TOKEN);}});
    assert.equal(r.status,'SOURCE_UNVERIFIED');
  }finally{console.log=original;}
  const output=chunks.join(' ');
  for(const value of [TOKEN,G,F,'777777777777777777','2027-03-24','legacy_fake'])
    assert.equal(output.includes(value),false);
});
test('Standalone pilot never imports Staff approval or Discord operations',()=>{
  const root=path.join(__dirname,'..');
  const src=fs.readFileSync(path.join(root,'event-capacity-pilot-source.js'),'utf8');
  assert.doesNotMatch(src,/DISCORD_BOT_TOKEN|discord\.com|Webhook|\.post\(|\.patch\(|\.put\(|\.delete\(/i);
  assert.match(src,/automaticActivationAuthorized:false/);
  assert.equal(fs.readFileSync(path.join(root,'convoy-checker.js'),'utf8')
    .includes('event-capacity-pilot-source'),false);
});

test('Real-source-shaped synthetic 39 Center / 114 Legacy inventory is internally valid',async()=>{
  const f=data(),rows=[],registered=[];
  for(let i=0;i<39;i++){
    const threadId='7777777777777'+String(i).padStart(5,'0');
    const eventId='synthetic-'+i;
    const departureAtUtc='2027-03-'+(i%2===0?'24':'25')+'T18:00:00Z';
    const eventType=i===0?'Celebration Convoy':
      i%3===0?'Kings Convoy':i%2===0?'Partner Convoy':'External Convoy';
    rows.push({threadId,eventId,status:'Scheduled',
      name:'offline fake, not a Kings member',ignored:false,testThread:false,
      validation:{parsed:{eventType,departureAtUtc}}});
    registered.push({source:'convoy-center',threadId,eventId,
      status:'Scheduled',departureAtUtc});
  }
  f.report.threads=[...rows,{
    threadId:'999999999999999999',ignored:true,status:'Ignored'
  }];
  f.report.summary={totalThreads:40,actualConvoys:39};
  const legacy=Array.from({length:114},(_,i)=>({
    source:'legacy-calendar',eventId:'synthetic-legacy-'+i,
    threadId:'666666666666'+String(i).padStart(6,'0'),
    status:'Legacy Past',departureAtUtc:null
  }));
  f.overview.registeredConvoys=[...registered,...legacy];
  f.overview.overall={realConvoySubmissions:39,convoyReadErrors:0,
    legacyImportedConvoys:115,legacyDuplicatesSuppressed:1};
  const result=monthsFrom(f,NOW);
  assert.equal(result.legacyClaims,114);
  assert.equal(result.undatedLegacy,114);
  assert.equal(result.months[0].centerClaims,39);
  assert.equal(result.months[0].unclassified,1);
  assert.equal(result.freeSlotsCertified,false);
  const status=await inspect({reader:fakeReader({zip:zip(f)}).reader,nowMs:NOW});
  assert.equal(status.status,'SOURCE_CALENDAR_READONLY_READY');
  assert.equal(status.staffApprovalsVerified,false);
  assert.equal(status.freeSlotsCertified,false);
  const logged=JSON.stringify(status);
  for(const privateValue of ['synthetic-legacy','offline fake','synthetic-0',
    '2027-03-24','666666666666'])
    assert.equal(logged.includes(privateValue),false);
});

test('The genuine five-member GitHub Actions artifact shape reaches Calendar readiness',async()=>{
  const d=data();
  const actionsZip=makeSyntheticCapacityZip([
    {name:'convoy-check-results.json',data:JSON.stringify(d.report),descriptor:true},
    {name:'convoy-overview.json',data:JSON.stringify(d.overview),descriptor:true},
    {name:'convoy-planning-limits.json',data:'{"synthetic":true}',descriptor:true},
    {name:'convoy-completeness.json',data:'{"synthetic":true}',descriptor:true},
    {name:'convoy-overview.md',data:'Synthetic overview, never published',descriptor:true}
  ]);
  const f=fakeReader({zip:actionsZip});
  const r=await inspect({reader:f.reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_CALENDAR_READONLY_READY');
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.discordAccessed,false);
  assert.deepEqual(f.calls,['latest','run','artifacts','zip']);
  assert.equal(JSON.stringify(r).includes('Synthetic overview'),false);
});

test('Private twelve-month projection separates Kings, Partner and External active claims',()=>{
  const f=data(),m=monthsFrom(f,NOW).months[0];
  assert.equal(m.centerClaims,1);
  assert.equal(m.partnerClaims,1);
  assert.equal(m.externalClaims,0);
  assert.equal(m.kingsClaims,0);
  assert.equal(m.daysRequiringReview,0);
  assert.equal(m.legacyDatedKeptSeparate,0);
  assert.equal(monthsFrom(f,NOW).freeSlotsCertified,false);
});
function withCurrentEvents(specs){
  const f=data();
  f.report.threads=specs.map((s,i)=>{
    const threadId='777777777777'+String(i).padStart(6,'0');
    return {eventId:'synthetic-day-'+i,threadId,
      name:'offline-source-only',status:s.status||'Scheduled',
      ignored:false,testThread:false,
      validation:{parsed:{eventType:s.type,departureAtUtc:s.departure}}};
  });
  f.report.summary={totalThreads:specs.length,actualConvoys:specs.length};
  f.overview.registeredConvoys=[
    ...f.report.threads.map(t=>({source:'convoy-center',eventId:t.eventId,
      threadId:t.threadId,status:t.status,
      departureAtUtc:t.validation.parsed.departureAtUtc})),
    ...f.overview.registeredConvoys.filter(x=>x.source==='legacy-calendar')
  ];
  f.overview.overall.realConvoySubmissions=specs.length;
  return f;
}
test('Tuesday four mixed Partner+External claims trigger weekday 3/day conflict review',()=>{
  const date='2027-03-23';
  const f=withCurrentEvents([
    {type:'Partner Convoy',departure:date+'T09:00:00Z'},
    {type:'Partner Convoy',departure:date+'T12:00:00Z'},
    {type:'External Convoy',departure:date+'T15:00:00Z'},
    {type:'External Convoy',departure:date+'T18:00:00Z'}
  ]);
  const m=monthsFrom(f,NOW).months[0];
  assert.equal(m.centerClaims,4);
  assert.equal(m.partnerClaims,2);
  assert.equal(m.externalClaims,2);
  assert.equal(m.kingsClaims,0);
  assert.equal(m.daysRequiringReview,1);
});
test('Friday four combined + a Kings convoy are not over the shared 5/day or each 2/day cap',()=>{
  const date='2027-03-26';
  const f=withCurrentEvents([
    {type:'Kings Convoy',departure:date+'T06:00:00Z'},
    {type:'Partner Convoy',departure:date+'T09:00:00Z'},
    {type:'Partner Convoy',departure:date+'T12:00:00Z'},
    {type:'External Convoy',departure:date+'T15:00:00Z'},
    {type:'External Convoy',departure:date+'T18:00:00Z'}
  ]);
  const m=monthsFrom(f,NOW).months[0];
  assert.equal(m.centerClaims,5);
  assert.equal(m.kingsClaims,1);
  assert.equal(m.partnerClaims,2);
  assert.equal(m.externalClaims,2);
  assert.equal(m.daysRequiringReview,0);
  assert.equal(monthsFrom(f,NOW).freeSlotsCertified,false);
});
test('Pending/cancelled/unclassified and departures within two hours demand human review',()=>{
  const date='2027-03-27';
  const f=withCurrentEvents([
    {type:'Partner Convoy',departure:date+'T16:00:00Z'},
    {type:'External Convoy',departure:date+'T17:00:00Z'},
    {type:'Other',departure:date+'T20:00:00Z'},
    {type:'Kings Convoy',status:'Cancelled',departure:date+'T23:00:00Z'}
  ]);
  const m=monthsFrom(f,NOW).months[0];
  assert.equal(m.centerClaims,4);
  assert.equal(m.kingsClaims,0);
  assert.equal(m.partnerClaims,1);
  assert.equal(m.externalClaims,1);
  assert.equal(m.cancelled,1);
  assert.equal(m.unclassified,1);
  assert.equal(m.daysRequiringReview,1);
});
