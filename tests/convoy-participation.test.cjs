'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { confirmedKingsConvoysForPeriod, eventDateInMonth } = require('../convoy-participation');

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
