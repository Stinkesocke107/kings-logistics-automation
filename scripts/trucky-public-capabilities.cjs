'use strict';
// One-time, read-only capability/transport test. No identities or response bodies.
const checks=[
  ['TruckersMP official servers','https://api.truckersmp.com/v2/servers'],
  ['Trucky TMP aggregate servers','https://api.truckyapp.com/v2/truckersmp/servers'],
  ['Trucky map server directory','https://api.truckyapp.com/v2/map/servers'],
  ['Trucky static ETS2 city directory','https://api.truckyapp.com/v2/map/cities/ets2'],
  ['TruckersMP official map site','https://map.truckersmp.com/']
];
async function probe([label,url]) {
 const t=Date.now();
 try{
   const response=await fetch(url,{
     headers:{'user-agent':'KingsLogisticsAutomation/1.0 (diagnostics; https://github.com/Stinkesocke107/kings-logistics-automation)',
              accept:'application/json'},
     signal:AbortSignal.timeout(9000)
   });
   const contentType=String(response.headers.get('content-type')||'').split(';')[0];
   // No bodies read: no possibility of logging player or game data.
   await response.body?.cancel().catch(()=>{});
   return {label,httpStatus:response.status,contentType,elapsedMs:Date.now()-t};
 }catch(error){
   return {label,status:'network-error-or-timeout',kind:error?.name||'Error',elapsedMs:Date.now()-t};
 }
}
Promise.all(checks.map(probe))
 .then(results=>{for(const result of results)console.log(JSON.stringify(result));})
 .catch(()=>{console.error('Capability probe failed.');process.exitCode=1;});
