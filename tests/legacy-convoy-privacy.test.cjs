'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {encryptLegacyArchive,decryptLegacyArchive,sanitizeLegacyPublicArchive,hasUnredactedPrivateNotes}=require('../legacy-convoy-privacy');
const {migrate}=require('../scripts/migrate-legacy-convoy-private');
const key='kings-test-only-long-secret-more-than-32-chars';
const original={version:1,convoys:[{legacyId:'synthetic',eventUnix:1900000000,eventDate:'2027-01-01',
  confirmedKingsSlot:true,slotStatus:'confirmed',kingsSlot:'Confirmed — private staff note',
  sourceMessageIds:['synthetic1'],sourceNotes:[{text:'PRIVATE_NOTE_TEST_TOKEN'}],
  slotEvidence:[{text:'PRIVATE_EVIDENCE_TEST_TOKEN'}],
  kingsSlotImage:{capturedUrl:'https://cdn.example.invalid/sample.png',accompanyingText:'PRIVATE_IMAGE_TEXT_TEST_TOKEN'},
  kingsSlotImages:[{capturedUrl:'https://cdn.example.invalid/sample.png',accompanyingText:'PRIVATE_IMAGE_TEXT_TEST_TOKEN'}]}],
  failures:[],summary:{importedFutureLegacyConvoys:1}};
test('private Legacy Convoy archive round trips and preserves full original event data',()=>{
  const c=encryptLegacyArchive(original,key);
  assert.equal(c.encrypted,true);
  assert.equal(JSON.stringify(c).includes('PRIVATE_NOTE_TEST_TOKEN'),false);
  assert.deepEqual(decryptLegacyArchive(c,key),original);
  assert.throws(()=>decryptLegacyArchive(c,'wrong-key-with-minimum-32-characters'),/integrity check failed/);
  assert.throws(()=>decryptLegacyArchive({...c,authTag:'invalid'},key),/integrity check failed/);
});
test('public Legacy Convoy projection keeps slot reminders but strips raw private text',()=>{
  const p=sanitizeLegacyPublicArchive(original);
  assert.equal(hasUnredactedPrivateNotes(p),false);
  assert.equal(p.convoys[0].confirmedKingsSlot,true);
  assert.equal(p.convoys[0].eventUnix,1900000000);
  assert.ok(p.convoys[0].kingsSlot);
  assert.ok(p.convoys[0].kingsSlotImage.capturedUrl);
  assert.equal(p.convoys[0].sourceNotes.length,0);
  assert.equal(p.convoys[0].slotEvidence.length,0);
  assert.equal(p.convoys[0].sourceMessageIds.length,0);
  assert.equal(JSON.stringify(p).includes('PRIVATE_'),false);
});
test('first migration, repeated migration and source preservation are safe',()=>{
  const first=migrate(original,null,key);
  assert.equal(hasUnredactedPrivateNotes(first.publicState),false);
  assert.deepEqual(decryptLegacyArchive(first.privateState,key),original);
  const second=migrate(first.publicState,first.privateState,key);
  assert.deepEqual(second.publicState,first.publicState);
  assert.deepEqual(second.privateState,first.privateState);
  assert.throws(()=>migrate(first.publicState,null,key),/cannot prove original source/);
});
test('future importer writes both encrypted source and sanitized public projection',()=>{
  const s=fs.readFileSync(path.join(__dirname,'..','legacy-convoy-import.js'),'utf8');
  assert.match(s,/encryptLegacyArchive\(/);
  assert.match(s,/sanitizeLegacyPublicArchive\(/);
  assert.match(s,/legacy-convoys-private\.json/);
  assert.doesNotMatch(s,/console\.error\([^\n]*error\.stack/);
});

test('actual tracked Legacy archive projection preserves every event and operational slot availability',()=>{
  const tracked=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','legacy-convoys.json'),'utf8'));
  const p=sanitizeLegacyPublicArchive(tracked);
  assert.equal(p.convoys.length,tracked.convoys.length);
  for(let i=0;i<p.convoys.length;i++){
    const current=p.convoys[i],prior=tracked.convoys[i];
    for(const field of ['legacyId','eventId','eventUnix','eventDate','meetingTime','confirmedKingsSlot','slotStatus','game','route']){
      assert.deepEqual(current[field],prior[field]);
    }
    assert.equal(Boolean(current.kingsSlotImage),Boolean(prior.kingsSlotImage));
  }
  assert.equal(hasUnredactedPrivateNotes(p),false);
});
