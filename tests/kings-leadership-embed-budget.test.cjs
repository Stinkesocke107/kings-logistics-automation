'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fitEventEmbed,lengthOf,MAX_EMBED,PROTECTED}
  =require('../kings-leadership-embed-budget');

function event(fields){
  return {title:'📅 Kings Event Leadership Dashboard',
    description:'Private Event Dashboard; original approvals NOT verified.',
    color:0x182dff,
    footer:{text:'Kings Logistics • Event Leadership • Internal operations'},
    fields:fields.map(([name,value])=>({name,value,inline:false}))};
}
const long='Unresolved source warning, no original Staff acceptance. '.repeat(12);
function big(){
  return event([
    ['🔵 Live Overview',long],
    ['🎯 Next Staff Step',long],
    ['📝 Event Operations — Manual Staff Progress','REAL_VERIFIED_ONLY_JOURNAL: '+long],
    ['🔐 Event Operations — Private Review Codes','KR123456789abcdef123456789 start; private selection '+long],
    ['💬 Event Operations — Discord Staff Commands',long],
    ['⏱️ Event Operations — Review Order',long],
    ['🟣 Last Completed Week',long],
    ['👑 Last Completed Month',long],
    ['🗓️ Calendar / History — Source Review',long],
    ['📊 Event Capacity — Advisory Review',long],
    ['🧾 Event History — Decision Evidence Review',long],
    ['🗂️ Event History — Priority Months',long],
    ['✉️ Invitation Tracker — Source Review','INVITATION_SOURCE_CLAIMS_UNVERIFIED '+long]
  ]);
}
test('Event embeds already below budget stay byte-for-byte unchanged',()=>{
  const e=event([['📝 Event Operations — Manual Staff Progress','Staff review pending'],
    ['✉️ Invitation Tracker — Source Review','Original responses unavailable']]);
  const fit=fitEventEmbed(e);
  assert.equal(JSON.stringify(fit),JSON.stringify(e));
  assert.equal(lengthOf(fit)<MAX_EMBED,true);
  assert.notEqual(fit,e);
});
test('Oversize private Event embed condenses secondary fields, NEVER protected review, codes, or invitation evidence',()=>{
  const e=big();
  assert.ok(lengthOf(e)>MAX_EMBED);
  const before=JSON.stringify(e);
  const reduced=fitEventEmbed(e);
  assert.ok(lengthOf(reduced)<=MAX_EMBED);
  assert.equal(JSON.stringify(e),before,'Source must not be mutated');
  for(const name of PROTECTED){
    assert.equal(reduced.fields.find(f=>f.name===name).value,
      e.fields.find(f=>f.name===name).value,name);
  }
  assert.match(reduced.fields.find(f=>f.name==='📊 Event Capacity — Advisory Review').value,
    /No booking|advisory|Advisory/i);
  assert.match(reduced.fields.find(f=>f.name==='🧾 Event History — Decision Evidence Review').value,
    /NOT|unverified/i);
  assert.equal(reduced.fields.length,e.fields.length);
});
test('An oversize protected original evidence field always fails instead of cutting original review details',()=>{
  const e=big();
  const item=e.fields.find(f=>f.name==='📝 Event Operations — Manual Staff Progress');
  item.value='real-source-protected '.repeat(70);
  assert.throws(()=>fitEventEmbed(e),/budget unverified/);
});
test('Huge secondary worklist automatically condenses, but oversized unknown data fails',()=>{
  const a=event([['⏱️ Event Operations — Review Order','unverified '.repeat(120)]]);
  const reduced=fitEventEmbed(a);
  assert.ok(lengthOf(reduced)<MAX_EMBED);
  assert.match(reduced.fields[0].value,/BLOCKED source/);
  const b=event([['Unrecognized private field','unverified '.repeat(120)]]);
  assert.throws(()=>fitEventEmbed(b),/budget unverified/);
});
test('Discord field and title hard limits are applied even for otherwise small payloads',()=>{
  const a=event(Array.from({length:26},(_,i)=>['Item '+i,'Unverified']));
  assert.throws(()=>fitEventEmbed(a),/budget unverified/);
  const b=event([['X'.repeat(257),'Valid']]);
  assert.throws(()=>fitEventEmbed(b),/budget unverified/);
  const c=event([['Field','Valid']]);
  c.description='Y'.repeat(4097);
  assert.throws(()=>fitEventEmbed(c),/budget unverified/);
});
test('Existing Event publisher calls budget guard without modifying other dashboards',()=>{
  const file=fs.readFileSync(path.join(__dirname,'../leadership-dashboard.js'),'utf8');
  const start=file.indexOf('function buildEvent(');
  const finish=file.indexOf('function buildManagement(',start);
  assert.ok(start>0&&finish>start);
  const body=file.slice(start,finish);
  assert.match(file,/require\('\.\/kings-leadership-embed-budget'\)/);
  assert.match(body,/return fitEventEmbed\(\{/);
  assert.match(body,/Invitation Tracker — Source Review/);
  assert.match(body,/Manual Staff Progress/);
  assert.match(body,/Private Review Codes/);
});
