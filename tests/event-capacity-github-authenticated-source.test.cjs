'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAuthenticatedKingsSource}
  =require('../event-capacity-github-authenticated-source');
const {createAuthenticatedKingsReviewGateway}
  =require('../event-capacity-github-reviewed-gateway');
const {buildHumanReviewChallenge}
  =require('../event-capacity-human-review');
const {createEmptyLedger}
  =require('../event-capacity-decision-ledger');
const {createGithubOnlyKnownUsageReader}
  =require('../event-capacity-github-known-usage');
const {createGithubOnlyHistoricalReviewReader}
  =require('../event-capacity-github-historical-review');
const {createGithubOnlyMonthlyCoverageReader}
  =require('../event-capacity-github-monthly-coverage');
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const RUN='45502949674',ART='70000000001',SHA='1'.repeat(40);
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const CDN='https://productionresultssa12.blob.core.windows.net/kings-test.zip?sig=synthetic';
const TOKEN='synthetic-github-read-only-capacity-source-token-12345';
const CONFIG={
  guildId:SCOPE.guildId,channelId:'222222222222222222',
  roles:{'Event Coordination':'333333333333333333',
    'Event Leadership':'444444444444444444',
    CEO:'666666666666666666'}
};
const SUBMITTER='111111111111111111',REVIEWER='777777777777777777';
const ORIGINAL='888888888888888888',CONFIRM='999999999999999999';
const REVIEW_SECRET='synthetic-reviewed-gateway-HMAC-secret-000000000001';
function reports(){
  const departureAtUtc='2027-03-21T16:00:00Z';
  return {
    report:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{
        eventId:'20270',threadId:'777777777777777779',
        status:'Scheduled',name:'Synthetic Partner Source',
        validation:{parsed:{eventType:'Partner Convoy',departureAtUtc}}
      }]
    },
    overview:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{
        source:'convoy-center',eventId:'20270',
        threadId:'777777777777777779',
        status:'Scheduled',departureAtUtc
      }]
    }
  };
}
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){
    c^=b;
    for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;
  }
  return(c^0xffffffff)>>>0;
}
function zip(data=reports(),extra=false){
  const pairs=[
    ['convoy-check-results.json',data.report],
    ['convoy-overview.json',data.overview]
  ];
  if(extra)pairs.push(['convoy-completeness.json',{note:'safe variation'}]);
  const locals=[],central=[];
  let offset=0;
  for(const [name,obj] of pairs){
    const label=Buffer.from(name),body=Buffer.from(JSON.stringify(obj));
    const crc=crc32(body),l=Buffer.alloc(30),c=Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);
    l.writeUInt16LE(0x800,6);l.writeUInt32LE(crc,14);
    l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);
    l.writeUInt16LE(label.length,26);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);
    c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);
    c.writeUInt32LE(crc,16);c.writeUInt32LE(body.length,20);
    c.writeUInt32LE(body.length,24);c.writeUInt16LE(label.length,28);
    c.writeUInt32LE((0o100600*0x10000)>>>0,38);
    c.writeUInt32LE(offset,42);
    locals.push(l,label,body);central.push(c,label);
    offset+=l.length+label.length+body.length;
  }
  const dir=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(pairs.length,8);
  end.writeUInt16LE(pairs.length,10);end.writeUInt32LE(dir.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}
