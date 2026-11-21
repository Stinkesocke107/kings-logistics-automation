'use strict';
// Exploratory one-time PUBLIC endpoint checks. No full-roster scanning and no
// player IDs, names, coordinates, personal data, or responses in logs.
const KINGS_VTC_ID=64284;
const ORIGIN='https://api.truckersmp.com/v2';
const MAX_BODY_BYTES=128*1024;

async function checkedGet(url, transport=fetch) {
  const response=await transport(url,{method:'GET',redirect:'error',
    headers:{Accept:'application/json','User-Agent':'KingsLogisticsMapDiagnostics/1.0'},
    signal:AbortSignal.timeout(7000)});
  const contentLength=Number(response.headers?.get?.('content-length')||0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_BODY_BYTES){
    return {status:response.status,json:false,shape:'body-too-large'};
  }
  if(!response.ok)return {status:response.status,json:false,shape:'http-rejected'};
  const text=await response.text();
  if(Buffer.byteLength(text)>MAX_BODY_BYTES)
    return {status:response.status,json:false,shape:'body-too-large'};
  try{
    const parsed=JSON.parse(text);
    return {status:response.status,json:true,shape:classifyShape(parsed),data:parsed};
  }catch{return {status:response.status,json:false,shape:'invalid-json'};}
}
function classifyShape(value) {
  if(Array.isArray(value))return 'json-array';
  if(!value||typeof value!=='object')return 'json-scalar';
  if(value.Success===true&&Array.isArray(value.Data))return 'map-area-list';
  if(typeof value.online==='boolean'||typeof value.response?.online==='boolean')
    return 'online-status-object';
  if(value.response&&typeof value.response==='object')return 'response-object';
  return 'json-object';
}
function safeResult(name, response) {
  // Never log JSON data, player identifiers or the query string.
  return name+': HTTP '+response.status+'; '+response.shape;
}
async function main(transport=fetch, emit=console.log) {
  const roster=await checkedGet(ORIGIN+'/vtc/'+KINGS_VTC_ID+'/members',transport);
  if(!roster.json||!Array.isArray(roster.data?.response?.members))
    throw Error('Official Kings VTC roster unavailable. No candidate probes attempted.');
  const member=roster.data.response.members.find(m=>
    Number.isSafeInteger(m?.user_id)&&m.user_id>0);
  if(!member)throw Error('Roster did not expose a safe numeric TMP identifier.');
  emit('Official Kings VTC members verified: '+roster.data.response.members.length+
    '. Sampling one member without logging identity.');
  const candidates=[
    ['TruckersMP Map Doko','https://tracker.ets2map.com/v2/doko/'+member.user_id],
    ['Trucky documented map player API','https://api.truckyapp.com/v3/map/online?playerID='+member.user_id]
  ];
  for(const [name,url] of candidates){
    try{emit(safeResult(name,await checkedGet(url,transport)));}
    catch(error){
      emit(name+': request unavailable ('+
        (error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':'network/error')+').');
    }
  }
  emit('No candidate approved: complete, independent API coverage and access terms remain unverified.');
}
if(require.main===module){
  main().catch(e=>{console.error(String(e?.message||'Diagnostic failed.'));
    process.exitCode=1;});
}
module.exports={checkedGet,classifyShape,safeResult,main};
