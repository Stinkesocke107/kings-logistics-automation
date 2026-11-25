'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createEmptyHistoricalJournal,prepareHistoricalTransition,
  signHistoricalTransitionOffline,appendOwnerSignedHistoricalTransition}
  =require('../../event-capacity-historical-lifecycle-journal');
const {createEncryptedHistoricalArchive}
  =require('../../event-capacity-historical-encrypted-archive');
const {issueHistoricalArchivePinOffline}
  =require('../../event-capacity-historical-github-reader');
const {createPrivateHistoricalArchiveWriter}
  =require('../../event-capacity-historical-github-writer');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const REPO='kings-private-example/historical-decisions';
const TOKEN='synthetic-no-real-credentials-readwrite-private-token';
const SECRET='synthetic private encryption secret for test only and never production';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const DAY='2027-03-20T18:00:00.000Z';
function sha1(b){return crypto.createHash('sha1').update('blob '+b.length+'\0')
  .update(b).digest('hex');}
function setup(){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const ownerPublicKey=publicKey.export({type:'spki',format:'pem'});
  const ownerPrivateKey=privateKey.export({type:'pkcs8',format:'pem'});
  let journal=createEmptyHistoricalJournal({scope:SCOPE,at:'2027-03-01T00:00:00.000Z'});
  function append(action,date,reviewedAt){
    const payload=prepareHistoricalTransition({journal,scope:SCOPE,
      ownerPublicKey,expectedRevision:journal.revision,ref:'event:100',
      action,category:'Partner Convoy',departureAtUtc:date,reviewedAt,
      evidenceDigest:crypto.createHash('sha256').update('e'+journal.revision).digest('hex'),
      archiveDigest:crypto.createHash('sha256').update('a'+journal.revision).digest('hex')});
    const receipt=signHistoricalTransitionOffline({payload,ownerPrivateKey});
    journal=appendOwnerSignedHistoricalTransition({journal,scope:SCOPE,
      ownerPublicKey,receipt,expectedRevision:journal.revision});
  }
  append('accept',DAY,'2027-03-02T10:00:00.000Z');
  const beforeJournal=structuredClone(journal);
  const prior=createEncryptedHistoricalArchive({journal,scope:SCOPE,
    ownerPublicKey,encryptionSecret:SECRET});
  append('reschedule','2027-04-20T18:00:00.000Z','2027-04-01T10:00:00.000Z');
  const afterJournal=structuredClone(journal);
  const next=createEncryptedHistoricalArchive({journal,scope:SCOPE,
    ownerPublicKey,encryptionSecret:SECRET});
  function pin(checkpoint){return issueHistoricalArchivePinOffline({
    scope:SCOPE,checkpoint,issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey
  });}
  const previousOwnerReceipt=pin(prior.checkpoint);
  const nextOwnerReceipt=pin(next.checkpoint);
  const blobs=new Map();
  function install(archive){
    blobs.set('capacity-history/current.json',
      Buffer.from(JSON.stringify({version:1,manifest:archive.manifest})));
    for(let i=0;i<archive.manifest.parts.length;i++){
      const part=archive.manifest.parts[i];
      blobs.set('capacity-history/segments/'+part.ciphertextDigest+'.bin',
        Buffer.from(archive.parts[i],'base64'));
    }
  }
  install(prior.archive);
  const calls=[];
  let publicRepo=false,conflict=false,failAfterIndexWrite=false,denySegmentCreate=false;
  function encoded(path,data){
    return {type:'file',path,sha:sha1(data),size:data.length,
      encoding:'base64',content:data.toString('base64')};
  }
  function transport(url,opts){
    const prefix='https://api.github.com/repos/'+REPO;
    assert.ok(url.startsWith(prefix));
    assert.ok(['GET','PUT'].includes(opts.method));
    assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
    const suffix=url.slice(prefix.length);
    calls.push({method:opts.method,path:suffix});
    if(suffix===''){
      if(opts.method!=='GET')return Response.json({bad:true},{status:400});
      return Response.json({full_name:REPO,private:!publicRepo,
        archived:false,disabled:false,default_branch:'main'});
    }
    const m=suffix.match(/^\/contents\/(capacity-history\/[a-zA-Z0-9/_.-]+)(?:\?ref=main)?$/);
    if(!m)return Response.json({message:'unavailable'},{status:404});
    const path=m[1];
    if(opts.method==='GET'){
      const b=blobs.get(path);
      return b?Response.json(encoded(path,b)):
        Response.json({message:'not found'},{status:404});
    }
    const payload=JSON.parse(opts.body);
    assert.equal(payload.branch,'main');
    const b=Buffer.from(payload.content,'base64');
    if(path==='capacity-history/current.json'){
      const old=blobs.get(path);
      if(conflict||!old||payload.sha!==sha1(old))
        return Response.json({message:'content conflict'},{status:409});
      blobs.set(path,b);
      if(failAfterIndexWrite)return Response.json({message:'ambiguous failure'},{status:500});
      return Response.json({content:{sha:sha1(b)},commit:{sha:'e'.repeat(40)}});
    }
    if(denySegmentCreate)return Response.json({message:'conflict'},{status:409});
    if(!path.startsWith('capacity-history/segments/')||
      blobs.has(path)||'sha' in payload)
      return Response.json({message:'already exists'},{status:409});
    blobs.set(path,b);
    return Response.json({content:{sha:sha1(b)},commit:{sha:'d'.repeat(40)}},
      {status:201});
  }
  const writer=(opts={})=>createPrivateHistoricalArchiveWriter({
    repository:REPO,token:TOKEN,scope:SCOPE,ownerPublicKey,
    previousOwnerReceipt,nextOwnerReceipt,encryptionSecret:SECRET,
    transport,nowMs:()=>NOW,...opts});
  return {writer,prior,next,previousOwnerReceipt,nextOwnerReceipt,
    beforeJournal,afterJournal,ownerPrivateKey,ownerPublicKey,
    calls,blobs,transport,setPublic:()=>{publicRepo=true;},
    setConflict:()=>{conflict=true;},
    setAmbiguous:()=>{failAfterIndexWrite=true;},
    setDenySegments:()=>{denySegmentCreate=true;}};
}
module.exports={setup};
