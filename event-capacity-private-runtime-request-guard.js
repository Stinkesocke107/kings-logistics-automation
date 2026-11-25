'use strict';
// OFFLINE GitHub URL/method allowlist. Use this as an additional request
// guard around a future separately authorized credential, NOT as a GitHub
// permission grant or proof that the Bearer token is least-privileged.
// No token creation/storage, no network except via injected caller transport,
// no retries, no writes during constructor, no production imports.
const ERROR='Kings Event Capacity private GitHub operation blocked.';
const REPOS=Object.freeze({
  history:'Stinkesocke107/kings-event-capacity-history',
  witness:'Stinkesocke107/kings-event-capacity-witness',
  backup:'Stinkesocke107/kings-event-capacity-backups'
});
const HASH=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const ENCODED=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function fail(){throw new Error(ERROR);}
function plain(x){return x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function exact(o,keys){
  if(!plain(o)||Object.keys(o).sort().join(',')!==[...keys].sort().join(','))fail();
}
function day(s){
  if(typeof s!=='string'||!DATE.test(s))fail();
  const time=Date.parse(s+'T00:00:00.000Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==s)fail();
}
function route(role,s){
  if(s===''||s==='/branches/main')return {kind:'metadata',maxBytes:0};
  if(role==='history'){
    if(s==='/contents/capacity-history/current.json'||s==='/contents/capacity-history/current.json?ref=main')
      return {kind:'index',maxBytes:256*1024};
    if(/^\/contents\/capacity-history\/segments\/[a-f0-9]{64}\.bin(?:\?ref=main)?$/.test(s))
      return {kind:'segment',maxBytes:512*1024};
  }
  if(role==='backup'){
    const daily=s.match(/^\/contents\/capacity-backups\/daily\/(20\d{2}-\d{2}-\d{2})\.manifest\.json(?:\?ref=main)?$/);
    if(daily){day(daily[1]);return {kind:'index',maxBytes:96*1024};}
    if(/^\/contents\/capacity-backups\/segments\/[a-f0-9]{64}\.bin(?:\?ref=main)?$/.test(s))
      return {kind:'segment',maxBytes:512*1024};
  }
  if(role==='witness'){
    if(s==='/contents/capacity-witness/current.json?ref=main')
      return {kind:'witness',maxBytes:64*1024};
  }
  fail();
}
function validatePayload(role,kind,body){
  if(typeof body!=='string'||body.length>2*1024*1024)fail();
  let payload;
  try{payload=JSON.parse(body);}catch{fail();}
  const keys=kind==='index'&&role==='history'?
    ['branch','message','content','sha']:
    ['branch','message','content'];
  exact(payload,keys);
  if(payload.branch!=='main'||typeof payload.message!=='string'||
    payload.message.length<3||payload.message.length>128||
    typeof payload.content!=='string'||!ENCODED.test(payload.content))
    fail();
  if(keys.includes('sha')&&!GIT_SHA.test(payload.sha))fail();
  const decoded=Buffer.from(payload.content,'base64');
  if(decoded.length<1||decoded.toString('base64')!==payload.content)fail();
  const max=kind==='segment'?512*1024:
    role==='history'?256*1024:96*1024;
  if(decoded.length>max)fail();
}
function createKingsPrivateGithubRequestGuard({
  role,mode,transport
}={}){
  if(!Object.hasOwn(REPOS,role)||!['read','write'].includes(mode)||
    (role==='witness'&&mode!=='read')||
    typeof transport!=='function')fail();
  const prefix='https://api.github.com/repos/'+REPOS[role];
  async function guardedTransport(url,options){
    try{
      if(typeof url!=='string'||!url.startsWith(prefix)||
        !plain(options)||Object.keys(options).some(k=>
          !['method','headers','redirect','signal','body'].includes(k))||
        !plain(options.headers)||Object.keys(options.headers).some(k=>
          !['Authorization','Accept','X-GitHub-Api-Version','User-Agent',
            'Content-Type'].includes(k))||
        options.redirect!=='manual'||
        typeof options.headers.Authorization!=='string'||
        !/^Bearer [^\s]{20,1024}$/.test(options.headers.Authorization)||
        options.headers.Accept!=='application/vnd.github+json'||
        (Object.hasOwn(options.headers,'X-GitHub-Api-Version')&&
          options.headers['X-GitHub-Api-Version']!=='2022-11-28')||
        (Object.hasOwn(options.headers,'User-Agent')&&
          (typeof options.headers['User-Agent']!=='string'||
           !/^[A-Za-z0-9._/-]{1,100}$/.test(options.headers['User-Agent'])))||
        (Object.hasOwn(options.headers,'Content-Type')&&
          (options.method!=='PUT'||
           options.headers['Content-Type']!=='application/json'))||
        !['GET','PUT'].includes(options.method))fail();
      const suffix=url.slice(prefix.length);
      if(suffix!==''&&!suffix.startsWith('/'))fail();
      const target=route(role,suffix);
      if(options.method==='GET'){
        if('body' in options||
          (target.kind!=='metadata'&&!suffix.endsWith('?ref=main')))fail();
      }else{
        if(mode!=='write'||role==='witness'||
          !suffix.startsWith('/contents/')||
          suffix.includes('?')||target.kind==='metadata')fail();
        validatePayload(role,target.kind,options.body);
      }
      // The injected transport is the only I/O performed. No retry after
      // a possible remote write, no fallback to other repos on API errors.
      return await transport(url,options);
    }catch{fail();}
  }
  return Object.freeze({
    transport:guardedTransport,
    role,mode,repository:REPOS[role],
    grantsActualGithubPermissions:false,
    verifiesTokenScopes:false,
    producesSecrets:false,
    productionEnabled:false,
    freeSlotsCertified:false
  });
}
module.exports={REPOS,createKingsPrivateGithubRequestGuard};
