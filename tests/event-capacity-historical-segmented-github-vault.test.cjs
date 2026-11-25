'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const {createPrivateSegmentedHistoricalBackupVault}
  =require('../event-capacity-historical-segmented-github-vault');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const HISTORY='kings-private-example/historical-decisions';
const WITNESS='kings-private-example/historical-witness';
const BACKUPS='kings-private-example/historical-backups';
const TOKEN='synthetic-private-segmented-backup-token';
const SOURCE_SECRET='synthetic private encryption secret for test only and never production';
const BACKUP_SECRET='independent private offsite backup secret for isolated test';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const INDEX='capacity-backups/daily/2027-05-20.manifest.json';
function sha1(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function fixture(){
  const x=setup(),data=new Map(),calls=[];
  const envelope=createEncryptedOffsiteHistoricalBackup({
    archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,encryptionSecret:SOURCE_SECRET,
    backupSecret:BACKUP_SECRET,nowMs:NOW
  }).envelope;
  let isPrivate=true,collision=false,failAfterIndexWrite=false,
    refuseSegment=false,mutateSecondIndex=false,indexReads=0;
  function file(path,bytes){
    return {type:'file',path,encoding:'base64',
      sha:sha1(bytes),size:bytes.length,content:bytes.toString('base64')};
  }
  async function transport(url,options){
    const prefix='https://api.github.com/repos/'+BACKUPS;
    assert.ok(url.startsWith(prefix));
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    assert.ok(['GET','PUT'].includes(options.method));
    const route=url.slice(prefix.length);
    calls.push({method:options.method,route});
    if(route==='')return Response.json({
      full_name:BACKUPS,private:isPrivate,archived:false,
      disabled:false,default_branch:'main'
    });
    const m=route.match(/^\/contents\/(capacity-backups\/[a-zA-Z0-9/_.-]+)(?:\?ref=main)?$/);
    if(!m)return Response.json({message:'not found'},{status:404});
    const path=m[1];
    if(options.method==='GET'){
      const present=data.get(path);
      if(!present)return Response.json({message:'not found'},{status:404});
      if(path===INDEX)indexReads++;
      let bytes=present;
      if(path===INDEX&&mutateSecondIndex&&indexReads>1)
        bytes=Buffer.from('{"invalid":1}');
      return Response.json(file(path,bytes));
    }
    const payload=JSON.parse(options.body);
    assert.equal(payload.branch,'main');
    assert.equal('sha' in payload,false);
    if(collision&&path===INDEX)return Response.json({message:'conflict'},{status:409});
    if(refuseSegment&&path.includes('/segments/'))
      return Response.json({message:'forbidden'},{status:403});
    if(data.has(path))return Response.json({message:'exists'},{status:422});
    const bytes=Buffer.from(payload.content,'base64');
    data.set(path,bytes);
    if(failAfterIndexWrite&&path===INDEX)
      return Response.json({message:'remote uncertain'},{status:500});
    return Response.json({content:{sha:sha1(bytes)},commit:{sha:'f'.repeat(40)}},
      {status:201});
  }
  const vault=(options={})=>createPrivateSegmentedHistoricalBackupVault({
    repository:BACKUPS,dataRepository:HISTORY,witnessRepository:WITNESS,
    token:TOKEN,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE_SECRET,backupSecret:BACKUP_SECRET,
    transport,nowMs:()=>NOW,...options
  });
  const write=(options={})=>vault().writeDailyOnce({
    envelope,ownerReceipt:x.nextOwnerReceipt,chunkBytes:1024,...options
  });
  const read=(options={})=>vault().readDaily({
    day:'2027-05-20',ownerReceipt:x.nextOwnerReceipt,...options
  });
  return {x,envelope,data,calls,vault,write,read,
    publicRepo:()=>{isPrivate=false;},
    collide:()=>{collision=true;},
    failAfterIndex:()=>{failAfterIndexWrite=true;},
    refuseSegment:()=>{refuseSegment=true;},
    mutateIndex:()=>{mutateSecondIndex=true;}
  };
}
test('Stage encrypted SHA256 chunks first, then immutable daily manifest last',async()=>{
  const x=fixture(),result=await x.write();
  assert.equal(result.state,'StoredPendingIndependentOwnerAndRetentionAudit');
  assert.ok(result.segmentCount>1);
  assert.equal(result.immutableManifestVerified,true);
  assert.equal(result.offsiteBackupStored,true);
  assert.equal(result.retentionEnforced,false);
  assert.equal(result.freeSlotsCertified,false);
  const writes=x.calls.filter(x=>x.method==='PUT');
  assert.ok(writes.length>2);
  assert.ok(writes.slice(0,-1).every(x=>x.route.includes('/segments/')));
  assert.equal(writes.at(-1).route,'/contents/'+INDEX);
  assert.equal(x.data.has(INDEX),true);
  assert.doesNotMatch(JSON.stringify([...x.data.values()].map(x=>x.toString())),/event:100|Partner Convoy/);
});
test('Private segmented backup read reassembles, decrypts and verifies original signed archive',async()=>{
  const x=fixture();await x.write();
  const result=await x.read();
  assert.equal(result.state,'Private Segmented Backup Read Verified');
  assert.equal(result.encryptedArchiveVerified,true);
  assert.equal(result.repositoryVerifiedPrivate,true);
  assert.equal(result.revision,2);
  assert.equal(result.productionRestorePerformed,false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Same-day repeated write denied without extra PUT requests',async()=>{
  const x=fixture();await x.write();
  const initial=x.calls.filter(x=>x.method==='PUT').length;
  await assert.rejects(x.write());
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,initial);
});
test('Forged receipt and wrong decryption secret denied before any network access',async()=>{
  const x=fixture();const forged=structuredClone(x.x.nextOwnerReceipt);
  forged.payload.archiveDigest='0'.repeat(64);
  await assert.rejects(x.write({ownerReceipt:forged}));
  assert.equal(x.calls.length,0);
  const wrong=fixture();
  await assert.rejects(wrong.vault({backupSecret:'independent but wrong backup encryption secret'})
    .writeDailyOnce({envelope:wrong.envelope,
      ownerReceipt:wrong.x.nextOwnerReceipt,chunkBytes:1024}));
  assert.equal(wrong.calls.length,0);
});
test('A public, shared or misconfigured private repo is refused',async()=>{
  const x=fixture();x.publicRepo();
  await assert.rejects(x.write());
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);
  assert.throws(()=>x.vault({repository:HISTORY}));
  assert.throws(()=>x.vault({repository:WITNESS}));
  assert.throws(()=>x.vault({repository:'Stinkesocke107/kings-logistics-automation'}));
});
test('Segment upload failure leaves current day unpublished and never retries',async()=>{
  const x=fixture();x.refuseSegment();
  await assert.rejects(x.write());
  assert.equal(x.data.has(INDEX),false);
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
});
test('Final manifest conflict does not overwrite an existing backup',async()=>{
  const x=fixture();x.collide();
  await assert.rejects(x.write());
  assert.equal(x.data.has(INDEX),false);
  assert.ok(x.calls.some(c=>c.method==='PUT'&&c.route==='/contents/'+INDEX));
});
test('Ambiguous committed manifest leaves encrypted content for manual read-only reconciliation',async()=>{
  const x=fixture();x.failAfterIndex();
  await assert.rejects(x.write());
  assert.equal(x.data.has(INDEX),true);
  const verified=await x.read();
  assert.equal(verified.revision,2);
  assert.equal(verified.freeSlotsCertified,false);
  assert.equal(x.calls.filter(c=>c.method==='PUT'&&c.route==='/contents/'+INDEX).length,1);
});
test('Remote ciphertext tampering, changed manifest and missing segment fail closed',async()=>{
  const x=fixture();await x.write();
  const saved=new Map(x.data);
  const first=[...x.data.keys()].find(k=>k.includes('/segments/'));
  const corrupt=Buffer.from(x.data.get(first));corrupt[0]^=1;
  x.data.set(first,corrupt);
  await assert.rejects(x.read());
  x.data.clear();for(const [key,v] of saved)x.data.set(key,v);
  x.data.delete(first);await assert.rejects(x.read());
  x.data.clear();for(const [key,v] of saved)x.data.set(key,v);
  x.mutateIndex();
  await assert.rejects(x.read());
});
test('Older backup day or wrong key never silently accepted for a new UTC date',async()=>{
  const x=fixture();
  await assert.rejects(x.write({envelope:{...x.envelope,day:'2027-05-19'}}));
  assert.equal(x.calls.length,0);
  await assert.rejects(x.read({day:'2027-05-19'}));
});
