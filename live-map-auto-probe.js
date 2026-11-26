'use strict';
// Read-only small-area recovery canary. A successful probe permits the
// ORIGINAL Tracker's independent full all-server scan to run; it does NOT
// establish Kings online counts, completeness or final Discord delivery.
const OFFICIAL_SERVERS='https://api.truckersmp.com/v2/servers';
const MAP_ORIGIN='https://tracker.ets2map.com/v3/area';
const MAX_SERVERS_BYTES=256*1024;
const MAX_MAP_BYTES=1024*1024;
const TIMEOUT_MS=12000;

async function checkedJson(url,transport,maxBytes){
  const res=await transport(url,{
    method:'GET',redirect:'error',
    headers:{Accept:'application/json','User-Agent':'KingsLogisticsMapRecovery/1.0'},
    signal:AbortSignal.timeout(TIMEOUT_MS)
  });
  if(!res?.ok)throw Error('Recovery probe source unavailable');
  const length=Number(res.headers?.get?.('content-length')||0);
  if(Number.isFinite(length)&&length>maxBytes)
    throw Error('Recovery probe body too large');
  // Fetch bytes ONLY into volatile memory. No player positions or identities
  // may be printed, persisted, returned to the caller or sent to Discord.
  const raw=await res.text();
  if(Buffer.byteLength(raw,'utf8')>maxBytes)
    throw Error('Recovery probe body too large');
  try{return JSON.parse(raw);}
  catch{throw Error('Recovery probe source shape invalid');}
}

function chooseProbeServer(payload){
  if(!payload||(payload.error!==false&&payload.error!=='false')||
     !Array.isArray(payload.response)||payload.response.length===0)
    throw Error('Recovery probe server directory invalid');
  const eligible=payload.response.filter(s=>{
    const mapId=Number(s?.mapid);
    return s?.online===true&&
      ['ETS2','ATS'].includes(String(s.game||'').toUpperCase())&&
      Number.isSafeInteger(mapId)&&mapId>0&&mapId<=100000&&
      (s.players===undefined||
       (Number.isSafeInteger(s.players)&&s.players>0));
  });
  // One server only for a cheap canary. The main tracker must still verify
  // EVERY active server before announcing any Kings player as online.
  if(!eligible.length)throw Error('No suitable active recovery probe server');
  const first=eligible.find(s=>String(s.game).toUpperCase()==='ETS2')||eligible[0];
  return Number(first.mapid);
}
async function probeMapRecovery(transport=fetch){
  const official=await checkedJson(OFFICIAL_SERVERS,transport,MAX_SERVERS_BYTES);
  const server=chooseProbeServer(official);
  // Small geographic window reduces provider load while preserving the
  // same validated /v3/area JSON contract as the full Kings tracker.
  const url=MAP_ORIGIN+'?x1=-5000&y1=5000&x2=5000&y2=-5000&server='+server;
  const map=await checkedJson(url,transport,MAX_MAP_BYTES);
  if(map?.Success!==true||!Array.isArray(map.Data))
    throw Error('Recovery probe map source shape invalid');
  // Return only an aggregate boolean: NEVER expose the map response.
  return true;
}
if(require.main===module){
  probeMapRecovery().then(()=>{
    console.log('Kings map recovery canary verified. Starting separate full server-coverage check.');
  }).catch(()=>{
    console.warn('Kings map recovery not verified; continuing from official TruckersMP data.');
    process.exitCode=1;
  });
}
module.exports={chooseProbeServer,probeMapRecovery};
