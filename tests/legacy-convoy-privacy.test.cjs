'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {encryptLegacyArchive,decryptLegacyArchive,sanitizeLegacyPublicArchive,hasUnredactedPrivateNotes,publicLegacyId,assertPublicLegacyArchiveSafe}=require('../legacy-convoy-privacy');
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
  assert.deepEqual(p.convoys[0].kingsSlotImage,{available:true});
  assert.equal(p.convoys[0].sourceThreadId,undefined);
  assert.equal(p.convoys[0].sourceMonthChannelId,undefined);
  assert.equal(p.convoys[0].kingsSlotImages.length,0);
  assert.match(p.convoys[0].legacyId,/^legacy-public-v2-[0-9a-f]{24}$/);
  assert.equal(assertPublicLegacyArchiveSafe(p),true);
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
    for(const field of ['eventId','eventUnix','eventDate','meetingTime','confirmedKingsSlot','slotStatus','game','route']){
      assert.deepEqual(current[field],prior[field]);
    }
    assert.equal(current.legacyId,publicLegacyId(prior));
    assert.equal(Boolean(current.kingsSlotImage),Boolean(prior.kingsSlotImage));
  }
  assert.equal(hasUnredactedPrivateNotes(p),false);
});

test('public Legacy archive keeps only operational event facts, not Discord person, forum, image or message metadata',()=>{
  const privateSource={...original,monthChannels:[{label:'October 2026',year:2026,month:10,channelId:'1114967437788577792'}],
    monthStats:{'October 2026':{channelId:'1114967437788577792',threads:1,imported:1,pastSkipped:0}},
    convoys:[{...original.convoys[0],
      legacyId:'old-calendar:1114967437788577792',
      sourceThreadId:'1114967437788577792',
      sourceThreadName:'Private company planning text <@935991067969470485>',
      sourceMonthChannelId:'1114967437788577792',
      sourceMonth:'October 2026',
      eventId:'36859',
      eventUrl:'https://discord.com/channels/1114967437788577792/1114967437788577792',
      truckersmp:{id:36859,name:'Public event name',server:'Simulation 1'},
      kingsSlotImage:{...original.convoys[0].kingsSlotImage,
        messageId:'1114967437788577792',attachmentId:'1114967437788577792',
        messageUrl:'https://discord.com/channels/1114967437788577792/1114967437788577792'},
      sourceNotes:[{text:'Sensitive private planning <@935991067969470485>'}]
    }]
  };
  const clean=sanitizeLegacyPublicArchive(privateSource);
  assert.equal(clean.convoys.length,1);
  assert.equal(clean.convoys[0].eventId,'36859');
  assert.equal(clean.convoys[0].eventDate,'2027-01-01');
  assert.equal(clean.convoys[0].confirmedKingsSlot,true);
  assert.equal(clean.convoys[0].name,'Public event name');
  assert.equal(clean.convoys[0].eventUrl,'https://truckersmp.com/events/36859');
  assert.equal(clean.monthChannels[0].channelId,undefined);
  assert.equal(clean.monthStats['October 2026'].channelId,undefined);
  assert.doesNotMatch(JSON.stringify(clean),/935991067969470485|1114967437788577792|discord\.com|PRIVATE_|<@/);
  assert.equal(assertPublicLegacyArchiveSafe(clean),true);
  assert.equal(publicLegacyId(privateSource.convoys[0]),clean.convoys[0].legacyId);
  assert.deepEqual(sanitizeLegacyPublicArchive(clean),clean,'the public projection remains stable when sanitized again');
});
test('public Legacy privacy gate rejects metadata and old plaintext importer footprints',()=>{
  const cleaned=sanitizeLegacyPublicArchive(original);
  for(const mutation of [
    s=>{s.convoys[0].sourceThreadId='1114967437788577792'},
    s=>{s.convoys[0].kingsSlotImage.messageUrl='https://discord.com/channels/1114967437788577792/1114967437788577792'},
    s=>{s.convoys[0].sourceNotes=[{text:'private human message'}]},
    s=>{s.convoys[0].slotEvidence=[{text:'private event discussion'}]},
    s=>{s.convoys[0].legacyId='old-calendar:1114967437788577792'},
    s=>{s.monthChannels=[{channelId:'1114967437788577792'}]}
  ]){
    const modified=JSON.parse(JSON.stringify(cleaned));
    mutation(modified);
    assert.throws(()=>assertPublicLegacyArchiveSafe(modified),/Public Legacy archive/);
  }
});
test('private original can be decrypted while redacted public copy cannot reconstruct any source metadata',()=>{
  const source={...original,convoys:[{...original.convoys[0],
   legacyId:'old-calendar:1114967437788577792',
   sourceThreadId:'1114967437788577792',
   kingsSlotImage:{messageId:'1114967437788577793',attachmentId:'1114967437788577794',
    capturedUrl:'https://cdn.discordapp.com/attachments/1/2/img.png',
    accompanyingText:'PRIVATE_ATTACHMENT_TEST_TOKEN'}
  }]};
  const sealed=encryptLegacyArchive(source,key);
  const projection=sanitizeLegacyPublicArchive(source);
  assert.ok(sealed.encrypted);
  assert.equal(JSON.stringify(projection).includes('PRIVATE_ATTACHMENT_TEST_TOKEN'),false);
  assert.equal(projection.convoys[0].sourceThreadId,undefined);
  assert.equal(decryptLegacyArchive(sealed,key).convoys[0].sourceThreadId,'1114967437788577792');
});