function validRun(id=RUN,extra={}){
  return {id:Number(id),name:'Kings Convoy Checker',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,status:'completed',conclusion:'success',
    event:'schedule',run_attempt:1,
    run_started_at:'2027-03-20T11:53:00Z',
    updated_at:'2027-03-20T11:59:00Z',...extra};
}
function harness({
  data=reports(),tamperZip=false,sourceChangesAt=null,extraZip=false,
  latestChanges=false,runExtra={},artifactExtra={},
  downloadFailure=false
}={}){
  const requests=[];
  const archive=zip(data,extraZip);
  let discoveries=0,downloads=0,runs=0;
  const transport=async(url,options)=>{
    requests.push({url,authorization:options.headers?.Authorization,
      redirect:options.redirect,method:options.method});
    if(options.redirect!=='manual'||options.method!=='GET')throw Error('unsafe test request');
    if(url===BASE+'/actions/workflows/convoy-checker.yml/runs?branch=main&status=success&event=schedule&per_page=20'){
      discoveries++;
      const id=latestChanges&&discoveries>1?String(BigInt(RUN)+1n):RUN;
      return new Response(JSON.stringify({
        total_count:1,workflow_runs:[validRun(id,runExtra)]
      }),{status:200});
    }
    if(url===BASE+'/actions/runs/'+RUN){
      runs++;
      return new Response(JSON.stringify(validRun(RUN,runExtra)),{status:200});
    }
    if(url===BASE+'/actions/runs/'+RUN+'/artifacts?per_page=100'){
      const artifact={id:Number(ART),name:'kings-convoy-reports',
        expired:false,size_in_bytes:archive.length,
        workflow_run:{id:Number(RUN),head_branch:'main',head_sha:SHA},
        ...artifactExtra};
      return new Response(JSON.stringify({
        total_count:1,artifacts:[artifact]
      }),{status:200});
    }
    if(url===BASE+'/actions/artifacts/'+ART+'/zip'){
      downloads++;
      return new Response(null,{status:302,headers:{location:CDN}});
    }
    if(url===CDN){
      if(downloadFailure)throw Error('PRIVATE ZIP AND TOKEN NEVER LOG');
      const altered=Buffer.from(archive);
      if(tamperZip)altered[64]^=0xff;
      if(sourceChangesAt!==null&&downloads>=sourceChangesAt)
        return new Response(zip(data,true),{status:200});
      return new Response(altered,{status:200});
    }
    throw Error('Unexpected source endpoint');
  };
  const create=()=>createAuthenticatedKingsSource({
    githubToken:TOKEN,transport,nowMs:()=>NOW
  });
  return {create,transport,requests,counts:()=>({discoveries,downloads,runs})};
}
const proposal={messageId:ORIGINAL,actorId:SUBMITTER,
  ref:'event:20270',field:'category',value:'Partner Convoy',
  sourceMatched:true,reviewStatus:'Needs Human Review',
  classificationApproved:false,capacityConfirmed:false};
