'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPrivateGitHubReader,redirectHostAllowed}
 =require('../event-capacity-github-source');
const REPO='Stinkesocke107/kings-logistics-automation';
const RUN='45502949674',ART='70000000001';
const TOKEN='synthetic-fake-gh-token-not-a-real-credential';
const BASE='https://api.github.com/repos/'+REPO;
const CDN='https://productionresultssa12.blob.core.windows.net/kings-report.zip?sig=synthetic';
function api(payload,status=200){
  return new Response(JSON.stringify(payload),{
    status,headers:{'content-type':'application/json'}
  });
}
function transport(routes){
  const requests=[];
  const fetcher=async (url,opts)=>{
    requests.push({url:String(url),headers:opts.headers,redirect:opts.redirect,
      method:opts.method});
    const response=routes[String(url)];
    return typeof response==='function'?response(url,opts):response||new Response('not found',{status:404});
  };
  return {fetcher,requests};
}
test('Uses exact authorized GitHub REST URLs with bearer token only for api.github.com',async()=>{
  const {fetcher,requests}=transport({
    [BASE+'/actions/runs/'+RUN]:api({id:Number(RUN),status:'completed'}),
    [BASE+'/actions/runs/'+RUN+'/artifacts?per_page=100']:api({total_count:1,artifacts:[{id:70000000001}]})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  assert.equal((await reader.getRun({repository:REPO,runId:RUN})).id,Number(RUN));
  assert.equal((await reader.getArtifacts({repository:REPO,runId:RUN})).length,1);
  assert.equal(requests.length,2);
  assert.ok(requests.every(x=>x.headers.Authorization==='Bearer '+TOKEN&&
    x.redirect==='manual'&&x.method==='GET'));
});
test('Downloads ZIP through approved HTTPS artifact CDN with no authentication header',async()=>{
  const zip=Buffer.from('synthetic-binary-ZIP-bytes');
  const {fetcher,requests}=transport({
    [BASE+'/actions/artifacts/'+ART+'/zip']:
      new Response(null,{status:302,headers:{Location:CDN}}),
    [CDN]:new Response(zip,{status:200,headers:{'content-type':'application/zip'}})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  const bytes=await reader.readArtifact({
    repository:REPO,runId:RUN,runAttempt:1,artifactId:ART,
    maxArchiveBytes:25*1024*1024
  });
  assert.deepEqual(bytes,zip);
  assert.equal(requests.length,2);
  assert.equal(requests[0].headers.Authorization,'Bearer '+TOKEN);
  assert.equal(requests[1].headers.Authorization,undefined);
  assert.equal(requests[1].headers.Accept,'application/zip');
  assert.equal(requests[1].redirect,'manual');
});
test('Never follows a redirected URL to localhost, HTTP or attacker-controlled domain',async()=>{
  for(const url of ['http://127.0.0.1/','https://evil.example/a',
    'https://blob.core.windows.net.attacker.example/','https://user:pass@productionresultssa12.blob.core.windows.net/a']){
    assert.throws(()=>redirectHostAllowed(url));
  }
  assert.equal(redirectHostAllowed(CDN),CDN);
});
test('Rejects artifact API redirects to unapproved host before second request',async()=>{
  const {fetcher,requests}=transport({
    [BASE+'/actions/artifacts/'+ART+'/zip']:new Response(null,{status:302,
      headers:{Location:'https://wrong.example/private-data.zip'}})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.readArtifact({repository:REPO,runId:RUN,
    runAttempt:1,artifactId:ART,maxArchiveBytes:25*1024*1024}));
  assert.equal(requests.length,1);
});
test('Rejects malformed repo IDs, run IDs and artifact IDs before making requests',async()=>{
  const {fetcher,requests}=transport({});
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.getRun({repository:'bad-repo',runId:RUN}));
  await assert.rejects(reader.getRun({repository:REPO,runId:'../admin'}));
  await assert.rejects(reader.getArtifacts({repository:REPO,runId:'abc'}));
  await assert.rejects(reader.readArtifact({repository:REPO,runId:RUN,runAttempt:1,
    artifactId:'bad/123',maxArchiveBytes:25*1024*1024}));
  assert.equal(requests.length,0);
});
test('No GitHub API token is accepted if it is missing or contains header injection',()=>{
  assert.throws(()=>createPrivateGitHubReader({token:''}));
  assert.throws(()=>createPrivateGitHubReader({token:'very-long-token\r\nX-Injected: yes'}));
});
test('GitHub API errors use generic messages that do not leak secrets',async()=>{
  const {fetcher}=transport({
    [BASE+'/actions/runs/'+RUN]:
      new Response('Secret token '+TOKEN,{status:403})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.getRun({repository:REPO,runId:RUN}),e=>
    !String(e.message).includes(TOKEN)&&!String(e.message).includes('Secret token')
  );
});
test('Artifact list must be complete and must not silently omit a second page',async()=>{
  const {fetcher}=transport({
    [BASE+'/actions/runs/'+RUN+'/artifacts?per_page=100']:api({
      total_count:101,artifacts:[{id:Number(ART)}]
    })
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.getArtifacts({repository:REPO,runId:RUN}));
});
test('Malformed JSON from provider cannot become a verified run object',async()=>{
  const {fetcher}=transport({
    [BASE+'/actions/runs/'+RUN]:new Response('not-json',{status:200})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.getRun({repository:REPO,runId:RUN}));
});
test('Rejects a declared ZIP content-length beyond 25 MiB',async()=>{
  const {fetcher}=transport({
    [BASE+'/actions/artifacts/'+ART+'/zip']:
      new Response(Buffer.from('small'),{status:200,
        headers:{'content-length':String(25*1024*1024+1)}})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.readArtifact({repository:REPO,runId:RUN,
    runAttempt:1,artifactId:ART,maxArchiveBytes:25*1024*1024}));
});
test('Does not follow additional CDN redirects to an untrusted second host',async()=>{
  const {fetcher,requests}=transport({
    [BASE+'/actions/artifacts/'+ART+'/zip']:
      new Response(null,{status:302,headers:{Location:CDN}}),
    [CDN]:new Response(null,{status:302,headers:{Location:'http://169.254.169.254/'}})
  });
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  await assert.rejects(reader.readArtifact({repository:REPO,runId:RUN,
    runAttempt:1,artifactId:ART,maxArchiveBytes:25*1024*1024}));
  assert.equal(requests.length,2);
});
test('The authenticated reader does not issue requests during construction',()=>{
  const {fetcher,requests}=transport({});
  const reader=createPrivateGitHubReader({token:TOKEN,transport:fetcher});
  assert.equal(typeof reader.getRun,'function');
  assert.equal(requests.length,0);
});
