'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {detailProjection,sanitizeDiscord,dateValid}=require('../event-capacity-day-view');
const GUILD='1114967437788577792';
const THREAD='1550619824005062697';
function entry(id,type='Partner Convoy',date='2027-03-20',status='Scheduled',extra={}){
  return {
    eventId:String(id),threadId:THREAD,
    eventType:type,eventTypeVerified:true,status,statusVerified:true,
    departureAtUtc:date+'T16:00:00Z',departureVerified:true,
    meetingAtUtc:date+'T15:00:00Z',plannedEndAtUtc:date+'T19:00:00Z',
    ...extra
  };
}
function project(items,day='2027-03-20',options={}){
  const fresh=options.dataFresh!==false;
  const capacity=evaluate(items,{dataFresh:fresh});
  return detailProjection({events:items,dataFresh:fresh},capacity,day,{
    guildId:GUILD,page:options.page||1
  });
}
test('Private detail reports source counts with Saturday 5/day limit, no free booking',()=>{
  const view=project([
    entry('a','Partner Convoy'),
    entry('b','External Convoy'),
    entry('c','Kings Convoy')
  ]);
  assert.equal(view.visibility,'PRIVATE_ONLY');
  assert.equal(view.readOnly,true);
  assert.equal(view.capacityVerified,false);
  assert.equal(view.sourceVerified,true);
  assert.equal(view.baseLimit,5);
  assert.equal(view.combinedUsed,2);
  assert.equal(view.remaining,null);
  assert.equal(view.total,3);
  assert.deepEqual(view.items.map(i=>i.type).sort(),['Kings','Official Partner','Other External']);
  assert.ok(view.items.every(i=>i.state==='Accepted'));
});
test('Pending convoys are shown but do not occupy confirmed capacity',()=>{
  const view=project([
    entry('one','Partner Convoy'),
    entry('two','External Convoy','2027-03-20','Submitted',{
      departureVerified:false
    })
  ]);
  assert.equal(view.combinedUsed,1);
  assert.equal(view.remaining,null);
  assert.equal(view.total,2);
  assert.equal(view.items.find(x=>x.state==='Pending').counted,false);
  assert.equal(view.items.find(x=>x.state==='Pending').departureUnix,null);
});
test('Cancelled convoy is listed historically but never counted',()=>{
  const view=project([entry('a','Partner Convoy','2027-03-20','Cancelled')]);
  assert.equal(view.combinedUsed,0);
  assert.equal(view.items[0].state,'Cancelled');
  assert.equal(view.items[0].counted,false);
});
test('Unverified end time blocks free availability even though Accepted counts',()=>{
  const event=entry('a','Partner Convoy','2027-03-20','Scheduled',{plannedEndAtUtc:null});
  const view=project([event]);
  assert.equal(view.capacityVerified,false);
  assert.equal(view.remaining,null);
  assert.equal(view.combinedUsed,1);
  assert.ok(view.items[0].warnings.includes('End Time Unknown'));
  assert.match(sanitizeDiscord(view).data.content,/Availability unverified/);
});
test('Stale adapter cannot assert free slots even with stale capacity claiming fresh',()=>{
  const capacity=evaluate([],{dataFresh:true});
  const view=detailProjection({events:[],dataFresh:false},capacity,'2027-03-20',{guildId:GUILD});
  assert.equal(view.sourceVerified,false);
  assert.equal(view.capacityVerified,false);
  assert.equal(view.remaining,null);
  assert.equal(view.partnerAvailableVerified,false);
  assert.equal(view.externalAvailableVerified,false);
});
test('Two genuinely conflicting rows with the same Event ID show Data Conflict only once',()=>{
  const a=entry('same','Partner Convoy'),b=entry('same','External Convoy');
  const view=project([a,b]);
  assert.equal(view.total,1);
  assert.equal(view.items[0].state,'Data Conflict');
  assert.equal(view.items[0].counted,false);
  assert.equal(view.capacityVerified,false);
  assert.equal(view.combinedUsed,0);
});
test('Identical duplicate event IDs do not produce duplicate list entries',()=>{
  const a=entry('same');
  const view=project([a,{...a}]);
  assert.equal(view.total,1);
  assert.equal(view.items[0].state,'Accepted');
  assert.equal(view.combinedUsed,1);
});
test('A pending event with uncertain date is not misleadingly assigned to arbitrary UTC days',()=>{
  const item=entry('pending','Partner Convoy','2027-03-20','Submitted',{
    departureAtUtc:null,possibleUtcDate:null,departureVerified:false
  });
  const view=project([item]);
  assert.equal(view.total,0);
  assert.equal(view.unplacedSourceRecords,1);
  assert.match(sanitizeDiscord(view).data.content,/no reliable UTC date/);
});
test('An unverified possible date is visible with a Needs Verification warning',()=>{
  const item=entry('u','Partner Convoy','2027-03-20','Scheduled',{
    departureAtUtc:null,possibleUtcDate:'2027-03-20',departureVerified:false
  });
  const view=project([item]);
  assert.equal(view.total,1);
  assert.equal(view.items[0].state,'Needs Verification');
  assert.equal(view.remaining,null);
});
test('Strict UTC day selection validates calendar and timezone offsets',()=>{
  assert.equal(dateValid('2028-02-29'),true);
  assert.equal(dateValid('2027-02-29'),false);
  assert.equal(dateValid('2027-03-32'),false);
  assert.equal(dateValid('2027-3-20'),false);
  assert.throws(()=>project([], '2027-02-29'));
  const item=entry('a','Partner Convoy','2027-04-01','Scheduled',{
    departureAtUtc:'2027-04-01T00:15:00+02:00',
    meetingAtUtc:'2027-03-31T21:00:00Z',
    plannedEndAtUtc:'2027-04-01T00:00:00Z'
  });
  const previousDay=project([item],'2027-03-31');
  assert.equal(previousDay.combinedUsed,1);
  assert.equal(previousDay.items[0].departureUnix,Date.parse('2027-03-31T22:15:00Z')/1000);
});
test('Forum URL is emitted only when trusted scope and numeric thread reference permit it',()=>{
  const accepted=project([entry('a')]);
  assert.equal(accepted.items[0].link,'https://discord.com/channels/'+GUILD+'/'+THREAD);
  const invalid=project([entry('a','Partner Convoy','2027-03-20','Scheduled',{threadId:'<@everyone>'})]);
  assert.equal(invalid.items[0].link,null);
  const response=sanitizeDiscord(invalid);
  assert.equal(response.data.allowed_mentions.parse.length,0);
  assert.equal(response.data.content.includes('<@everyone>'),false);
});
test('Paginate to 10 rows without duplicating events; out-of-range pages are refused',()=>{
  const items=Array.from({length:13},(_,i)=>entry('a'+i));
  const first=project(items);
  const second=project(items,'2027-03-20',{page:2});
  assert.equal(first.items.length,10);
  assert.equal(first.pages,2);
  assert.equal(second.items.length,3);
  assert.equal(second.page,2);
  assert.throws(()=>project(items,'2027-03-20',{page:3}));
});
test('Rendered day detail is ephemeral and excludes untrusted names and raw Event IDs',()=>{
  const item=entry('private123','Partner Convoy','2027-03-20','Completed',{
    name:'@everyone private organizer name',responsibleStaff:'secret'
  });
  const result=sanitizeDiscord(project([item]));
  assert.equal(result.type,4);
  assert.equal(result.data.flags,64);
  assert.equal(result.data.allowed_mentions.parse.length,0);
  assert.equal(result.data.content.includes('private123'),false);
  assert.equal(result.data.content.includes('secret'),false);
  assert.equal(result.data.content.includes('@everyone'),false);
  assert.match(result.data.content,/not proof of event participation/);
  assert.match(JSON.stringify(result.data.embeds),/Planning Completed/);
});
test('Private detail refuses invalid scope, page size and malformed sources',()=>{
  const c=evaluate([],{dataFresh:true});
  const a={events:[],dataFresh:true};
  assert.throws(()=>detailProjection(a,c,'2027-03-20',{guildId:'x'}));
  assert.throws(()=>detailProjection(a,c,'2027-03-20',{guildId:GUILD,page:0}));
  assert.throws(()=>detailProjection(a,c,'2027-03-20',{guildId:GUILD,pageSize:100}));
  assert.throws(()=>detailProjection({events:null,dataFresh:true},c,'2027-03-20',{guildId:GUILD}));
  assert.throws(()=>sanitizeDiscord({visibility:'PUBLIC_ONLY',items:[]}));
});

