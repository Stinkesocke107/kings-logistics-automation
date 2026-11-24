'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {assertRun,assertArtifact,assertCursor,importPrivateConvoySnapshot}
 =require('../event-capacity-private-import');
const {verifyPrivateSnapshot}=require('../event-capacity-snapshot-attestation');
const REPO='Stinkesocke107/kings-logistics-automation';
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-03-20T12:00:00Z');
const SECRET='synthetic-private-import-secret-for-tests-only-never-production';
const RUNID='45502949674',ARTID='70000000001';
const SHA='1234567890abcdef1234567890abcdef12345678';
function run(patch={}){
  return {
    id:Number(RUNID),name:'Kings Convoy Checker',
    path:'.github/workflows/convoy-checker.yml',
    repository:{full_name:REPO},head_repository:{full_name:REPO},
    head_branch:'main',head_sha:SHA,status:'completed',conclusion:'success',
    event:'schedule',run_attempt:1,run_started_at:'2027-03-20T11:53:00Z',
    updated_at:'2027-03-20T11:59:00Z',...patch
  };
}
function artifact(patch={}){
  return {
    id:Number(ARTID),name:'kings-convoy-reports',expired:false,
    size_in_bytes:makeArtifactZip().length,workflow_run:{id:Number(RUNID),head_sha:SHA,head_branch:'main'},
    ...patch
  };
}
function reports(){
  return {
    report:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:1,actualConvoys:1},
      threads:[{threadId:'150000000000000001',eventId:'125',status:'Scheduled',
        validation:{parsed:{departureAtUtc:'2027-03-20T16:00:00Z'}}}]
    },
    overview:{
      guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{source:'convoy-center',
        threadId:'150000000000000001',eventId:'125',status:'Scheduled',
        departureAtUtc:'2027-03-20T16:00:00Z'}]
    }
  };
}

function crc32(bytes){
  let c=0xffffffff;
  for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}
  return (c^0xffffffff)>>>0;
}
function makeArtifactZip(data=reports()){
  // Fixed small ZIP fixture (stored, no external library or private data).
  const local=[],central=[];
  let offset=0;
  for(const [name,obj] of [
    ['convoy-check-results.json',data.report],
    ['convoy-overview.json',data.overview]
  ]){
    const filename=Buffer.from(name);
    const bytes=Buffer.from(JSON.stringify(obj));
    const hash=crc32(bytes);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);
    header.writeUInt16LE(20,4);
    header.writeUInt16LE(0x800,6);
    header.writeUInt32LE(hash,14);
    header.writeUInt32LE(bytes.length,18);
    header.writeUInt32LE(bytes.length,22);
    header.writeUInt16LE(filename.length,26);
    const centralHeader=Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50,0);
    centralHeader.writeUInt16LE(0x0314,4);
    centralHeader.writeUInt16LE(20,6);
    centralHeader.writeUInt16LE(0x800,8);
    centralHeader.writeUInt32LE(hash,16);
    centralHeader.writeUInt32LE(bytes.length,20);
    centralHeader.writeUInt32LE(bytes.length,24);
    centralHeader.writeUInt16LE(filename.length,28);
    centralHeader.writeUInt32LE((0o100600*0x10000)>>>0,38);
    centralHeader.writeUInt32LE(offset,42);
    local.push(header,filename,bytes);central.push(centralHeader,filename);
    offset+=header.length+filename.length+bytes.length;
  }
  const index=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);
  end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,index,end]);
}

