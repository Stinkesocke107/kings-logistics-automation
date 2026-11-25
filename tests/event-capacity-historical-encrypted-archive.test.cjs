'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {
  createEmptyHistoricalJournal,prepareHistoricalTransition,
  signHistoricalTransitionOffline,appendOwnerSignedHistoricalTransition
}=require('../event-capacity-historical-lifecycle-journal');
const {createEncryptedHistoricalArchive,openEncryptedHistoricalArchive}
  =require('../event-capacity-historical-encrypted-archive');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const OTHER={guildId:'999999999999999999',forumId:SCOPE.forumId};
const SECRET='synthetic private AES-256 key material '.repeat(3);
const BEGIN='2027-03-01T00:00:00.000Z';
function setup(){
  const keys=crypto.generateKeyPairSync('ed25519');
  const ownerPublicKey=keys.publicKey.export({type:'spki',format:'pem'});
  const ownerPrivateKey=keys.privateKey.export({type:'pkcs8',format:'pem'});
  let journal=createEmptyHistoricalJournal({scope:SCOPE,at:BEGIN});
  function add({action='accept',date='2027-03-21T18:00:00.000Z',
    reviewed='2027-03-20T10:00:00.000Z',ref='event:20271'}={}){
    const payload=prepareHistoricalTransition({journal,scope:SCOPE,ownerPublicKey,
      expectedRevision:journal.revision,ref,action,category:'Partner Convoy',
      departureAtUtc:date,reviewedAt:reviewed,
      evidenceDigest:crypto.createHash('sha256').update('e'+(journal.revision+1)).digest('hex'),
      archiveDigest:crypto.createHash('sha256').update('a'+(journal.revision+1)).digest('hex')});
    const receipt=signHistoricalTransitionOffline({payload,ownerPrivateKey});
    journal=appendOwnerSignedHistoricalTransition({journal,scope:SCOPE,ownerPublicKey,
      receipt,expectedRevision:journal.revision});
  }
  const seal=()=>createEncryptedHistoricalArchive({journal,scope:SCOPE,ownerPublicKey,
    encryptionSecret:SECRET});
  const open=({archive,checkpoint,scope=SCOPE,secret=SECRET}={})=>
    openEncryptedHistoricalArchive({archive,expectedCheckpoint:checkpoint,scope,
      ownerPublicKey,encryptionSecret:secret});
  return {add,seal,open,get journal(){return journal;},ownerPublicKey};
}
test('Signed cross-month acceptance, reschedule and completion round trip in encrypted segments',()=>{
  const x=setup();
  x.add();
  x.add({action:'reschedule',date:'2027-04-02T20:00:00.000Z',
    reviewed:'2027-04-01T11:00:00.000Z'});
  x.add({action:'complete',date:'2027-04-02T20:00:00.000Z',
    reviewed:'2027-04-03T12:00:00.000Z'});
  const {archive,checkpoint}=x.seal();
  assert.deepEqual(archive.manifest.parts.map(p=>p.month),['2027-03','2027-04']);
  assert.equal(JSON.stringify(archive).includes('event:20271'),false);
  assert.equal(JSON.stringify(archive).includes('Partner Convoy'),false);
  const result=x.open({archive,checkpoint});
  assert.deepEqual(result.journal,x.journal);
  assert.equal(result.archiveVerified,true);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Empty historical journal can be exported but never proves empty history',()=>{
  const x=setup(),{archive,checkpoint}=x.seal();
  assert.equal(archive.manifest.parts.length,0);
  const result=x.open({archive,checkpoint});
  assert.equal(result.journal.revision,0);
  assert.equal(result.freeSlotsCertified,false);
});
test('Modified, swapped, truncated or duplicated encrypted segments fail closed',()=>{
  const x=setup();x.add();
  x.add({action:'reschedule',date:'2027-04-02T20:00:00.000Z',
    reviewed:'2027-04-01T11:00:00.000Z'});
  const {archive,checkpoint}=x.seal();
  const variants=[];
  const tweak=fn=>{const clone=structuredClone(archive);fn(clone);variants.push(clone);};
  tweak(c=>{c.parts[0]='AA'+c.parts[0].slice(2);});
  tweak(c=>{c.parts.reverse();});
  tweak(c=>{c.parts.pop();});
  tweak(c=>{c.parts.push(c.parts[0]);});
  tweak(c=>{c.manifest.parts[0].tip='a'.repeat(64);});
  tweak(c=>{c.manifest.parts[1].month='2027-05';});
  tweak(c=>{c.manifest.parts[1].firstRevision=1;});
  tweak(c=>{c.manifest.freeSlotsCertified=true;});
  tweak(c=>{c.manifest.parts[0].byteLength=1;});
  for(const changed of variants)assert.throws(()=>x.open({archive:changed,checkpoint}));
});
test('Independent owner-pinned checkpoint is mandatory; wrong encryption key and scope fail',()=>{
  const x=setup();x.add();
  const {archive,checkpoint}=x.seal();
  for(const given of [null,{},
    {...checkpoint,archiveDigest:'0'.repeat(64)},
    {...checkpoint,revision:2},
    {...checkpoint,tip:'b'.repeat(64)}])
    assert.throws(()=>x.open({archive,checkpoint:given}));
  assert.throws(()=>x.open({archive,checkpoint,secret:'other private key'.repeat(4)}));
  assert.throws(()=>x.open({archive,checkpoint,scope:OTHER}));
});
test('A different archive revision cannot be opened with an earlier owner-pinned checkpoint',()=>{
  const x=setup();x.add();
  const previous=x.seal();
  x.add({action:'reschedule',date:'2027-04-02T20:00:00.000Z',
    reviewed:'2027-04-01T11:00:00.000Z'});
  const latest=x.seal();
  assert.throws(()=>x.open({archive:latest.archive,checkpoint:previous.checkpoint}));
  assert.throws(()=>x.open({archive:previous.archive,checkpoint:latest.checkpoint}));
});
