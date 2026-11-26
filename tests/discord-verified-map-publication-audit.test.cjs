'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {trustedVerifiedMap,verifyVerifiedMapPublication}=
  require('../discord-publication-content-audit');
const NOW=Date.parse('2026-11-27T00:30:00.000Z');
const AT=new Date(NOW-30000).toISOString();
const TS=Math.floor(Date.parse(AT)/1000);
const DISPLAYS=['Live Tracker','Advanced Statistics','Central Overview'];
const TRACKER={updatedAt:AT,members:110,online:3,ets2Online:2,atsOnline:1};
function published(label,tracker=TRACKER){
  const ets='ETS2: **'+tracker.ets2Online+'**';
  const ats='ATS: **'+tracker.atsOnline+'**';
  const stamp='Last updated <t:'+TS+':R>';
  if(label==='Live Tracker')return {embeds:[{
    title:'Live TruckersMP VTC Members Online',
    description:'See which Kings Family members are currently online.\n**'+
      tracker.online+' Kings members currently online**\n\n'+
      ets+' • '+ats+'\n'+stamp
  }]};
  if(label==='Advanced Statistics')return {embeds:[{
    title:'👑 Kings Logistics Statistics',
    fields:[
      {name:'Members',value:'**110 TruckersMP Members**\nToday: 0'},
      {name:'Current Activity',value:'**3 Currently Online**\n'+ets+' • '+ats},
      {name:'Next Milestone',value:'Milestone\n\n'+stamp}
    ]
  }]};
  if(label==='Central Overview')return {embeds:[{
    title:'👑 Kings Logistics Overview',
    fields:[
      {name:'Members',value:'**110 TruckersMP Members**\nMonthly Growth: 0'},
      {name:'Current Activity',value:'**3 Kings Members Online**\n'+ets+' • '+ats},
      {name:'Live Data',value:stamp}
    ]
  }]};
  throw Error('Unknown synthetic display');
}
test('a recovered map must be proven in all three real Discord display contracts',()=>{
  const proof={version:1,mode:'verified-live',source:'verified-map',
    checkedAt:new Date(NOW-12000).toISOString(),
    allDisplaysVerified:true,displaysVerified:DISPLAYS,
    livePlayerCountsAvailable:true,sourceSnapshotAt:AT};
  assert.equal(trustedVerifiedMap(proof,TRACKER,{sourceSnapshotAt:AT},NOW),true);
  for(const label of DISPLAYS)
    assert.equal(verifyVerifiedMapPublication(published(label),label,TRACKER),null,label);
});
test('a stale official-only fallback embed cannot pass as a restored full map',()=>{
  for(const label of DISPLAYS){
    const wrong={embeds:[{
      title:'👑 Kings '+label+' — Official Data',
      description:'Map-independent Tracker active.',
      fields:[{name:'Kings Drivers currently online',value:'**Unavailable — not zero**'}]
    }]};
    assert.match(verifyVerifiedMapPublication(wrong,label,TRACKER),/title-mismatch/);
  }
});
test('map-displayed counts must match the same saved ETS2, ATS and member generation',()=>{
  let m=published('Live Tracker');
  m.embeds[0].description=m.embeds[0].description.replace('3 Kings members','999 Kings members');
  assert.equal(verifyVerifiedMapPublication(m,'Live Tracker',TRACKER),'verified-map-tracker-online-mismatch');
  m=published('Advanced Statistics');
  m.embeds[0].fields[1].value='**2 Currently Online**\nETS2: **2** • ATS: **0**';
  assert.equal(verifyVerifiedMapPublication(m,'Advanced Statistics',TRACKER),'verified-map-statistics-counts-mismatch');
  m=published('Central Overview');
  m.embeds[0].fields[0].value='**109 TruckersMP Members**';
  assert.equal(verifyVerifiedMapPublication(m,'Central Overview',TRACKER),'verified-map-central-counts-mismatch');
  assert.equal(verifyVerifiedMapPublication(published('Central Overview'),
    'Central Overview',{...TRACKER,online:5}),'verified-map-counts-invalid');
});
test('outdated or missing timestamps cannot be counted as matching current live source',()=>{
  let m=published('Live Tracker');
  m.embeds[0].description=m.embeds[0].description.replace(
    'Last updated <t:'+TS+':R>', 'Last updated <t:'+(TS-900)+':R>');
  assert.equal(verifyVerifiedMapPublication(m,'Live Tracker',TRACKER),'verified-map-tracker-time-mismatch');
  m=published('Advanced Statistics');
  m.embeds[0].fields[2].value='Last updated <t:'+(TS-600)+':R>';
  assert.equal(verifyVerifiedMapPublication(m,'Advanced Statistics',TRACKER),'verified-map-statistics-time-mismatch');
  m=published('Central Overview');
  m.embeds[0].fields[2].value='Last updated <t:'+(TS-600)+':R>';
  assert.equal(verifyVerifiedMapPublication(m,'Central Overview',TRACKER),'verified-map-central-time-mismatch');
});
test('zero verified players show true zero, not fallback unavailable',()=>{
  const zero={...TRACKER,online:0,ets2Online:0,atsOnline:0};
  const m={embeds:[{title:'Live TruckersMP VTC Members Online',
    description:'**No Kings Logistics members are currently online on TruckersMP.**\n\n'+
      'ETS2: **0** • ATS: **0**\nLast updated <t:'+TS+':R>'}]};
  assert.equal(verifyVerifiedMapPublication(m,'Live Tracker',zero),null);
  assert.notEqual(verifyVerifiedMapPublication({
    embeds:[{title:m.embeds[0].title,description:'Unavailable — not zero'}]
  },'Live Tracker',zero),null);
});
test('live audit entrypoint verifies actual map fields instead of merely rejecting old outage title',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../discord-publication-content-audit.js'),'utf8');
  assert.match(source,/if\(fullMap\)return verifyVerifiedMapPublication\(message,/);
  assert.doesNotMatch(source,/if\(fullMap\)return verifyNormal/);
});