test('Ten detailed records fit Discord message limits with separate private embed fields',()=>{
  const items=Array.from({length:10},(_,i)=>entry('event-'+i,'Partner Convoy'));
  const response=sanitizeDiscord(project(items));
  assert.equal(response.data.embeds.length,1);
  assert.equal(response.data.embeds[0].fields.length,10);
  assert.ok(response.data.content.length<=2000);
  for(const field of response.data.embeds[0].fields){
    assert.ok(field.name.length<=256);
    assert.ok(field.value.length<=1024);
  }
});

test('Forged status and warning codes are not copied into private Discord output',()=>{
  const bad=entry('malicious','Partner Convoy','2027-03-20','@everyone fake-confirmed',{
    statusVerified:true
  });
  const events=[bad];
  const capacity=evaluate(events,{dataFresh:true});
  capacity.warnings.push({
    code:'<@everyone> fake alert',
    first:'event:malicious',
    second:'event:malicious'
  });
  const view=detailProjection({events,dataFresh:true},capacity,'2027-03-20',{guildId:GUILD});
  const response=sanitizeDiscord(view);
  assert.equal(view.items[0].state,'Needs Verification');
  assert.equal(view.items[0].status,'Status Unverified');
  assert.equal(JSON.stringify(response).includes('@everyone'),false);
  assert.equal(JSON.stringify(response).includes('fake alert'),false);
});
