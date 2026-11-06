'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { confirmedKingsConvoysForPeriod, attendedRegisteredConvoysForPeriod, eventDateInMonth } = require('../convoy-participation');

const october = {
  start: new Date('2026-10-01T00:00:00.000Z'),
  end: new Date('2026-11-01T00:00:00.000Z')
};
function overview(records, errors=0) {
  return { generatedAt:'2026-11-01T20:30:00Z', guildId:'1114967437788577792',
    overall:{convoyReadErrors:errors}, countedConvoys:records };
}
function counted(records) {
  return confirmedKingsConvoysForPeriod(overview(records),october);
}
const e = (id, date, confirmed=true) => ({
  eventId:String(id),threadId:String(id+1000),eventDate:date,
  confirmedKingsSlot:confirmed,legacy:true,status:'Legacy Past'
});

test('Counts every confirmed Kings slot in October, including Legacy Past, without needing Completed',()=>{
  const legacy = Array.from({length:25},(_,i)=>e(i+1,'2026-10-'+String(i+1).padStart(2,'0'),i!==17));
  const modern = [
    e(101,'2026-10-20'),
    e(102,'2026-10-30'),
    {...e(103,'2026-10-31'),status:'Completed'},
    // Original has staff-confirmed Completed, confirmed Kings slot, but
    // the 10 October Discord thread has missing structured Event Date.
    {eventId:'104',threadId:'1558158179131588730',name:'10. October - - THE ORIGINAL™ -',
     eventDate:null,status:'Completed',confirmedKingsSlot:true,legacy:false}
  ];
  const r=counted([...legacy,...modern,e(200,'2026-11-01'),e(201,'2026-09-30')]);
  assert.equal(r.count,28);
  assert.equal(r.source,'confirmed-kings-slot');
  assert.equal(r.undatedConfirmed,0);
  assert.equal(r.recordIds.length,28);
});

test('Same TruckersMP event ID is counted once; new Center registration replaces frozen Legacy',()=>{
  const old=e(35252,'2026-10-18');
  const newer={...old,threadId:'999',legacy:false,status:'Completed'};
  assert.equal(counted([old,newer]).count,1);
  assert.equal(counted([newer,old]).count,1);
});

test('Rejects unconfirmed slots, missing dates without strict proof, broken overviews',()=>{
  assert.equal(counted([e(1,'2026-10-01',false)]).count,0);
  const unknown={eventId:'1',threadId:'123456',name:'10. October - unknown',
    status:'Needs Information',confirmedKingsSlot:true,eventDate:null};
  const r=counted([unknown]);
  assert.equal(r.count,0);
  assert.equal(r.undatedConfirmed,1);
  assert.throws(()=>confirmedKingsConvoysForPeriod(overview([e(1,'2026-10-01')],1),october),
    /read errors/);
  assert.throws(()=>confirmedKingsConvoysForPeriod({},october),/required/);
  assert.throws(()=>counted([{confirmedKingsSlot:true,eventDate:'2026-10-02'}]),/no dedupe identity/);
});

test('Thread-date fallback cannot invent year for an unrelated past/future thread',()=>{
  const src={eventId:'104',threadId:'1558158179131588730',name:'10. October - THE ORIGINAL',
    status:'Completed',confirmedKingsSlot:true};
  assert.equal(eventDateInMonth(src,october).toISOString().slice(0,10),'2026-10-10');
  const nextYear={start:new Date('2027-10-01T00:00:00Z'),end:new Date('2027-11-01T00:00:00Z')};
  assert.equal(eventDateInMonth(src,nextYear),null);
  assert.equal(eventDateInMonth({...src,status:'Scheduled'},october),null);
  assert.equal(eventDateInMonth({...src,name:'31. February - invalid'},october),null);
});


const reportNow = new Date('2026-11-03T02:00:00Z');
function registered(records, now=reportNow, errors=0) {
  const source=overview([],errors);
  source.registeredConvoys=records;
  return attendedRegisteredConvoysForPeriod(source,october,now);
}

test('Monthly report counts all held Kings-registered convoys, including unconfirmed Kings parking',()=>{
  const legacy=Array.from({length:25},(_,i)=>({
    ...e(i+1,'2026-10-'+String(i+1).padStart(2,'0'),i!==17),
    source:'legacy-calendar'
  }));
  const modern=[
    {...e(101,'2026-10-20'),source:'convoy-center',legacy:false,status:'Scheduled'},
    {...e(102,'2026-10-30'),source:'convoy-center',legacy:false,status:'Completed'},
    {...e(103,'2026-10-31'),source:'convoy-center',legacy:false,status:'Completed'},
    {eventId:'104',threadId:'1558158179131588730',name:'10. October - THE ORIGINAL',
     eventDate:null,status:'Completed',confirmedKingsSlot:true,legacy:false,source:'convoy-center'}
  ];
  const out=registered([...legacy,...modern]);
  assert.equal(out.count,29);
  assert.equal(out.confirmedSlotCount,28);
  assert.equal(out.source,'registered-past-kings-convoys');
  assert.equal(out.recordIds.length,29);
});

