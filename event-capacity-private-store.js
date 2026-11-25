'use strict';
// DEVELOPMENT-ONLY protected filesystem store. NOT an HA production backend.
// The private directory must exist outside the public Git checkout.
// A separately protected monotonic revision, backup/restore and erasure service
// remain mandatory before deploying for actual Kings staff decisions.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createEmptyLedger,applyDecision,sealLedger,unsealLedger}=require('./event-capacity-decision-ledger');
const FILENAME='event-capacity-ledger.encrypted.json';
const LOCK='event-capacity-ledger.lock';
const ERROR='Kings Event Capacity private storage unavailable or unsafe.';

function fail(){throw new Error(ERROR);}
function restrictedFile(filename){
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||(process.platform!=='win32'&&(st.mode&0o077)!==0))fail();
}
function privateDir(directory,repoRoot){
  if(typeof directory!=='string'||!path.isAbsolute(directory))fail();
  const repo=fs.realpathSync(repoRoot);
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
    (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail();
  const real=fs.realpathSync(directory),relative=path.relative(repo,real);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail();
  return real;
}
function createLocalPrivateStore({directory,secret,scope,repositoryRoot=__dirname}={}){
  // An invalid key or scope must fail before the first file operation.
  sealLedger(createEmptyLedger(scope,'2027-01-01T00:00:00Z'),secret);
  const dir=privateDir(directory,repositoryRoot);
  const file=path.join(dir,FILENAME),lock=path.join(dir,LOCK);
  function read(){
    if(!fs.existsSync(file))fail();
    restrictedFile(file);
    let container;
    try{container=JSON.parse(fs.readFileSync(file,'utf8'));}
    catch{fail();}
    try{return unsealLedger(container,secret,scope);}catch{fail();}
  }
  function writeAtomic(state){
    const content=Buffer.from(JSON.stringify(sealLedger(state,secret))+'\n','utf8');
    const temp=path.join(dir,'.event-capacity-'+crypto.randomBytes(16).toString('hex')+'.tmp');
    let fd=null;
    try{
      fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
      fs.writeFileSync(fd,content);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      if(fs.existsSync(file))restrictedFile(file);
      fs.renameSync(temp,file);
      if(process.platform!=='win32'){
        const directoryFd=fs.openSync(dir,fs.constants.O_RDONLY);
        try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}
      }
    }finally{
      if(fd!==null)fs.closeSync(fd);
      try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')fail();}
    }
  }
  function withLock(operation){
    let fd=null,owned=false;
    try{
      fd=fs.openSync(lock,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
      owned=true;
      fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      return operation();
    }catch(e){
      if(e&&e.message===ERROR)throw e;
      fail();
    }finally{
      if(fd!==null)fs.closeSync(fd);
      // Do not steal another process's lock on failure to acquire.
      // Stale locks require a separate, manual recovery procedure.
      if(owned){
        try{fs.unlinkSync(lock);}catch{fail();}
      }
    }
  }
  function initialize(at){
    return withLock(()=>{
      if(fs.existsSync(file))fail();
      const state=createEmptyLedger(scope,at);
      writeAtomic(state);
      return {revision:0};
    });
  }
  function commit(command,actor,at){
    if(!command||!Number.isSafeInteger(command.expectedRevision))fail();
    return withLock(()=>{
      const current=read();
      if(current.revision!==command.expectedRevision)fail();
      const next=applyDecision(current,command,actor,at);
      writeAtomic(next);
      return {revision:next.revision};
    });
  }
  function metadata(){
    const state=read();
    return {revision:state.revision,updatedAt:state.updatedAt};
  }
  // No general plaintext export or public report endpoint.
  return Object.freeze({initialize,commit,metadata});
}
module.exports={createLocalPrivateStore};
