'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {main,classifyShape,safeResult}=require('../scripts/map-provider-diagnostic.js');

test('one-time map source probe queries no more than one VTC member per candidate and logs no identity data',async()=>{
  const urls=[],output=[];
  const transport=async url=>{
    urls.push(url);
    if(url.endsWith('/vtc/64284/members'))
      return new Response(JSON.stringify({error:false,response:{members:[
        {user_id:1234567,username:'PRIVATEPLAYERNAME'},
        {user_id:7654321,username:'OTHERPRIVATEPLAYER'}
      ]}}),{status:200});
    return new Response(JSON.stringify({response:{online:true,
      playerId:1234567,name:'PRIVATEPLAYERNAME',x:11,y:22}}),{status:200});
  };
  await main(transport,value=>output.push(value));
  assert.equal(urls.length,3);
  assert.ok(urls[0].startsWith('https://api.truckersmp.com/v2/vtc/64284/members'));
  assert.ok(urls[1].includes('/v2/doko/1234567'));
  assert.ok(urls[2].includes('/v3/map/online?playerID=1234567'));
  const logs=output.join('\n');
  assert.doesNotMatch(logs,/1234567|7654321|PRIVATEPLAYERNAME|OTHERPRIVATEPLAYER|x:11|y:22/);
  assert.match(logs,/No candidate approved/);
});
test('shape detection and summary are privacy-safe',()=>{
  assert.equal(classifyShape({response:{online:false,playerId:12345}}),'online-status-object');
  assert.equal(classifyShape({Success:true,Data:[]}), 'map-area-list');
  assert.equal(classifyShape({response:{PlayerName:'private'}}),'response-object');
  assert.equal(safeResult('Doko',{status:429,shape:'http-rejected'}),'Doko: HTTP 429; http-rejected');
  const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
  assert.match(source,/One-time Doko and Trucky candidate diagnostics/);
  assert.match(source,/contains\(github\.event\.head_commit\.message, 'One-time source probe'\)/);
  assert.match(source,/continue-on-error: true/);
  assert.match(source,/scripts\/map-provider-diagnostic\.js/);
});