test('Counts Kings Convoy Center registration without a slot or Completed tag once event took place',()=>{
  const event={...e(444,'2026-10-20',false),source:'convoy-center',legacy:false,status:'Needs Information'};
  assert.equal(registered([event]).count,1);
  assert.equal(registered([event]).confirmedSlotCount,0);
  assert.equal(registered([event],new Date('2026-10-20T12:00:00Z')).count,0);
  assert.equal(registered([event],new Date('2026-10-21T00:00:00Z')).count,1);
});

test('Registration report omits future, cancelled, unreadable, test and unlinked candidate entries',()=>{
  const records=[
    {...e(1,'2026-10-14'),source:'legacy-calendar',status:'Cancelled'},
    {...e(2,'2026-11-03'),source:'legacy-calendar',status:'Scheduled'},
    {...e(3,'2026-09-30'),source:'legacy-calendar'},
    {...e(4,'2026-10-20'),source:'convoy-center',legacy:false,status:'Needs Information',eventId:''},
    {...e(5,'2026-10-25'),source:'some-untrusted-external-system'},
    {...e(6,'invalid-date'),source:'legacy-calendar'}
  ];
  const result=registered(records);
  assert.equal(result.count,0);
  assert.equal(result.cancelledExcluded,1);
  assert.equal(result.undatedRegistered,1);
  assert.throws(()=>registered([],reportNow,1),/read errors/);
  assert.throws(()=>attendedRegisteredConvoysForPeriod(overview([]),october,reportNow),/registeredConvoys is required/);
});

test('Registration report deduplicates cross-calendar matching events and keeps platform identities separate',()=>{
  const legacy={...e(35190,'2026-10-20',true),source:'legacy-calendar'};
  const center={...legacy,threadId:'other-center-thread',source:'convoy-center',legacy:false,confirmedKingsSlot:false};
  const otherPlatform={...legacy,platformId:'haulmp',threadId:'haul-thread',confirmedKingsSlot:false};
  const result=registered([legacy,center,otherPlatform]);
  assert.equal(result.count,2);
  assert.equal(result.confirmedSlotCount,0, 'Convoy Center record supersedes older Legacy confirmation for the same event ID');
  assert.equal(result.recordIds.length,2);
});


test('October 2026 frozen Kings Calendar preserves its registered no-slot event',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/legacy-convoys.json'),'utf8'));
  const octoberEntries=legacy.convoys.filter(e=>String(e.eventDate||'').startsWith('2026-10-'));
  assert.equal(octoberEntries.length,25,'Frozen historical calendar');
  const normalized=octoberEntries.map(e=>({
    source:'legacy-calendar',legacy:true,threadId:e.sourceThreadId||e.legacyId,
    eventId:e.eventId,eventDate:e.eventDate,confirmedKingsSlot:e.confirmedKingsSlot,
    status:e.status
  }));
  const result=registered(normalized);
  assert.equal(result.count,25,'All 25 Kings October calendar registrations took place');
  assert.equal(result.confirmedSlotCount,24,'One additional registered October convoy has no confirmed slot');
});

test('Monthly Report presents total participation and confirmed-slot subset with safe in-place October edit',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const src=fs.readFileSync(path.join(__dirname,'../monthly-report-v2.js'),'utf8');
  const overview=fs.readFileSync(path.join(__dirname,'../convoy-overview.js'),'utf8');
  assert.match(src,/Convoys Participated: \*\*\$\{convoys.count\}\*\*/);
  assert.match(src,/With Confirmed Kings Slot: \*\*\$\{convoys.confirmedSlotCount\}\*\*/);
  assert.match(src,/attendedRegisteredConvoysForPeriod\(overview, period\)/);
  assert.match(src,/method: 'PATCH'/);
  assert.match(src,/Existing October report has an unknown\/duplicate convoy section/);
  assert.match(overview,/registeredConvoys/);
  assert.match(overview,/registeredConvoys\.push\(convoy\)/);
  assert.ok(overview.includes('Tracked Convoys (confirmed-slot Center + Legacy Calendar): **${overview.overall.countedConvoys}**'));
  assert.ok(overview.includes('Convoys with confirmed Kings slot: **${overview.overall.confirmedKingsSlots}**'));
});
