'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectKingsFrozenLegacyCalendar}
  =require('../event-capacity-frozen-legacy-calendar-audit');
function source(){
  return JSON.parse(fs.readFileSync(path.join(__dirname,'../data/legacy-convoys.json'),'utf8'));
}
test('Frozen legacy repo file yields 115 entries, six months, 111 slot claims and zero Capacity approvals',()=>{
  const r=inspectKingsFrozenLegacyCalendar(source());
  assert.equal(r.existingFrozenLegacyEntries,115);
  assert.equal(r.existingSourceMonthChannels,6);
  assert.deepEqual(r.rows.map(x=>x.importedRecords),[24,20,24,20,21,6]);
  assert.equal(r.existingKingsSlotEvidenceClaims,111);
  assert.equal(r.preservedWithOriginalSourceMissing,1);
  assert.equal(r.retainedFromEarlierImport,1);
  assert.equal(r.totalFormallyConfirmedCapacityAcceptanceFromThisFile,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Frozen old calendar audit does not mutate original records or expose private names',()=>{
  const a=source(),before=structuredClone(a);
  const r=inspectKingsFrozenLegacyCalendar(a);
  assert.deepEqual(a,before);
  const s=JSON.stringify(r);
  assert.equal(s.includes(a.convoys[0].legacyId),false);
  assert.equal(s.includes(a.convoys[0].name),false);
  assert.equal(s.includes('discord.com/channels/'),false);
});
test('Tampered legacy import totals, source month, and duplicate legacy IDs fail closed',()=>{
  for(const mutation of [
    x=>{x.summary.confirmedSlot++;},
    x=>{x.monthStats['October 2026'].imported++;},
    x=>{x.convoys[0].sourceMonth='April 2027';},
    x=>{x.convoys[1].legacyId=x.convoys[0].legacyId;}
  ]){
    const x=source();mutation(x);
    assert.throws(()=>inspectKingsFrozenLegacyCalendar(x));
  }
});
