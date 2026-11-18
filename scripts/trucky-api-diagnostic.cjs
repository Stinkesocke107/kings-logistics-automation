'use strict';
// One-off read-only diagnostics. Never print player IDs, names, locations or response bodies.
const HOST='https://api.truckyapp.com';
const BASE='https://api.truckersmp.com/v2';
const agent='KingsLogisticsAutomation/1.0 (+https://github.com/Stinkesocke107/kings-logistics-automation)';
async function probe(label,url){
  const t=Date.now();
  try{
    const response=await fetch(url,{headers:{'User-Agent':agent,'Accept':'application/json'},signal:AbortSignal.timeout(11000)});
    const type=response.headers.get('content-type')||'';
    let data=null;
    try{data=await response.json();}catch{}
    const resp=data && typeof data==='object'?data.response:null;
    const players=Array.isArray(resp)?resp:Array.isArray(resp?.players)?resp.players:null;
    const single=resp && typeof resp==='object'&&!Array.isArray(resp)?resp:null;
    console.log(JSON.stringify({label,httpStatus:response.status,ms:Date.now()-t,
      contentType:type.split(';')[0],rootKeys:data&&typeof data==='object'?Object.keys(data).slice(0,12):[],
      responseType:Array.isArray(resp)?'array':resp===null?'null':typeof resp,
      responseKeys:single?Object.keys(single).slice(0,15):[],
      playersCount:players?.length??null,
      firstPlayerKeys:players?.[0]&&typeof players[0]==='object'?Object.keys(players[0]).slice(0,22):[],
      onlineFieldType:players?.[0]?typeof players[0].online:single?typeof single.online:null,
      serverFieldType:players?.[0]?typeof players[0].server:single?typeof single.server:null,
      serverDetailsType:players?.[0]?typeof players[0].serverDetails:single?typeof single.serverDetails:null,
      errorFlag:data&&typeof data==='object'?data.error??null:null}));
  }catch(e){console.log(JSON.stringify({label,status:'NETWORK_FAILURE',error:e.name||'Error',ms:Date.now()-t}));}
}
(async()=>{
 let ids=[];
 try{
   const r=await fetch(BASE+'/vtc/73990/members',{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
   if(r.ok){const j=await r.json(); ids=(j?.response?.members||[]).slice(0,3).map(x=>Number(x.user?.id||x.user_id||x.id)).filter(x=>Number.isSafeInteger(x)&&x>0);}
 }catch{}
 // If VTC ID does not match, use the repository's configured VTC ID from the existing script.
 if(!ids.length){
   const fs=require('node:fs');
   const source=fs.readFileSync('tracker.js','utf8');
   const found=/KINGS_VTC_ID\s*=\s*(\d+)/.exec(source);
   if(found){
     try{
       const r=await fetch(BASE+'/vtc/'+found[1]+'/members',{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
       const j=await r.json();
       ids=(j?.response?.members||[]).slice(0,3).map(x=>Number(x.user?.id||x.user_id||x.id)).filter(x=>Number.isSafeInteger(x)&&x>0);
     }catch{}
   }
 }
 console.log(JSON.stringify({label:'Public VTC roster discovery',validSampleIds:ids.length}));
 if(!ids.length){console.log('No safe test IDs; stop without exposing private data');return;}
 await probe('Trucky v2 onlineList',HOST+'/v2/map/onlineList?ids='+encodeURIComponent(ids.join(',')));
 await probe('Trucky v3 online',HOST+'/v3/map/online?playerID='+encodeURIComponent(ids[0]));
})();