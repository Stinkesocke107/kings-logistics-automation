'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const recent=new Date(Date.now()-45000).toISOString();
const labels=['Live Tracker','Advanced Statistics','Central Overview'];
function fixture(files={}){
  return sandbox('live-outage-notice.js',{files:{
    'data/live-tracker-snapshot.json':JSON.stringify({updatedAt:recent,members:110,online:2,
      discordMessageId:'123456789012345678'}),
    'data/statistics.json':JSON.stringify({sourceSnapshotAt:recent,messageId:'123456789012345678'}),
    ...files
  }});
}
test('fully verified source is recorded only from matching fresh Tracker and Statistics generations',()=>{
  const s=fixture();
  const proof=s.run("require('./live-systems-delivery').recordVerifiedLive()");
  assert.equal(proof.mode,'verified-live');
  assert.equal(proof.source,'verified-map');
  assert.equal(proof.sourceSnapshotAt,recent);
  assert.equal(proof.allDisplaysVerified,true);
  assert.equal(proof.livePlayerCountsAvailable,true);
  assert.equal(proof.displaysVerified.length,3);
  const saved=s.files.get('data/live-systems-delivery.json');
  assert.deepEqual(JSON.parse(saved),JSON.parse(JSON.stringify({version:1,...proof})));
  assert.doesNotMatch(saved,/discordMessageId|token|username|tmpId|password|latitude|longitude/i);
});

test('full-live proof cannot be recorded for stale, mismatched or malformed measurements',()=>{
  for(const files of [
    {'data/statistics.json':JSON.stringify({sourceSnapshotAt:'2026-01-01T00:00:00Z'})},
    {'data/live-tracker-snapshot.json':JSON.stringify({updatedAt:'2026-01-01T00:00:00Z',members:110,online:2})},
    {'data/live-tracker-snapshot.json':JSON.stringify({updatedAt:recent,members:110,online:null})},
    {'data/live-tracker-snapshot.json':JSON.stringify({updatedAt:recent,members:-1,online:0})}
  ]){
    const previous='{"version":1,"mode":"fallback-incomplete"}';
    const s=fixture({...files,'data/live-systems-delivery.json':previous});
    assert.throws(()=>s.run("require('./live-systems-delivery').recordVerifiedLive()"),
      /Cannot verify complete Kings Live Systems source generation/);
    assert.equal(s.files.get('data/live-systems-delivery.json'),previous);
  }
});

test('fallback proof distinguishes official totals, membership only, recent roster and status-only',()=>{
  for(const [official,recentRoster,expected] of [
    [{observedAt:recent,vtcMemberCount:110,totalAllPlayers:1000,ets2AllPlayers:800,atsAllPlayers:200},false,'official-vtc-and-servers'],
    [{observedAt:recent,vtcMemberCount:110},false,'official-vtc-only'],
    [null,true,'recent-roster'],
    [null,false,'status-only']
  ]){
    const s=fixture();
    const proof=s.run("require('./live-systems-delivery').recordFallbackDelivery("+JSON.stringify({
      official,displayResults:labels.map(label=>({label,ok:true})),problems:0,hasRecentRoster:recentRoster
    })+")");
    assert.equal(proof.mode,'fallback-delivered');
    assert.equal(proof.source,expected);
    assert.equal(proof.livePlayerCountsAvailable,false);
    assert.equal(proof.allDisplaysVerified,true);
    assert.equal(JSON.parse(s.files.get('data/live-systems-delivery.json')).source,expected);
  }
});

test('failed fallback proof cannot be green and never persists arbitrary display or user identifiers',()=>{
  const s=fixture();
  const proof=s.run("require('./live-systems-delivery').recordFallbackDelivery("+JSON.stringify({
    displayResults:[
      {label:'Live Tracker',ok:true,username:'privateUser',messageId:'12345'},
      {label:'Advanced Statistics',ok:true},
      {label:'secretTokenUser',ok:true}
    ],problems:1,hasRecentRoster:false
  })+")");
  assert.equal(proof.mode,'fallback-incomplete');
  assert.equal(proof.allDisplaysVerified,false);
  assert.equal(proof.displaysVerified.join('|'),'Live Tracker|Advanced Statistics');
  const saved=s.files.get('data/live-systems-delivery.json');
  assert.doesNotMatch(saved,/privateUser|secretTokenUser|messageId|12345/);
});
