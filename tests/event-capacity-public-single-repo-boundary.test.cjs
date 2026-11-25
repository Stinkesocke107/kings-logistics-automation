'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  publicReadiness,
  preparePublicReadinessArtifact,
  validatePublicReadinessArtifact
}=require('../event-capacity-public-single-repo-boundary');
const REPO='Stinkesocke107/kings-logistics-automation';
const PATH='data/event-capacity/public-readiness.json';
function sample(){
  const artifact=preparePublicReadinessArtifact();
  return {repository:REPO,path:PATH,content:artifact.content};
}
test('Public-only mode prepares fixed anonymous DRAFT status and writes nothing',()=>{
  const result=preparePublicReadinessArtifact();
  assert.equal(result.path,PATH);
  assert.equal(result.publicOnly,true);
  assert.equal(result.writePerformed,false);
  assert.equal(result.liveWorkflowChanged,false);
  assert.equal(validatePublicReadinessArtifact(sample()).verified,true);
  const state=publicReadiness();
  assert.equal(state.realDataStorageConfigured,false);
  assert.equal(state.productionActivated,false);
  assert.equal(state.humanApprovalRequired,true);
  assert.equal(state.freeSlotsCertified,false);
  assert.equal(state.realHistoricalCoverageCertified,false);
});
test('Reject raw Driver, Staff and event records in published metadata',()=>{
  for(const [name,value] of [
    ['driverId','700000000000000999'],
    ['discordUsername','sample-driver-name'],
    ['eventId','event:100'],
    ['approvedAt','2027-04-20T00:00:00Z'],
    ['eventList',[{name:'Private event'}]],
    ['rawSourceArchive',{threads:[]}],
    ['ownerReceipt',{signature:'sensitive'}],
    ['archiveCiphertext','base64-private-content'],
    ['historicalMonthCounts',{'2027-04':4}],
    ['capacityRemaining',2]
  ]){
    const candidate={...publicReadiness(),[name]:value};
    assert.throws(()=>validatePublicReadinessArtifact({
      ...sample(),content:JSON.stringify(candidate)
    }));
  }
});
test('Any false positive for proof, free slots or live enablement is refused',()=>{
  for(const [name,value] of [
    ['realHistoricalCoverageCertified',true],
    ['freeSlotsCertified',true],
    ['releaseStatus','ACTIVE'],
    ['productionActivated',true],
    ['ownerSigningKeyPublished',true],
    ['realDataStorageConfigured',true],
    ['humanApprovalRequired',false],
    ['publicStatusOnly',false],
    ['mode','ENCRYPTED_DATA_HOSTING']
  ]){
    const candidate={...publicReadiness(),[name]:value};
    assert.throws(()=>validatePublicReadinessArtifact({
      ...sample(),content:JSON.stringify(candidate)
    }));
  }
});
test('Never accept arbitrary path traversal, alternate repo or non-metadata file',()=>{
  for(const path of [
    'data/event-capacity/private-history.json',
    'data/event-capacity/../secrets.json',
    'data/event-capacity/public-readiness.json/../users.json',
    '.github/workflows/convoy-checker.yml',
    'data/event-capacity/public-readiness.json.old'
  ])assert.throws(()=>validatePublicReadinessArtifact({...sample(),path}));
  for(const repository of [
    'other/private',
    'Stinkesocke107/kings-logistics-automation-archive',
    'stinkesocke107/kings-logistics-automation'
  ])assert.throws(()=>validatePublicReadinessArtifact({...sample(),repository}));
});
test('Malformed JSON, excess properties, arrays and oversized status fail closed',()=>{
  for(const content of [
    '',
    '{broken',
    '[]',
    'null',
    JSON.stringify({...publicReadiness(),unexpected:'x'}),
    JSON.stringify({schemaVersion:1}),
    JSON.stringify(publicReadiness())+' '.repeat(4000)
  ])assert.throws(()=>validatePublicReadinessArtifact({...sample(),content}));
});
test('The public status does not leak Event records or encryption key material',()=>{
  const serialized=preparePublicReadinessArtifact().content;
  for(const token of [
    'DISCORD_BOT_TOKEN','GITHUB_TOKEN','PRIVATE KEY','AES_GCM_KEY',
    'driverId','eventId','threadId','ownerReceipt','archiveCiphertext',
    'sourceEvidenceDigest','freeSlotsRemaining','Staff Report'
  ])assert.equal(serialized.includes(token),false);
});
test('All calls are deterministic and never mutate external storage',()=>{
  const before=preparePublicReadinessArtifact();
  const after=preparePublicReadinessArtifact();
  assert.deepEqual(before,after);
  assert.equal(Object.isFrozen(before),true);
  assert.equal(Object.isFrozen(publicReadiness()),true);
  assert.equal(validatePublicReadinessArtifact(sample()).confidentialDataAllowed,false);
  assert.equal(validatePublicReadinessArtifact(sample()).encryptedHistoricalPayloadAllowed,false);
});
