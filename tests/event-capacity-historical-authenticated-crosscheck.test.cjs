'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {createStableHistoricalCrosscheck,
  createGithubOnlyAuthenticatedHistoricalCrosscheck}
  =require('../event-capacity-historical-authenticated-crosscheck');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const SECRET='synthetic-private-history-gateway-task-key-material-0123';
const THREAD='700000000000000100';
function makeFixture(){
  const x=setup();
  const reported={
    sourceKind:'authenticated-kings-convoy-checker',
    runId:'45502949674',attempt:1,artifactId:'70000000001',
    headSha:'1'.repeat(40),archiveDigest:'2'.repeat(64),
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-05-20T11:54:00Z',
      finalization:{finalizedAt:'2027-05-20T11:56:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{eventId:'100',threadId:THREAD,status:'Rescheduled',
        name:'Private synthetic source title',
        staffStatus:{status:'Rescheduled',authorId:'private-staff',
          matchedRoleIds:['private-role'],roleSource:'guild-member-lookup'},
        validation:{parsed:{eventType:'Partner Convoy',
          departureAtUtc:'2027-04-20T18:00:00.000Z'}}}]},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-05-20T11:57:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{source:'convoy-center',eventId:'100',threadId:THREAD,
        status:'Rescheduled',departureAtUtc:'2027-04-20T18:00:00.000Z'}]}
  };
  const ledger=createEmptyLedger(SCOPE,'2027-05-20T11:25:00Z');
  const pinnedLedger={ledger,checkpoint:{revision:0,digest:'c'.repeat(64)}};
  const history={journal:x.afterJournal,checkpoint:x.next.checkpoint,
    indexSha:'d'.repeat(40),indexDigest:'e'.repeat(64),
    repositoryVerifiedPrivate:true,encryptedArchiveIntegrityVerified:true,
    sourceEvidenceAuthenticityVerified:false,
    historicalCoverageCertified:false,freeSlotsCertified:false};
  let sourceReads=0,ledgerReads=0,historyReads=0;
  let sourceFn=()=>structuredClone(reported),
    ledgerFn=()=>structuredClone(pinnedLedger),
    historyFn=()=>structuredClone(history);
  const args={
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,taskSecret:SECRET,
    nowMs:()=>NOW,
    readSource:async()=>{sourceReads++;return sourceFn(sourceReads);},
    readLedger:async()=>{ledgerReads++;return ledgerFn(ledgerReads);},
    readHistoricalArchive:async()=>{historyReads++;return historyFn(historyReads);}
  };
  return {x,args,reported,pinnedLedger,history,
    source:(fn)=>{sourceFn=fn;},ledger:(fn)=>{ledgerFn=fn;},
    historyRead:(fn)=>{historyFn=fn;},
    counts:()=>({sourceReads,ledgerReads,historyReads})};
}
const read=x=>createStableHistoricalCrosscheck(x.args).read();
test('Stable signed-history crosscheck double-reads all three sensitive sources',async()=>{
  const x=makeFixture(),result=await read(x);
  assert.deepEqual(x.counts(),{sourceReads:2,ledgerReads:2,historyReads:2});
  assert.equal(result.signedJournalIntegrityVerified,true);
  assert.equal(result.ownerPinnedLedgerReadConsistent,true);
  assert.equal(result.encryptedHistoricalArchiveReadConsistent,true);
  assert.equal(result.sourceSnapshotDoubleReadConsistent,true);
  assert.equal(result.sourceAuthenticationEstablishedByThisComposer,false);
  assert.equal(result.independentLatestOwnerHighwaterVerified,false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.doesNotMatch(JSON.stringify(result),/Private synthetic source title|private-staff|event:100/);
});
test('Changed authenticated report status or source run during second read fails closed',async()=>{
  for(const field of ['status','run']){
    const x=makeFixture();
    x.source(n=>{
      const copy=structuredClone(x.reported);
      if(n===2){
        if(field==='status'){copy.report.threads[0].status='Completed';
          copy.overview.registeredConvoys[0].status='Completed';}
        else copy.runId='45502949675';
      }
      return copy;
    });
    await assert.rejects(read(x),/historical sources changed/);
    assert.equal(x.counts().sourceReads,2);
  }
});
test('Concurrent private ledger revision or checkpoint changes fail closed',async()=>{
  for(const field of ['ledger','checkpoint']){
    const x=makeFixture();
    x.ledger(n=>{
      const result=structuredClone(x.pinnedLedger);
      if(n===2&&field==='checkpoint')result.checkpoint.digest='0'.repeat(64);
      if(n===2&&field==='ledger')result.ledger.updatedAt='2027-05-20T11:26:00Z';
      return result;
    });
    await assert.rejects(read(x));
  }
});
test('Historical owner archive swapped or its checkpoint changed mid-read fails closed',async()=>{
  for(const field of ['archive','checkpoint']){
    const x=makeFixture();
    x.historyRead(n=>{
      const data=structuredClone(x.history);
      if(n===2&&field==='archive')data.indexSha='1'.repeat(40);
      if(n===2&&field==='checkpoint')data.checkpoint={...data.checkpoint,
        archiveDigest:'0'.repeat(64)};
      return data;
    });
    await assert.rejects(read(x));
  }
});
test('A fake private repository or archive integrity flag cannot become trusted',async()=>{
  for(const flag of ['repositoryVerifiedPrivate','encryptedArchiveIntegrityVerified',
    'historicalCoverageCertified','freeSlotsCertified']){
    const x=makeFixture();
    x.historyRead(()=>{
      const value=structuredClone(x.history);
      value[flag]=flag.endsWith('Certified')?true:false;
      return value;
    });
    await assert.rejects(read(x));
  }
});
test('Tampered signed history or incomplete historical source is not silently certified',async()=>{
  const x=makeFixture();
  x.historyRead(()=>{
    const v=structuredClone(x.history);
    v.journal.tip='0'.repeat(64);
    v.checkpoint.tip='0'.repeat(64);
    return v;
  });
  await assert.rejects(read(x));
  const y=makeFixture();
  y.source(()=>{
    const v=structuredClone(y.reported);
    v.report.threads=[];v.report.summary.totalThreads=0;
    v.report.summary.actualConvoys=0;
    v.overview.registeredConvoys=[];
    v.overview.overall.realConvoySubmissions=0;
    return v;
  });
  const missing=await read(y);
  assert.ok(missing.issues.some(i=>
    i.reason==='historical-signed-event-not-in-current-source'));
  assert.equal(missing.freeSlotsCertified,false);
});
test('Unauthenticated source data and wrong scope are refused',async()=>{
  const x=makeFixture();
  x.source(()=>{
    const v=structuredClone(x.reported);
    v.sourceKind='untrusted-discord-attachment';
    return v;
  });
  await assert.rejects(read(x));
  const y=makeFixture();
  assert.throws(()=>createStableHistoricalCrosscheck({
    ...y.args,scope:{...SCOPE,forumId:'999999999999999999'}
  }));
});
test('Uncaught private transport errors produce only a generic safe error',async()=>{
  const x=makeFixture();
  x.source(()=>{throw Error('raw private EVENT ID and token token:secret');});
  await assert.rejects(read(x),error=>{
    assert.doesNotMatch(String(error),/raw private|token:secret|event:100/);
    return true;
  });
});
test('Concrete GitHub authenticated gateway refuses invalid credentials and public source store',()=>{
  const args={githubToken:'short',
    historicalRepository:'Stinkesocke107/kings-logistics-automation',
    historicalToken:'synthetic-long-private-historical-token',
    encryptionSecret:'synthetic-private-encryption-key-material-not-real',
    scope:SCOPE,ownerPublicKey:makeFixture().x.ownerPublicKey,
    ownerReceipt:makeFixture().x.nextOwnerReceipt,
    ownerPinnedVault:{read:async()=>makeFixture().pinnedLedger},
    taskSecret:SECRET};
  assert.throws(()=>createGithubOnlyAuthenticatedHistoricalCrosscheck(args));
  assert.throws(()=>createGithubOnlyAuthenticatedHistoricalCrosscheck({
    ...args,githubToken:'synthetic-sufficient-public-source-read-token'
  }));
});
