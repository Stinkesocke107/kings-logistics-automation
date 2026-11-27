'use strict';
// Strict, dependency-free filesystem boundary for both preview and APPLY.
// The independent recovery-safety-check remains mandatory; this protects
// core-recovery.js even if it is run directly or the filesystem changes later.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const FORBIDDEN_COMPONENTS=new Set([
  '.git','node_modules','backup-staging','restore-source',
  'restore-verification','restore-preview','recovery-staging'
]);
const FORBIDDEN_FILES=new Set([
  'recovery-plan.json','recovery-result.json'
]);
function fail(){throw Error('Kings recovery file path or source unverified');}
function safeRelative(value){
  if(typeof value!=='string'||value!==value.trim()||!value||
     /[\\\0\r\n]/.test(value)||path.posix.isAbsolute(value)||
     /^[a-z]:/i.test(value)||path.posix.normalize(value)!==value)
    fail();
  const parts=value.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||
    FORBIDDEN_COMPONENTS.has(part.toLowerCase())||
    /^\.env(?:\.|$)/i.test(part))||
    FORBIDDEN_FILES.has(value.toLowerCase())||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(value)||
    /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i.test(value))
    fail();
  return value;
}
function safeTarget(root,relative){
  const clean=safeRelative(relative),base=path.resolve(root);
  const target=path.resolve(base,clean);
  if(target===base||!target.startsWith(base+path.sep))fail();
  // Never trust a symlinked root itself: otherwise all individually safe
  // children could still resolve outside the intended isolated source/tree.
  let baseStat;
  try{baseStat=fs.lstatSync(base);}catch{fail();}
  if(baseStat.isSymbolicLink()||!baseStat.isDirectory())fail();
  // Detect links even when dangling: existsSync would silently miss them.
  for(let i=0,parts=clean.split('/'),at=base;i<parts.length;i++){
    at=path.join(at,parts[i]);
    let stat;
    try{stat=fs.lstatSync(at);}catch(error){
      if(error?.code==='ENOENT')continue;
      throw error;
    }
    if(stat.isSymbolicLink()||
       (i<parts.length-1&&!stat.isDirectory())||
       (i===parts.length-1&&!stat.isFile()))
      fail();
  }
  return target;
}
function assertManifest(files){
  if(!Array.isArray(files)||files.length===0||files.length>50000)fail();
  const seen=new Set();
  for(const file of files){
    if(!file||typeof file!=='object'||Array.isArray(file))fail();
    const name=safeRelative(file.path);
    if(seen.has(name)||!Number.isSafeInteger(file.size)||file.size<0||
       !/^[a-f0-9]{64}$/i.test(file.sha256||''))fail();
    seen.add(name);
  }
  // Cannot safely restore both a regular file and one of its descendants.
  for(const name of seen){
    let parent=path.posix.dirname(name);
    while(parent!=='.'){
      if(seen.has(parent))fail();
      parent=path.posix.dirname(parent);
    }
  }
  return true;
}
function verifiedSource(root,fileInfo){
  const source=safeTarget(root,fileInfo.path);
  let stat;
  try{stat=fs.lstatSync(source);}catch{fail();}
  if(!stat.isFile()||stat.size!==fileInfo.size)fail();
  const actual=crypto.createHash('sha256')
    .update(fs.readFileSync(source)).digest('hex');
  if(actual!==String(fileInfo.sha256).toLowerCase())fail();
  return source;
}
module.exports={safeRelative,safeTarget,assertManifest,verifiedSource};