function reviewedGateway(h){
  const challenge=buildHumanReviewChallenge({
    proposal,scope:SCOPE,sourceRunId:RUN,ledgerRevision:0,
    nowMs:NOW-15*60000,secret:REVIEW_SECRET
  });
  const evidence={id:ORIGINAL,channel_id:CONFIG.channelId,
    author:{id:SUBMITTER,bot:false},
    content:'!capacity evidence event:20270 category partner',
    timestamp:'2027-03-20T11:30:00.000Z',edited_timestamp:null};
  const review={id:CONFIRM,channel_id:CONFIG.channelId,
    author:{id:REVIEWER,bot:false},
    content:challenge.reviewCommand,
    timestamp:'2027-03-20T11:50:00.000Z',edited_timestamp:null};
  const client={
    me:async()=>({id:'555555555555555555'}),
    channel:async()=>({id:CONFIG.channelId,
      guild_id:SCOPE.guildId,type:0,
      permission_overwrites:[
        {id:SCOPE.guildId,type:0,allow:'0',deny:'1024'},
        ...Object.values(CONFIG.roles).map(id=>({
          id,type:0,allow:'1024',deny:'0'
        }))
      ]
    }),
    roles:async()=>[SCOPE.guildId,...Object.values(CONFIG.roles)]
      .map(id=>({id,permissions:'66560'})),
    member:async(_,id)=>({
      user:{id},
      roles:id===SUBMITTER?[CONFIG.roles['Event Coordination']]:
        id===REVIEWER?[CONFIG.roles['Event Leadership']]:[]
    }),
    message:async(_,id)=>id===ORIGINAL?evidence:
      id===CONFIRM?review:null
  };
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let writes=0;
  const protectedVault={
    read:async()=>({
      ledger:structuredClone(ledger),
      checkpoint:{revision:0,digest:'a'.repeat(64)}
    }),
    commitDecision:async()=>{writes++;throw Error('never invoked');}
  };
  const gateway=createAuthenticatedKingsReviewGateway({
    githubToken:TOKEN,githubTransport:async (...args)=>{
      // Use the fixed-repository GitHub mock, not synthetic user flags.
      return h.transport(...args);
    },protectedVault,client,config:CONFIG,scope:SCOPE,
    reviewSecret:REVIEW_SECRET,nowMs:()=>NOW
  });
  return {gateway,challenge,writes:()=>writes};
}
test('Real GitHub REST routing verifies scheduled source, fixed artifact and scope',async()=>{
  const h=harness(),result=await h.create()();
  assert.equal(result.sourceKind,'authenticated-kings-convoy-checker');
  assert.equal(result.runId,RUN);
  assert.equal(result.attempt,1);
  assert.equal(result.headSha,SHA);
  assert.equal(result.artifactId,ART);
  assert.match(result.archiveDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.report.guildId,SCOPE.guildId);
  assert.equal(result.overview.forumId,SCOPE.forumId);
  assert.deepEqual(h.counts(),{discoveries:2,downloads:1,runs:2});
  assert.equal(h.requests.find(x=>x.url===CDN).authorization,undefined);
  assert.equal(h.requests.find(x=>x.url.startsWith(BASE)).authorization,
    'Bearer '+TOKEN);
  assert.equal(h.requests.every(x=>x.redirect==='manual'),true);
});
test('Untrusted manually dispatched even live runs are not a scheduled authority',async()=>{
  const h=harness({runExtra:{event:'workflow_dispatch',inputs:{mode:'live'}}});
  await assert.rejects(h.create()());
  assert.equal(h.counts().downloads,0);
});
test('Newer scheduled run discovered during the archive download invalidates the source',async()=>{
  const h=harness({latestChanges:true});
  await assert.rejects(h.create()());
  assert.equal(h.counts().downloads,1);
  assert.equal(h.counts().discoveries,2);
});
test('Corrupt ZIP and source content cannot be used to prepare final approvals',async()=>{
  const h=harness({tamperZip:true});
  await assert.rejects(h.create()());
  const broken=reports();
  broken.report.guildId='222222222222222222';
  await assert.rejects(harness({data:broken}).create()());
  const stale=reports();stale.overview.generatedAt='2027-03-20T10:57:00Z';
  await assert.rejects(harness({data:stale}).create()());
  const conflict=reports();
  conflict.report.threads[0].status='Cancelled';
  await assert.rejects(harness({data:conflict}).create()());
});
test('Wrong repository/branch/commit and incomplete artifact identity fail closed',async()=>{
  for(const opts of [
    {runExtra:{head_branch:'feature/untrusted'}},
    {runExtra:{head_repository:{full_name:'attacker/other'}}},
    {runExtra:{conclusion:'failure'}},
    {artifactExtra:{workflow_run:{id:Number(RUN),
      head_branch:'main',head_sha:'f'.repeat(40)}}},
    {artifactExtra:{size_in_bytes:1}},
    {artifactExtra:{expired:true}}
  ])await assert.rejects(harness(opts).create()());
});
test('Source archive download outages do not leak private payloads or tokens',async()=>{
  const h=harness({downloadFailure:true});
  await assert.rejects(h.create()(),
    e=>!String(e).includes(TOKEN)&&!String(e).includes('PRIVATE ZIP'));
});
test('Same JSON but different ZIP package produces different authenticated ZIP digests',async()=>{
  const a=await harness().create()();
  const b=await harness({extraZip:true}).create()();
  assert.deepEqual(a.report,b.report);
  assert.deepEqual(a.overview,b.overview);
  assert.notEqual(a.archiveDigest,b.archiveDigest);
});
test('Authenticated source gateway stages an uncommitted two-person decision',async()=>{
  const h=harness();
  const gw=reviewedGateway(h);
  const staged=await gw.gateway.prepare({
    proposal,challenge:gw.challenge,reviewMessageId:CONFIRM
  });
  assert.equal(staged.state,'ReadyForOwnerControlledCommit');
  assert.equal(staged.decisionCommitted,false);
  assert.equal(staged.availabilityCertified,false);
  assert.equal(staged.command.reviewProof.sourceRunId,RUN);
  assert.match(staged.command.reviewProof.sourceDigest,/^[a-f0-9]{64}$/);
  assert.equal(gw.writes(),0);
  assert.equal(typeof gw.gateway.commitWithOfflineOwnerPermit,'function');
  await assert.rejects(gw.gateway.commitWithOfflineOwnerPermit({
    permit:null,proposal,challenge:gw.challenge,reviewMessageId:CONFIRM
  }));
  assert.equal(gw.writes(),0);
});
test('Gateway staging rejects changed authenticated ZIP between read passes',async()=>{
  const h=harness({sourceChangesAt:2});
  const gw=reviewedGateway(h);
  await assert.rejects(gw.gateway.prepare({
    proposal,challenge:gw.challenge,reviewMessageId:CONFIRM
  }));
  assert.equal(gw.writes(),0);
});
test('Source factory requires a GitHub token; a forged sourceKind flag cannot replace it',()=>{
  assert.throws(()=>createAuthenticatedKingsSource({githubToken:''}));
  assert.throws(()=>createAuthenticatedKingsReviewGateway({
    githubToken:'',protectedVault:{
      read:async()=>null,commitDecision:async()=>null
    },client:{},reviewSecret:REVIEW_SECRET
  }));
});

