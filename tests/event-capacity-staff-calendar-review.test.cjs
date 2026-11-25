'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluate}=require('../event-capacity-core');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {reviewSignedHistoricalReservationHolds}
  =require('../event-capacity-historical-reservation-holds');
const {crosscheckKingsHistoricalEvidenceClaims}
  =require('../event-capacity-historical-evidence-gap-audit');
const {projectKingsStaffCalendarReview,renderKingsStaffCalendarEphemeral}
  =require('../event-capacity-staff-calendar-review');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function item(id,type,day,status='Scheduled'){
  return {eventId:id,eventType:type,eventTypeVerified:true,
    status,statusVerified:true,departureAtUtc:day+'T18:00:00Z',
    departureVerified:true,meetingAtUtc:day+'T17:00:00Z',
    plannedEndAtUtc:day+'T20:00:00Z',
    rescheduleApproved:status==='Rescheduled'};
}
function fixture({fresh=true}={}){
  const x=setup();
  const historicalHoldsReports=['2027-03','2027-04'].map(month=>
    reviewSignedHistoricalReservationHolds({
      journal:x.afterJournal,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
      month,nowMs:NOW
    }));
  const historicalEvidenceReport=crosscheckKingsHistoricalEvidenceClaims({
    firstMonth:'2025-06',sourceRecords:[{
      ref:'event:100',sourceKind:'current',sourceStatus:'Rescheduled',
      category:'Partner Convoy',departureAtUtc:'2027-04-20T18:00:00.000Z',
      sourceDigest:sha('synthetic private bytes'),
      evidenceDigests:[sha('e0'),sha('e1')]
    }],journal:x.afterJournal,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,
    reviewSecret:'synthetic secret used only in offline tests',
    nowMs:NOW
  });
  const capacity=evaluate([
    item('100','Partner Convoy','2027-04-20','Rescheduled'),
    item('kings','Kings Convoy','2027-04-20')
  ],{dataFresh:fresh});
  return {capacity,year:'2027',selectedMonth:'2027-04',
    historicalHoldsReports,historicalEvidenceReport};
}
const build=overrides=>projectKingsStaffCalendarReview({
  ...fixture(),...overrides
});
test('One private 12-month year overview and selected April calendar are projected',()=>{
  const r=build();
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.readOnly,true);
  assert.equal(r.year,'2027');
  assert.equal(r.months.length,12);
  assert.deepEqual(r.months.map(x=>x.month),[
    '2027-01','2027-02','2027-03','2027-04','2027-05','2027-06',
    '2027-07','2027-08','2027-09','2027-10','2027-11','2027-12'
  ]);
  assert.equal(r.days.length,30);
  assert.equal(r.policy.weekdayCombined,3);
  assert.equal(r.policy.weekendCombined,5);
  assert.equal(r.policy.partnerDaily,2);
  assert.equal(r.policy.externalDaily,2);
  assert.equal(r.policy.partnerMonthly,null);
  assert.equal(r.policy.externalMonthly,null);
  assert.equal(r.policy.kingsConvoysQuotaExempt,true);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
});
test('Snapshot Partner 1 and the same signed Partner historical hold 1 are not added together',()=>{
  const r=build(),april=r.months[3],day=r.days.find(x=>x.utcDate==='2027-04-20');
  assert.equal(april.currentSnapshot.partner,1);
  assert.equal(april.signedHistoricalProvisional.partner,1);
  assert.equal(day.snapshotCombined,1);
  assert.equal(day.historicalCombinedProvisional,1);
  assert.equal(day.knownCurrentAndHistoricalCountsNotAdditive,true);
  assert.equal(r.currentAndHistoricalCountsNeverAddedTogether,true);
  assert.equal(day.remainingSlots,null);
  assert.equal(day.canApprove,false);
  assert.equal(day.status,'Historical Hold — Human Review');
  assert.equal(r.actualAvailableSlotsDisplayed,false);
});
test('March acceptance is visible separately from April reschedule without freeing either date',()=>{
  const r=build(),march=r.months[2];
  assert.equal(march.currentSnapshot.partner,0);
  assert.equal(march.signedHistoricalProvisional.partner,1);
  assert.equal(march.remainingPartnerSlots,null);
  assert.equal(r.months[3].signedHistoricalProvisional.partner,1);
  assert.equal(r.months[3].sourceCompletenessAuthenticated,false);
});
test('Days with no observed current booking never display Available or certified Remaining',()=>{
  const r=build();
  const day=r.days.find(x=>x.utcDate==='2027-04-02');
  assert.equal(day.status,'No Verified Booking Evidence — Not Available For Approval');
  assert.equal(day.snapshotCombined,0);
  assert.equal(day.historicalCombinedProvisional,null);
  assert.equal(day.remainingSlots,null);
  assert.equal(day.freeSlotsCertified,false);
  const rendered=JSON.stringify(renderKingsStaffCalendarEphemeral(r));
  assert.equal(rendered.includes('Available 2'),false);
  assert.match(rendered,/No available slots are certified/);
});
test('Even an allegedly fresh adapter does not override missing original history',()=>{
  const r=build();
  assert.equal(r.sourceSnapshotReportedFresh,true);
  assert.equal(r.sourceAuthenticityIndependentlyProven,false);
  assert.equal(r.complete24MonthHistoryCertified,false);
  assert.equal(r.monthsWithoutSignedHoldReport,10);
  assert.equal(r.monthsOutside24MonthEvidenceReview,7);
});
test('Stale current snapshot cannot make signed historical holds disappear',()=>{
  const f=fixture({fresh:false});
  const r=projectKingsStaffCalendarReview(f);
  assert.equal(r.sourceSnapshotReportedFresh,false);
  assert.equal(r.days.find(x=>x.utcDate==='2027-04-20').historicalCombinedProvisional,1);
  assert.equal(r.freeSlotsCertified,false);
});
test('Monthly view absent creates explicit unknown historical hold and evidence state',()=>{
  const f=fixture();
  f.historicalHoldsReports=[];
  f.historicalEvidenceReport=null;
  const r=projectKingsStaffCalendarReview(f);
  assert.equal(r.monthsWithoutSignedHoldReport,12);
  assert.equal(r.monthsOutside24MonthEvidenceReview,12);
  assert.match(r.months[3].monthStatus,/Historical Holds Missing/);
  assert.equal(r.days.find(x=>x.utcDate==='2027-04-20').historicalCombinedProvisional,null);
  assert.equal(r.days.find(x=>x.utcDate==='2027-04-20').status,
    'Current Snapshot Claim — History Unverified');
});
test('Four current Tuesday source claims exceed the 3/day review threshold',()=>{
  const f=fixture();
  f.capacity=evaluate([
    item('100','Partner Convoy','2027-04-20','Rescheduled'),
    item('other','External Convoy','2027-04-20'),
    item('another','External Convoy','2027-04-20'),
    item('fourth','Partner Convoy','2027-04-20')
  ],{dataFresh:true});
  const r=projectKingsStaffCalendarReview(f);
  const day=r.days.find(x=>x.utcDate==='2027-04-20');
  assert.equal(day.snapshotCombined,4);
  assert.equal(day.status,'Daily Quota Conflict — Human Review');
  assert.equal(day.canApprove,false);
});
test('Historic 20/month source totals are informational, not a current monthly limit',()=>{
  const f=fixture();const items=Array.from({length:21},(_,i)=>
    item('p'+i,'Partner Convoy','2027-04-'+String(i+1).padStart(2,'0')));
  f.capacity=evaluate(items,{dataFresh:true});
  const r=projectKingsStaffCalendarReview(f),month=r.months[3];
  assert.equal(month.currentSnapshot.partner,21);
  assert.equal(month.currentSnapshot.external,0);
  assert.notEqual(month.monthStatus,'Monthly Quota Conflict — Human Review');
  assert.equal(month.monthlyPartnerLimit,null);
  assert.equal(month.monthlyExternalLimit,null);
  assert.equal(month.remainingPartnerSlots,null);
  assert.equal(month.remainingExternalSlots,null);
});
test('Plain year selection yields exactly twelve month summaries and no daily data',()=>{
  const f=fixture();f.selectedMonth=null;
  const r=projectKingsStaffCalendarReview(f);
  assert.equal(r.days.length,0);
  const rendered=renderKingsStaffCalendarEphemeral(r);
  assert.equal(rendered.data.embeds.length,1);
  assert.equal(rendered.data.embeds[0].description.split('\n').length,12);
});
test('February 2028 UTC leap day and year transitions retain correct month lengths',()=>{
  const f=fixture();
  f.year='2028';f.selectedMonth='2028-02';
  f.historicalHoldsReports=[];f.historicalEvidenceReport=null;
  const r=projectKingsStaffCalendarReview(f);
  assert.equal(r.days.length,29);
  assert.equal(r.days.at(-1).utcDate,'2028-02-29');
  assert.equal(r.months[0].month,'2028-01');
  assert.equal(r.months.at(-1).month,'2028-12');
  assert.equal(renderKingsStaffCalendarEphemeral(r).data.embeds.length,2);
});
test('Cross-year hold reports and duplicate or forged historical claims fail closed',()=>{
  const f=fixture();
  assert.throws(()=>build({historicalHoldsReports:[
    f.historicalHoldsReports[0],f.historicalHoldsReports[0]
  ]}));
  assert.throws(()=>build({year:'2028'}));
  assert.throws(()=>build({historicalHoldsReports:[{
    ...f.historicalHoldsReports[1],safeToActivate:true
  }]}));
  assert.throws(()=>build({historicalHoldsReports:[{
    ...f.historicalHoldsReports[1],
    original24MonthSourceInventoryComplete:true
  }]}));
});
test('Forged historical hold counts and duplicate days cannot be hidden in a green monthly view',()=>{
  const f=fixture(),h=f.historicalHoldsReports[1];
  for(const changes of [
    {provisionalCounts:{...h.provisionalCounts,
      totalProvisionalDailyHolds:0}},
    {days:[...h.days,...h.days]},
    {days:[{...h.days[0],combinedProvisionalHolds:2}]},
    {monthOverStandardPartnerLimit:true}
  ])assert.throws(()=>build({historicalHoldsReports:[{
    ...h,...changes
  }]}));
});
test('Malicious or malformed policy, calendar selection and evidence source fail closed',()=>{
  const f=fixture();
  assert.throws(()=>build({year:'<script>'}));
  assert.throws(()=>build({selectedMonth:'2027-13'}));
  assert.throws(()=>build({selectedMonth:'2028-04'}));
  assert.throws(()=>build({capacity:{...f.capacity,limits:{
    ...f.capacity.limits,combinedDaily:3
  }}}));
  assert.throws(()=>build({historicalEvidenceReport:{
    ...f.historicalEvidenceReport,freeSlotsCertified:true
  }}));
});
test('Private Discord preview is ephemeral, no mentions or private Event identities',()=>{
  const r=build(),message=renderKingsStaffCalendarEphemeral(r);
  assert.equal(message.type,4);
  assert.equal(message.data.flags,64);
  assert.deepEqual(message.data.allowed_mentions,{parse:[]});
  assert.equal(message.data.embeds.length,2);
  assert.equal(message.data.embeds[0].color,0x182DFF);
  assert.ok(message.data.embeds[0].description.length<4096);
  assert.ok(message.data.embeds[1].description.length<4096);
  const serialized=JSON.stringify(message);
  for(const excluded of ['event:100','Partner Convoy','PRIVATE KEY',
    'DISCORD_BOT_TOKEN','@everyone','test-secret'])
    assert.equal(serialized.includes(excluded),false);
  assert.match(serialized,/REVIEW ONLY/);
});
test('Rendered calendar never accepts forged free-slot summary or unsafe day content',()=>{
  const r=build();
  assert.throws(()=>renderKingsStaffCalendarEphemeral({
    ...r,freeSlotsCertified:true
  }));
  assert.throws(()=>renderKingsStaffCalendarEphemeral({
    ...r,days:[{...r.days[0],canApprove:true},...r.days.slice(1)]
  }));
  assert.throws(()=>renderKingsStaffCalendarEphemeral({
    ...r,days:[{...r.days[0],remainingSlots:2},...r.days.slice(1)]
  }));
});

