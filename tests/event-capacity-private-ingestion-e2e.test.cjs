'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createEmptyLedger,applyDecision}=require('../event-capacity-decision-ledger');
const {createPrivateSqliteSnapshotStore}=require('../event-capacity-private-sqlite');
const {createExternallyAnchoredSnapshotStore}=require('../event-capacity-external-anchor');
const {createPrivateCapacityIngestion}=require('../event-capacity-private-ingestion');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const REPO='Stinkesocke107/kings-logistics-automation';
const RUN='45502949674',ART='70000000001',SHA='1'.repeat(40);
const NOW=Date.parse('2027-03-20T12:00:00Z');
const SIGN='offline-synthetic-only-signing-secret-not-for-production-333';
const ENC='offline-synthetic-only-encryption-secret-not-for-production-444';
function reports(){
  return {
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:0,actualConvoys:0},threads:[]},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:0,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},registeredConvoys:[]}
  };
}
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}
  return (c^0xffffffff)>>>0;
}
function zip(data=reports()){
  const locals=[],centrals=[];
  let offset=0;
  for(const [name,body] of [
    ['convoy-check-results.json',data.report],
    ['convoy-overview.json',data.overview]
  ]){
    const nameBytes=Buffer.from(name),bytes=Buffer.from(JSON.stringify(body));
    const crc=crc32(bytes),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);
    local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);
    local.writeUInt16LE(nameBytes.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(0x0314,4);
    central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);
    central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(nameBytes.length,28);
    central.writeUInt32LE((0o100600*0x10000)>>>0,38);
    central.writeUInt32LE(offset,42);
    locals.push(local,nameBytes,bytes);centrals.push(central,nameBytes);
    offset+=local.length+nameBytes.length+bytes.length;
  }
  const idx=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);
  end.writeUInt32LE(idx.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,idx,end]);
}
async function harness(callback,{authorize=true,corruptArtifact=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-private-ingestion-e2e-'));
  fs.chmodSync(dir,0o700);
  const store=createPrivateSqliteSnapshotStore({directory:dir,scope:SCOPE,
    encryptionSecret:ENC,signingSecret:SIGN,nowMs:()=>NOW});
  const calls={discover:0,run:0,artifactList:0,zip:0,ledger:0,auth:0};
  let remote=null;
  let ledger=createEmptyLedger(SCOPE,'2027-03-20T11:00:00Z');
  const anchored=createExternallyAnchoredSnapshotStore({scope:SCOPE,store,
    anchor:{
      load:async()=>remote,
      compareAndAdvance:async({expected,next})=>{
        if(JSON.stringify(expected)!==JSON.stringify(remote))return false;
        remote=next;return true;
      }
    }});
  const archive=zip();
  const githubReader={
    getLatestScheduledRun:async({repository,nowMs})=>{
      calls.discover++;assert.equal(repository,REPO);assert.equal(nowMs,NOW);
      return {runId:RUN,attempt:1};
    },
    getRun:async()=>{
      calls.run++;
      return {id:Number(RUN),name:'Kings Convoy Checker',
        path:'.github/workflows/convoy-checker.yml',
        repository:{full_name:REPO},head_repository:{full_name:REPO},
        head_branch:'main',head_sha:SHA,status:'completed',conclusion:'success',
        event:'schedule',run_attempt:1,run_started_at:'2027-03-20T11:53:00Z',
        updated_at:'2027-03-20T11:59:00Z'};
    },
    getArtifacts:async()=>{
      calls.artifactList++;
      return [{id:Number(ART),name:'kings-convoy-reports',expired:false,
        size_in_bytes:archive.length,
        workflow_run:{id:Number(RUN),head_branch:'main',head_sha:SHA}}];
    },
    readArtifact:async()=>{calls.zip++;
      if(!corruptArtifact)return archive;
      const bad=Buffer.from(archive);bad[80]^=0xff;return bad;
    }
  };
  const ingest=createPrivateCapacityIngestion({scope:SCOPE,githubReader,
    anchoredStore:anchored,loadLedger:async()=>{
      calls.ledger++;return ledger;
    },
    authorizeService:async()=>{
      calls.auth++;
      return {verified:authorize,service:'kings-event-capacity-private-importer',
        scope:SCOPE,expiresAtMs:NOW+60000};
    },
    snapshotSecret:SIGN,nowMs:()=>NOW
  });
  try{return await callback({ingest,store,anchored,calls,
    getRemote:()=>remote,
    changeLedger:()=>{ledger=applyDecision(ledger,{expectedRevision:ledger.revision,
      action:'classification',ref:'event:1234',value:'Partner Convoy',
      evidenceRef:'synthetic-private-approval'},{
      source:'trusted-server-gateway',id:'synthetic-manager',
      verifiedRoles:['Event Coordination']
    },'2027-03-20T11:58:00Z');},
    rollbackRemote:()=>{remote={revision:1,digest:'a'.repeat(64)};}
  });}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('Scheduled import crosses authenticated GitHub ZIP, ledger, SQLite and external CAS',async()=>{
  await harness(async h=>{
    const first=await h.ingest.runLatestScheduled();
    assert.deepEqual(first,{state:'Imported',runId:RUN,attempt:1,ledgerRevision:0});
    assert.equal(h.calls.zip,1);
    assert.deepEqual(h.anchored.verifyCheckpoint?await h.anchored.verifyCheckpoint():null,
      {local:h.store.checkpoint(),remote:h.getRemote()});
    assert.equal((await h.anchored.readLatest()).metadata.sourceVerified,true);
    assert.equal(h.store.readCursor().runId,RUN);
  });
});
test('15-minute repeated poll is NoChange without duplicate private artifact download',async()=>{
  await harness(async h=>{
    await h.ingest.runLatestScheduled();
    const duplicate=await h.ingest.runLatestScheduled();
    assert.equal(duplicate.state,'NoChange');
    assert.equal(h.calls.run,1);
    assert.equal(h.calls.zip,1);
    assert.equal(h.store.readLatest().revision,1);
  });
});
test('Independent ledger revision invalidates NoChange and creates new anchored snapshot',async()=>{
  await harness(async h=>{
    await h.ingest.runLatestScheduled();
    h.changeLedger();
    const second=await h.ingest.runLatestScheduled();
    assert.equal(second.state,'Imported');
    assert.equal(second.ledgerRevision,1);
    assert.equal((await h.anchored.readLatest()).revision,2);
    assert.equal(h.calls.zip,2);
  });
});
test('Unverified service identity is rejected before any GitHub or private source access',async()=>{
  await harness(async h=>{
    await assert.rejects(h.ingest.runLatestScheduled());
    assert.equal(h.calls.discover,0);
    assert.equal(h.calls.ledger,0);
    assert.equal(h.calls.zip,0);
  },{authorize:false});
});
test('CRC-tampered ZIP does not commit, advance cursor or independent checkpoint',async()=>{
  await harness(async h=>{
    await assert.rejects(h.ingest.runLatestScheduled());
    assert.equal(h.store.readCursor(),null);
    assert.equal(h.getRemote(),null);
  },{corruptArtifact:true});
});
test('External checkpoint mismatch blocks even a duplicate import poll',async()=>{
  await harness(async h=>{
    await h.ingest.runLatestScheduled();
    h.rollbackRemote();
    await assert.rejects(h.ingest.runLatestScheduled());
    assert.equal(h.calls.zip,1);
  });
});