test('GitHub-only usage reader obtains two full authenticated sources and owner-pinned ledger, never certifies free capacity',async()=>{
  const h=harness(),ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let vaultReads=0;
  const reader=createGithubOnlyKnownUsageReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>{
      vaultReads++;
      return {ledger:structuredClone(ledger),
        checkpoint:{revision:0,digest:'a'.repeat(64)}};
    }},
    scope:SCOPE,nowMs:()=>NOW
  });
  const result=await reader({selectedMonth:'2027-03'});
  assert.equal(result.month,'2027-03');
  assert.equal(result.sourceInventoryComplete,true);
  assert.equal(result.sourceAuthenticatedByGateway,true);
  assert.equal(result.ownerPinCheckedByGateway,true);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.monthUsage.partnerRemainingVerified,null);
  assert.equal(result.days.find(x=>x.day==='2027-03-20').remainingVerified,null);
  assert.equal(result.counts.unresolvedCapacityIssues>0,true);
  assert.equal(vaultReads,2);
  assert.deepEqual(h.counts(),{discoveries:4,downloads:2,runs:4});
});
test('Owner ledger revision change between two authenticated GitHub reads blocks usage projection',async()=>{
  const h=harness(),ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let reads=0;
  const reader=createGithubOnlyKnownUsageReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>{
      reads++;
      return {ledger:structuredClone(ledger),
        checkpoint:{revision:reads===1?0:1,digest:'a'.repeat(64)}};
    }},
    scope:SCOPE,nowMs:()=>NOW
  });
  await assert.rejects(reader({selectedMonth:'2027-03'}));
  assert.equal(reads,2);
});
test('Changed ZIP artifact and missing owner pin cannot give verified usage',async()=>{
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const changed=harness({sourceChangesAt:2});
  const read=createGithubOnlyKnownUsageReader({
    githubToken:TOKEN,githubTransport:changed.transport,
    ownerPinnedVault:{read:async()=>({
      ledger:structuredClone(ledger),
      checkpoint:{revision:0,digest:'a'.repeat(64)}
    })},
    scope:SCOPE,nowMs:()=>NOW
  });
  await assert.rejects(read());
  const missing=createGithubOnlyKnownUsageReader({
    githubToken:TOKEN,githubTransport:harness().transport,
    ownerPinnedVault:{read:async()=>{throw Error('missing owner receipt');}},
    scope:SCOPE,nowMs:()=>NOW
  });
  await assert.rejects(missing());
});
test('External source flag or arbitrary repo cannot replace restricted GitHub usage reader',()=>{
  assert.throws(()=>createGithubOnlyKnownUsageReader({
    githubToken:'',ownerPinnedVault:{read:async()=>null},
    scope:SCOPE,nowMs:()=>NOW
  }));
  assert.throws(()=>createGithubOnlyKnownUsageReader({
    githubToken:TOKEN,ownerPinnedVault:{read:async()=>null},
    scope:{...SCOPE,forumId:'999999999999999999'},nowMs:()=>NOW
  }));
});

