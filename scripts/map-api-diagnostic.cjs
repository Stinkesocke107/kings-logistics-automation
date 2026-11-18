'use strict';
// Temporary zero-secret public API transport diagnosis. Never print player data.
async function check(label, url, timeoutMs = 9000) {
  const started = Date.now();
  try {
    const response = await fetch(url, {signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});
    const reader = response.body?.getReader();
    const first = reader ? await reader.read() : {value:null};
    const chars = first.value ? new TextDecoder().decode(first.value).slice(0,120) : '';
    await reader?.cancel().catch(()=>{});
    const prefix = chars.replace(/"Name"\s*:\s*"[^"]*"/g,'"Name":"[redacted]"')
      .replace(/"MpId"\s*:\s*[0-9]+/g,'"MpId":"[redacted]"');
    console.log(JSON.stringify({label,status:response.status,ms:Date.now()-started,
      contentType:response.headers.get('content-type'),
      bytes:response.headers.get('content-length'),
      jsonPrefix:prefix.startsWith('{"Success"')?'Success-envelope':prefix.startsWith('{')?'JSON-object':prefix.startsWith('[')?'JSON-array':'other'}));
    return response.ok;
  } catch (error) {
    console.log(JSON.stringify({label,status:'NETWORK_OR_TIMEOUT',ms:Date.now()-started,
      error: String(error?.name||'Error')}));
    return false;
  }
}
async function main() {
  const start=Date.now();
  let mapId=1;
  try {
    const response=await fetch('https://api.truckersmp.com/v2/servers',{signal:AbortSignal.timeout(9000)});
    const json=await response.json();
    const active=(json?.response||[]).filter(x=>x.online && Number.isFinite(Number(x.mapid)) && Number(x.players)>=0);
    if(active.length)mapId=Number(active[0].mapid);
    console.log(JSON.stringify({label:'TMP server discovery',status:response.status,count:active.length,ms:Date.now()-start,mapId}));
  } catch(error){console.log(JSON.stringify({label:'TMP server discovery',status:'TIMEOUT',error:String(error?.name||'Error')}))}
  for(const [name,radius] of [['small',10000],['medium',100000],['original',1000000]]) {
    const params=new URLSearchParams({x1:String(-radius),y1:String(radius),x2:String(radius),y2:String(-radius),server:String(mapId)});
    await check(name,'https://tracker.ets2map.com/v3/area?'+params,11000);
  }
}
main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1});
