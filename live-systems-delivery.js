'use strict';
// Aggregate operational proof only: no Discord tokens, message IDs, driver
// records or position data are allowed in this public repository state file.
const fs=require('node:fs');
const path=require('node:path');
const FILE=path.join(__dirname,'data','live-systems-delivery.json');
const DISPLAYS=Object.freeze(['Live Tracker','Advanced Statistics','Central Overview']);
function readJson(name) {
  try {return JSON.parse(fs.readFileSync(path.join(__dirname,'data',name),'utf8'));}
  catch {return null;}
}
function validTimestamp(value, now=Date.now(), maxAgeMs=15*60*1000){
  const ms=Date.parse(value||'');
  return Number.isFinite(ms)&&ms>0&&ms<=now+5*60*1000&&now-ms<=maxAgeMs;
}
function save(proof){
  const allowedModes=new Set(['fallback-delivered','fallback-incomplete','verified-live']);
  const allowedSources=new Set(['official-vtc-and-servers','official-vtc-only','recent-roster','status-only','verified-map']);
  if(!allowedModes.has(proof.mode)||!allowedSources.has(proof.source)||
     !Array.isArray(proof.displaysVerified)||proof.displaysVerified.some(label=>!DISPLAYS.includes(label))){
    throw new Error('Invalid Kings Live Systems delivery proof');
  }
  fs.mkdirSync(path.dirname(FILE),{recursive:true});
  fs.writeFileSync(FILE,JSON.stringify({version:1,...proof},null,2)+'\n','utf8');
}
function recordFallbackDelivery({official=null,displayResults=[],problems=0,hasRecentRoster=false}={}){
  const verified=DISPLAYS.filter(label=>displayResults.some(item=>item?.label===label && item.ok===true));
  const complete=problems===0&&verified.length===DISPLAYS.length;
  const hasGlobalTotals=official&&Number.isSafeInteger(official.totalAllPlayers)&&
    Number.isSafeInteger(official.ets2AllPlayers)&&Number.isSafeInteger(official.atsAllPlayers);
  const source=official?(hasGlobalTotals?'official-vtc-and-servers':'official-vtc-only'):
    hasRecentRoster?'recent-roster':'status-only';
  const last=readJson('live-tracker-snapshot.json');
  const proof={
    mode:complete?'fallback-delivered':'fallback-incomplete',
    source,
    checkedAt:new Date().toISOString(),
    allDisplaysVerified:complete,
    displaysVerified:verified,
    sourceSnapshotAt:typeof last?.updatedAt==='string'?last.updatedAt:null,
    livePlayerCountsAvailable:false
  };
  save(proof);
  return proof;
}
function recordVerifiedLive(){
  const snapshot=readJson('live-tracker-snapshot.json');
  const statistics=readJson('statistics.json');
  if(!snapshot||!statistics||!validTimestamp(snapshot.updatedAt)||
    statistics.sourceSnapshotAt!==snapshot.updatedAt||
    !Number.isSafeInteger(snapshot.online)||snapshot.online<0||
    !Number.isSafeInteger(snapshot.members)||snapshot.members<0){
    throw new Error('Cannot verify complete Kings Live Systems source generation');
  }
  const proof={
    mode:'verified-live',
    source:'verified-map',
    checkedAt:new Date().toISOString(),
    allDisplaysVerified:true,
    displaysVerified:[...DISPLAYS],
    sourceSnapshotAt:snapshot.updatedAt,
    livePlayerCountsAvailable:true
  };
  save(proof);
  return proof;
}
module.exports={FILE,DISPLAYS,recordFallbackDelivery,recordVerifiedLive,validTimestamp};