test('Historical reader uses two authenticated GitHub artifacts and two protected ledger reads',async()=>{
  const h=harness(),ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const secret='synthetic-private-history-review-key-for-dedupe-01234';
  let reads=0;
  const reader=createGithubOnlyHistoricalReviewReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>{
      reads++;
      return {ledger:structuredClone(ledger),
        checkpoint:{revision:0,digest:'a'.repeat(64)}};
    }},
    scope:SCOPE,taskSecret:secret,nowMs:()=>NOW
  });
  const p=await reader();
  assert.equal(p.visibility,'PRIVATE_ONLY');
  assert.equal(p.readOnly,true);
  assert.equal(p.sourceAuthenticatedByGateway,true);
  assert.equal(p.ownerPinCheckedByGateway,true);
  assert.equal(p.historicCoverageCertified,false);
  assert.equal(p.freeSlotsCertified,false);
  assert.equal(p.counts.centerReviewed,1);
  assert.ok(p.items.some(x=>x.reason==='classification-evidence-required'));
  assert.equal(p.staffTaskCreated,false);
  assert.equal(reads,2);
  assert.deepEqual(h.counts(),{discoveries:4,downloads:2,runs:4});
});
test('Historical reader detects changed source between audit phases and does not emit approved tasks',async()=>{
  const h=harness({sourceChangesAt:2}),
    ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const reader=createGithubOnlyHistoricalReviewReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>({ledger:structuredClone(ledger),
      checkpoint:{revision:0,digest:'a'.repeat(64)}})},
    scope:SCOPE,
    taskSecret:'synthetic-private-history-review-key-for-dedupe-01234',
    nowMs:()=>NOW
  });
  await assert.rejects(reader());
});
test('Historical reader refuses a changed or unavailable owner-pinned private ledger',async()=>{
  const h=harness(),ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let reads=0;
  const reader=createGithubOnlyHistoricalReviewReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>{
      reads++;
      return {ledger:structuredClone(ledger),checkpoint:{
        revision:reads===1?0:1,digest:'a'.repeat(64)
      }};
    }},
    scope:SCOPE,taskSecret:
      'synthetic-private-history-review-key-for-dedupe-01234',
    nowMs:()=>NOW
  });
  await assert.rejects(reader());
  assert.equal(reads,2);
});

test('Monthly coverage live-like gateway double-verifies scheduled ZIP and signed private ledger without certifying slots',async()=>{
  const h=harness(),ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  let reads=0;
  const reader=createGithubOnlyMonthlyCoverageReader({
    githubToken:TOKEN,githubTransport:h.transport,
    ownerPinnedVault:{read:async()=>{
      reads++;
      return {ledger:structuredClone(ledger),
        checkpoint:{revision:0,digest:'a'.repeat(64)}};
    }},
    scope:SCOPE,
    taskSecret:'synthetic-monthly-private-history-task-secret-000001',
    nowMs:()=>NOW
  });
  const result=await reader({month:'2027-03'});
  assert.equal(result.sourceAuthenticatedByGateway,true);
  assert.equal(result.ownerPinCheckedByGateway,true);
  assert.equal(result.month,'2027-03');
  assert.equal(result.counts.elapsedReferenceIntervals,1872);
  assert.equal(result.counts.observedSnapshotIntervals,1);
  assert.equal(result.counts.missingReferenceIntervals,1871);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.days.length,31);
  assert.equal(reads,2);
  assert.deepEqual(h.counts(),{discoveries:4,downloads:2,runs:4});
});
test('Monthly coverage cannot proceed after source ZIP is replaced or owner ledger revision changes mid-check',async()=>{
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const changed=harness({sourceChangesAt:2});
  const sourceReader=createGithubOnlyMonthlyCoverageReader({
    githubToken:TOKEN,githubTransport:changed.transport,
    ownerPinnedVault:{read:async()=>({
      ledger:structuredClone(ledger),
      checkpoint:{revision:0,digest:'a'.repeat(64)}
    })},
    scope:SCOPE,
    taskSecret:'synthetic-monthly-private-history-task-secret-000001',
    nowMs:()=>NOW
  });
  await assert.rejects(sourceReader({month:'2027-03'}));
  let reads=0;
  const ledgerReader=createGithubOnlyMonthlyCoverageReader({
    githubToken:TOKEN,githubTransport:harness().transport,
    ownerPinnedVault:{read:async()=>{
      reads++;
      return {ledger:structuredClone(ledger),
        checkpoint:{revision:reads===1?0:1,digest:'a'.repeat(64)}};
    }},
    scope:SCOPE,
    taskSecret:'synthetic-monthly-private-history-task-secret-000001',
    nowMs:()=>NOW
  });
  await assert.rejects(ledgerReader({month:'2027-03'}));
  assert.equal(reads,2);
});
