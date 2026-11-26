'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chooseProbeServer,probeMapRecovery}=require('../live-map-auto-probe');
const official='https://api.truckersmp.com/v2/servers';
const mapHost='https://tracker.ets2map.com/v3/area';
const servers=(items)=>({error:false,response:items});
const online=[
  {game:'ETS2',online:true,mapid:2,players:100},
  {game:'ATS',online:true,mapid:45,players:20},
  {game:'ETS2',online:false,mapid:1,players:0}
];
const json=data=>new Response(JSON.stringify(data),{
  status:200,headers:{'content-type':'application/json'}
});
function sample({serverList=online,body={Success:true,Data:[]},serverError=null,mapError=null}={}){
  const calls=[];
  const transport=async(url,opts)=>{
    calls.push({url,opts});
    if(url===official)return serverError||json(servers(serverList));
    if(url.startsWith(mapHost))return mapError||json(body);
    throw Error('Unexpected request');
  };
  return {calls,transport};
}
test('a valid small-area recovery canary allows the independent full scan, without any private outputs',async()=>{
  const p=sample({body:{Success:true,Data:[{
    MpId:12345,Name:'privateTester',VtcId:64284,X:42,Y:24
  }]}});
  assert.equal(await probeMapRecovery(p.transport),true);
  assert.equal(p.calls.length,2);
  assert.equal(p.calls[0].url,official);
  assert.ok(p.calls[1].url.startsWith(mapHost));
  assert.match(p.calls[1].url,/server=2/);
  assert.match(p.calls[1].url,/x1=-5000/);
  assert.ok(p.calls.every(x=>x.opts.method==='GET'&&
    x.opts.redirect==='error'&&x.opts.signal));
  assert.ok(p.calls.every(x=>!JSON.stringify(x.url).includes('privateTester')));
});
test('server selection cannot infer online players from missing/zero server counts',()=>{
  assert.equal(chooseProbeServer(servers([
    {game:'ETS2',mapid:12,online:true,players:0},
    {game:'ATS',mapid:20,online:true,players:2}
  ])),20);
  assert.equal(chooseProbeServer(servers([
    {game:'ATS',mapid:20,online:true,players:2},
    {game:'ETS2',mapid:'5',online:true}
  ])),5);
  for(const data of [
    null,{},servers([]),
    {error:true,response:online},
    servers([{online:true,game:'ETS2',mapid:null,players:10}]),
    servers([{online:true,game:'ETS2',mapid:1,players:0}]),
    servers([{online:false,game:'ETS2',mapid:2,players:10}]),
    servers([{online:true,game:'UNKNOWN',mapid:2,players:10}])
  ])assert.throws(()=>chooseProbeServer(data),/probe/);
});
test('HTTP, malformed map payload, oversize source and redirection fail closed before publication',async()=>{
  for(const value of [
    {Success:false,Data:[]},{Success:true,Data:null},
    {Success:true},[],null
  ]){
    const p=sample({body:value});
    await assert.rejects(probeMapRecovery(p.transport),/probe/);
  }
  for(const p of [
    sample({serverError:new Response('down',{status:503})}),
    sample({mapError:new Response('down',{status:503})}),
    sample({mapError:new Response('{broken',{status:200})}),
    sample({mapError:new Response('{}',{status:200,headers:{'content-length':'2000000'}})})
  ]){
    await assert.rejects(probeMapRecovery(p.transport),/probe/);
    assert.ok(p.calls.every(x=>x.opts.method==='GET'));
  }
});
test('the recovery canary is neither a Kings-online measurement nor an authorization to publish',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../live-map-auto-probe.js'),'utf8');
  assert.doesNotMatch(source,/DISCORD_WEBHOOK|writeFileSync|PATCH|POST|kingsOnline:|saveLiveSnapshot/);
  assert.match(source,/module\.exports=\{chooseProbeServer,probeMapRecovery\}/);
  assert.match(source,/A successful probe permits the/);
});
