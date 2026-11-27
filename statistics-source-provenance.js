'use strict';
// Source-of-truth guard for Kings verified player-map statistics.
// Do not invent online observations, dates, hourly evidence or missing months.
// The existing saved history may be older than current live data; stale data
// must remain visible to monitoring instead of being refreshed synthetically.
const fs=require('node:fs');

const UTC_DAY=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UTC_HOUR=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):00:00\.000Z$/;
const NUMBER_FIELDS=['startMembers','members','peakOnline','peakETS2','peakATS',
  'activitySamples','ets2PlayerSamples','atsPlayerSamples'];

function validDay(day){
  if(!UTC_DAY.test(day))return false;
  const instant=Date.parse(day+'T00:00:00.000Z');
  return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===day;
}
function requireBounded(value){
  return Number.isSafeInteger(value)&&value>=0&&value<=100000000;
}
function extractStatisticsHistory(raw){
  if(Array.isArray(raw))return raw;
  if(!raw||typeof raw!=='object')throw new Error('Kings Statistics state has invalid structure');
  if(Array.isArray(raw.history))return raw.history;
  if(Array.isArray(raw.days))return raw.days; // Legacy reader compatibility
  throw new Error('Kings Statistics state lacks an authenticated history array');
}
function validateStatisticsDocument(raw){
  const history=extractStatisticsHistory(raw);
  const seenDays=new Set();
  for(const item of history){
    if(!item||typeof item!=='object'||Array.isArray(item)||
       typeof item.date!=='string'||!validDay(item.date))
      throw new Error('Kings Statistics history contains an invalid UTC day');
    if(seenDays.has(item.date))
      throw new Error('Kings Statistics history contains duplicate UTC day');
    seenDays.add(item.date);
    if(NUMBER_FIELDS.some(key=>!requireBounded(item[key])))
      throw new Error('Kings Statistics history contains unverified numerical counters');
    if(!Array.isArray(item.sampledHours)||item.sampledHours.length!==item.activitySamples||
       item.sampledHours.length>24||item.sampledHours.length===0)
      throw new Error('Kings Statistics history lacks original verified hourly samples');
    const hours=new Set();
    for(const hour of item.sampledHours){
      if(typeof hour!=='string'||!UTC_HOUR.test(hour)||
         !hour.startsWith(item.date+'T')||hours.has(hour))
        throw new Error('Kings Statistics hourly evidence is invalid or duplicated');
      hours.add(hour);
    }
    if(!item.serverPlayerSamples||typeof item.serverPlayerSamples!=='object'||
       Array.isArray(item.serverPlayerSamples)||
       Object.values(item.serverPlayerSamples).some(n=>!requireBounded(n)))
      throw new Error('Kings Statistics server samples are unverified');
  }
  return history;
}
function readStatisticsDocument(file,{allowMissing=false}={}){
  if(!fs.existsSync(file)){
    if(allowMissing)return {history:[]};
    throw new Error('Kings Statistics verified history is missing');
  }
  let data;
  try{data=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error('Kings Statistics saved history JSON is unreadable; manual recovery required');}
  validateStatisticsDocument(data);
  return data;
}
module.exports={validDay,validateStatisticsDocument,readStatisticsDocument};