function harness(overrides={}){
  const calls={runs:0,artifacts:0,contents:0,ledger:0,readCursor:0,commit:0};
  const credentials={scope:SCOPE,nowMs:NOW,runId:RUNID,secret:SECRET,
    authenticatedService:true,
    getRun:async ({repository,runId})=>{
      calls.runs++;assert.equal(repository,REPO);assert.equal(runId,RUNID);return run();
    },
    getArtifacts:async ({repository,runId})=>{
      calls.artifacts++;assert.equal(repository,REPO);assert.equal(runId,RUNID);return [artifact()];
    },
    readArtifact:async req=>{
      calls.contents++;
      assert.equal(req.repository,REPO);
      assert.equal(req.artifactId,ARTID);
      assert.equal(req.runAttempt,1);
      assert.equal(req.maxArchiveBytes,25*1024*1024);
      assert.deepEqual(req.requiredFiles,['convoy-check-results.json','convoy-overview.json']);
      return makeArtifactZip();
    },
    loadLedger:async()=>{calls.ledger++;return createEmptyLedger(SCOPE,'2027-03-20T11:00:00Z');},
    readCursor:async()=>{calls.readCursor++;return null;},
    commitSnapshot:async({scope,expected,next,snapshot,metadata})=>{
      calls.commit++;assert.deepEqual(scope,SCOPE);assert.equal(expected,null);
      assert.deepEqual(next,{runId:RUNID,attempt:1,ledgerRevision:0});
      assert.equal(verifyPrivateSnapshot(snapshot,{scope:SCOPE,secret:SECRET,nowMs:NOW}).verified,true);
      assert.deepEqual(metadata,{runId:RUNID,attempt:1,ledgerRevision:0,sourceVerified:true});
      return true;
    },...overrides
  };
  return {credentials,calls};
}
test('Only successful completed on-main scheduled Convoy Checker is eligible',()=>{
  assert.equal(assertRun(run(),{nowMs:NOW,requestedRunId:RUNID}).id,RUNID);
  for(const patch of [
    {status:'in_progress'},{conclusion:'failure'},
    {head_branch:'feature/event-capacity'},{event:'pull_request'},
    {event:'push'},{head_repository:{full_name:'attacker/repo'}},
    {path:'.github/workflows/another.yml'},{run_attempt:0},
    {updated_at:'2027-03-20T10:00:00Z'},
    {run_started_at:'2027-03-20T12:01:00Z'}
  ])assert.throws(()=>assertRun(run(patch),{nowMs:NOW,requestedRunId:RUNID}));
});
test('Live workflow_dispatch allowed only with explicit live mode; dry-run is denied',()=>{
  assert.equal(assertRun(run({event:'workflow_dispatch',inputs:{mode:'live'}}),
    {nowMs:NOW,requestedRunId:RUNID}).id,RUNID);
  assert.throws(()=>assertRun(run({event:'workflow_dispatch',inputs:{mode:'dry-run'}}),
    {nowMs:NOW,requestedRunId:RUNID}));
  assert.throws(()=>assertRun(run({event:'workflow_dispatch'}),
    {nowMs:NOW,requestedRunId:RUNID}));
});
test('Artifact must originate from same successful workflow run and head commit',()=>{
  const verified=assertRun(run(),{nowMs:NOW});
  assert.equal(assertArtifact([artifact()],verified).id,ARTID);
  for(const patch of [
    {name:'other-report'},{expired:true},{size_in_bytes:0},
    {size_in_bytes:30*1024*1024},
    {workflow_run:{id:Number(RUNID)+1,head_sha:SHA,head_branch:'main'}},
    {workflow_run:{id:Number(RUNID),head_sha:'f'.repeat(40),head_branch:'main'}}
  ])assert.throws(()=>assertArtifact([artifact(patch)],verified));
  assert.throws(()=>assertArtifact([artifact(),artifact()],verified));
  assert.throws(()=>assertArtifact([],verified));
});
test('First cursor may bootstrap; old or duplicated snapshot revision cannot replay',()=>{
  const info={id:RUNID,attempt:1};
  assert.deepEqual(assertCursor(null,info,0),{
    runId:RUNID,attempt:1,ledgerRevision:0
  });
  assert.throws(()=>assertCursor({runId:RUNID,attempt:1,ledgerRevision:0},info,0));
  assert.throws(()=>assertCursor({runId:RUNID,attempt:2,ledgerRevision:0},info,1));
  assert.throws(()=>assertCursor({runId:String(BigInt(RUNID)+1n),attempt:1,ledgerRevision:0},info,1));
  assert.throws(()=>assertCursor({runId:RUNID,attempt:1,ledgerRevision:2},info,1));
  assert.equal(assertCursor({runId:RUNID,attempt:1,ledgerRevision:0},info,1).ledgerRevision,1);
});
test('Authorized private import signs snapshot after validating run, artifact and ledger',async()=>{
  const {credentials,calls}=harness();
  const result=await importPrivateConvoySnapshot(credentials);
  assert.deepEqual(result.metadata,{runId:RUNID,attempt:1,ledgerRevision:0,sourceVerified:true});
  assert.equal(verifyPrivateSnapshot(result.snapshot,{scope:SCOPE,secret:SECRET,nowMs:NOW}).verified,true);
  assert.deepEqual(Object.values(calls),[1,1,1,1,1,1]);
});
test('Unauthenticated issuer never reads private workflow or ledger',async()=>{
  const {credentials,calls}=harness({authenticatedService:false});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.runs,0);
  assert.equal(calls.ledger,0);
});
test('Run metadata failure stops before artifact download and staff ledger',async()=>{
  const {credentials,calls}=harness({getRun:async()=>run({conclusion:'cancelled'})});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.artifacts,0);
  assert.equal(calls.contents,0);
  assert.equal(calls.ledger,0);
});
test('Artifact provenance mismatch fails closed without private download',async()=>{
  const {credentials,calls}=harness({getArtifacts:async()=>[artifact({
    workflow_run:{id:Number(RUNID)+1,head_sha:SHA,head_branch:'main'}
  })]});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.contents,0);
  assert.equal(calls.ledger,0);
});
test('Source inventory mismatch cannot advance the private import cursor',async()=>{
  const {credentials,calls}=harness({readArtifact:async()=>{
    const r=reports();r.overview.registeredConvoys[0].eventId='wrong';return makeArtifactZip(r);
  }});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
test('Wrong forum scope cannot sign or record a new successful import',async()=>{
  const {credentials,calls}=harness({scope:{
    guildId:SCOPE.guildId,forumId:'333333333333333333'
  }});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
test('Rollback cursor rejects stale accepted run before recording a new snapshot',async()=>{
  const {credentials,calls}=harness({readCursor:async()=>({
    runId:String(BigInt(RUNID)+5n),attempt:1,ledgerRevision:0
  })});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
test('Transaction CAS failure does not return a trusted private dashboard snapshot',async()=>{
  const {credentials,calls}=harness({commitSnapshot:async()=>false});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.contents,1);
});
test('A cursor-only persistence callback cannot mark a source snapshot imported',async()=>{
  const {credentials,calls}=harness({commitSnapshot:undefined,commitCursor:async()=>true});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.runs,0);
});
test('Private snapshot write failure cannot advance the import state or leak details',async()=>{
  const {credentials,calls}=harness({commitSnapshot:async()=>{
    calls.commit++;
    throw Error('secret private event approval: do not show');
  }});
  await assert.rejects(importPrivateConvoySnapshot(credentials),error=>{
    assert.equal(String(error).includes('private event approval'),false);
    return true;
  });
  assert.equal(calls.commit,1);
});
test('Producer/import errors do not leak private identity or credentials',async()=>{
  const {credentials}=harness({readArtifact:async()=>{
    throw Error('private Event Coordinator name 123; token=secret');
  }});
  await assert.rejects(importPrivateConvoySnapshot(credentials),error=>{
    assert.equal(String(error).includes('Coordinator name'),false);
    assert.equal(String(error).includes('token=secret'),false);
    return true;
  });
});
test('A caller cannot redirect import to a different repository',async()=>{
  const {credentials,calls}=harness({expectedRepo:'external/attacker'});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.runs,0);
});

test('Protected importer refuses malformed non-ZIP archive bytes before cursor advancement',async()=>{
  const {credentials,calls}=harness({readArtifact:async()=>Buffer.from('{}')});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
test('Protected importer refuses ZIP archive size inconsistent with GitHub metadata',async()=>{
  const {credentials,calls}=harness({getArtifacts:async()=>[
    artifact({size_in_bytes:makeArtifactZip().length+100})
  ]});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
test('Protected importer rejects an untrusted object instead of raw ZIP bytes',async()=>{
  const {credentials,calls}=harness({readArtifact:async()=>reports()});
  await assert.rejects(importPrivateConvoySnapshot(credentials));
  assert.equal(calls.commit,0);
});