test('Mixed signed journal revisions are rejected before yearly evidence can be compared',()=>{
  const f=fixture();
  assert.throws(()=>projectKingsStaffCalendarReview({
    ...f,historicalHoldsReports:[
      f.historicalHoldsReports[0],
      {...f.historicalHoldsReports[1],
        signedHistoricalRevision:f.historicalHoldsReports[1].signedHistoricalRevision+1}
    ]
  }));
  const r=projectKingsStaffCalendarReview(f);
  assert.equal(r.signedHoldReportsShareOneJournalRevision,true);
  assert.equal(r.historicalHoldJournalRevision,2);
});
test('Signed historical holds exceeding the current snapshot are review hints, not available capacity',()=>{
  const r=build(),march=r.months[2];
  assert.equal(march.historicalHoldCountExceedsCurrentSnapshot,true);
  assert.equal(r.months[3].historicalHoldCountExceedsCurrentSnapshot,false);
  const marchDaily=projectKingsStaffCalendarReview({
    ...fixture(),selectedMonth:'2027-03'
  }).days.find(x=>x.utcDate==='2027-03-20');
  assert.equal(marchDaily.historicalHoldsExceedCurrentSnapshot,true);
  assert.equal(marchDaily.status,'Historical Hold — Human Review');
  assert.equal(marchDaily.remainingSlots,null);
});
test('Forged monthly source totals inconsistent with daily counts are rejected',()=>{
  const f=fixture(),m=f.capacity.months['2027-04'];
  const patched={...f.capacity,months:{
    ...f.capacity.months,'2027-04':{...m,partner:0}
  }};
  assert.throws(()=>projectKingsStaffCalendarReview({...f,capacity:patched}));
  const patched2={...f.capacity,months:{
    ...f.capacity.months,'2027-04':{...m,kings:2}
  }};
  assert.throws(()=>projectKingsStaffCalendarReview({...f,capacity:patched2}));
});
test('Forged day counts and impossible calendar dates are rejected before presentation',()=>{
  const f=fixture();
  const selected=f.capacity.days['2027-04-20'];
  assert.throws(()=>projectKingsStaffCalendarReview({
    ...f,capacity:{...f.capacity,days:{...f.capacity.days,
      '2027-04-20':{...selected,combined:99}}}
  }));
  assert.throws(()=>projectKingsStaffCalendarReview({
    ...f,capacity:{...f.capacity,days:{...f.capacity.days,
      '2027-02-30':{...selected}}}
  }));
});

test('Forged 24-month evidence intervals cannot fill missing history months',()=>{
  const f=fixture(),e=f.historicalEvidenceReport;
  const make=changes=>projectKingsStaffCalendarReview({
    ...f,historicalEvidenceReport:{...e,...changes}
  });
  assert.throws(()=>make({firstMonth:'2025-07'}));
  assert.throws(()=>make({finalMonth:'2027-06'}));
  assert.throws(()=>make({months:[...e.months.slice(1),e.months[0]]}));
  assert.throws(()=>make({months:[
    ...e.months.slice(0,3),{...e.months[3],month:'2025-12'},
    ...e.months.slice(4)
  ]}));
  const valid=projectKingsStaffCalendarReview(f);
  assert.equal(valid.monthsOutside24MonthEvidenceReview,7);
  assert.equal(valid.safeToActivate,false);
});
