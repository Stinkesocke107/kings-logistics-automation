'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createEmptyHistoricalJournal,prepareHistoricalTransition,
  signHistoricalTransitionOffline,appendOwnerSignedHistoricalTransition}=
  require('../event-capacity-historical-lifecycle-journal');
const {createEncryptedHistoricalArchive}=require('../event-capacity-historical-encrypted-archive');
const {issueHistoricalArchivePinOffline,verifyHistoricalArchivePin,
  createPrivateHistoricalArchiveReader}=require('../event-capacity-historical-github-reader');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const REPO='kings-private-example/historical-decisions';
const TOKEN='synthetic-token-for-private-repo-scoped-contents-read';
const SECRET='synthetic high entropy encryption secret for local tests only';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function setup(){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const ownerPublicKey=publicKey.export({format:'pem',type:'spki'});
  const ownerPrivateKey=privateKey.export({format:'pem',type:'pkcs8'});
  let journal=createEmptyHistoricalJournal({scope:SCOPE,at:'2027-03-01T00:00:00.000Z'});
  function add(ref,action,departure,reviewedAt){
    const payload=prepareHistoricalTransition({journal,scope:SCOPE,ownerPublicKey,
      expectedRevision:journal.revision,ref,action,category:'Partner Convoy',
      departureAtUtc:departure,reviewedAt,
      evidenceDigest:crypto.createHash('sha256').update('e'+journal.revision).digest('hex'),
      archiveDigest:crypto.createHash('sha256').update('a'+journal.revision).digest('hex')});
    journal=appendOwnerSignedHistoricalTransition({journal,scope:SCOPE,ownerPublicKey,
      receipt:signHistoricalTransitionOffline({payload,ownerPrivateKey}),
      expectedRevision:journal.revision});
  }
  add('event:100','accept','2027-03-20T18:00:00.000Z','2027-03-02T10:00:00.000Z');
  add('event:100','reschedule','2027-04-20T18:00:00.000Z','2027-04-01T10:00:00.000Z');
  const {archive,checkpoint}=createEncryptedHistoricalArchive({
    journal,scope:SCOPE,ownerPublicKey,encryptionSecret:SECRET});
  const receipt=issueHistoricalArchivePinOffline({scope:SCOPE,checkpoint,
    issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey});
  const index={version:1,manifest:archive.manifest};
  const blobs=new Map([
    ['capacity-history/current.json',Buffer.from(JSON.stringify(index))],
    ...archive.manifest.parts.map((p,i)=>[
      'capacity-history/segments/'+p.ciphertextDigest+'.bin',
      Buffer.from(archive.parts[i],'base64')])
  ]);
  const urls=[];
  function metadata(){return {full_name:REPO,private:true,
    archived:false,disabled:false,default_branch:'main'};}
  let indexFetch=0;
  let transform=(path,record)=>record;
  let repoMetadata=metadata();
  async function transport(url,opts){
    urls.push({url,method:opts.method,authorization:opts.headers?.Authorization});
    assert.equal(opts.method,'GET');
    const prefix='https://api.github.com/repos/'+REPO;
    assert.ok(url.startsWith(prefix));
    if(url===prefix)return Response.json(repoMetadata);
    const m=url.slice(prefix.length).match(/^\/contents\/(capacity-history\/[a-zA-Z0-9/_.-]+)\?ref=main$/);
    if(!m)return new Response('missing',{status:404});
    const path=m[1],data=blobs.get(path);
    if(!data)return new Response('not found',{status:404});
    if(path==='capacity-history/current.json')indexFetch++;
    const sha=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
    const record={type:'file',path,sha,size:data.length,encoding:'base64',
      content:data.toString('base64'),name:path.split('/').at(-1),
      download_url:null,html_url:'https://github.com/PRIVATE/REDACTED'};
    return Response.json(transform(path,record));
  }
  const reader=(args={})=>createPrivateHistoricalArchiveReader({
    repository:REPO,token:TOKEN,scope:SCOPE,ownerPublicKey,
    ownerReceipt:receipt,encryptionSecret:SECRET,transport,
    nowMs:()=>NOW,...args});
  return {reader,journal,archive,checkpoint,receipt,ownerPrivateKey,
    ownerPublicKey,urls,blobs,setRepo:v=>{repoMetadata=v;},
    setTransform:fn=>{transform=fn;},get indexReads(){return indexFetch;}};
}
test('Reads two encrypted segments only from a verified PRIVATE repo with an owner-signed checkpoint',async()=>{
  const x=setup();const got=await x.reader().read();
  assert.deepEqual(got.journal,x.journal);
  assert.equal(x.indexReads,2);
  assert.equal(got.repositoryVerifiedPrivate,true);
  assert.equal(got.encryptedArchiveIntegrityVerified,true);
  assert.equal(got.sourceEvidenceAuthenticityVerified,false);
  assert.equal(got.historicalCoverageCertified,false);
  assert.equal(got.freeSlotsCertified,false);
  assert.ok(x.urls.every(v=>v.method==='GET'));
  assert.ok(x.urls.every(v=>v.authorization==='Bearer '+TOKEN));
});
test('Unauthenticated owner receipt is refused before any remote API request',async()=>{
  const x=setup();const damaged=structuredClone(x.receipt);
  damaged.payload.archiveDigest='0'.repeat(64);
  await assert.rejects(x.reader({ownerReceipt:damaged}).read());
  assert.equal(x.urls.length,0);
  assert.throws(()=>verifyHistoricalArchivePin({receipt:damaged,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW}));
});
test('Public or misconfigured GitHub repository metadata cannot expose archive',async()=>{
  const x=setup();x.setRepo({full_name:REPO,private:false,
    archived:false,disabled:false,default_branch:'main'});
  await assert.rejects(x.reader().read());
  assert.equal(x.indexReads,0);
  assert.throws(()=>x.reader({repository:'Stinkesocke107/kings-logistics-automation'}));
  assert.throws(()=>x.reader({repository:'abc/../private'}));
  assert.throws(()=>x.reader({token:'weak'}));
});
test('Second manifest fetch detects changes while GitHub parts are read',async()=>{
  const x=setup();let n=0;
  x.setTransform((path,record)=>{
    if(path==='capacity-history/current.json'&&++n===2){
      const content=Buffer.from(JSON.stringify({version:1,manifest:{
        ...x.archive.manifest,revision:999
      }}));
      return {...record,content:content.toString('base64'),size:content.length,
        sha:crypto.createHash('sha1').update('blob '+content.length+'\0').update(content).digest('hex')};
    }
    return record;
  });
  await assert.rejects(x.reader().read());
  assert.equal(x.indexReads,2);
});
test('Wrong encrypted part, wrong SHA and wrong source archive key all fail closed',async()=>{
  const x=setup();
  x.setTransform((path,record)=>path.endsWith('.bin')?
    {...record,sha:'0'.repeat(40)}:record);
  await assert.rejects(x.reader().read());
  const y=setup();await assert.rejects(y.reader({encryptionSecret:'different long secret from attacker'}).read());
  const z=setup();z.setTransform((path,record)=>path.endsWith('.bin')?
    {...record,content:Buffer.from('wrong').toString('base64')}:record);
  await assert.rejects(z.reader().read());
});
test('Pinned old or forged archive revision cannot be read even when encrypted objects exist',async()=>{
  const x=setup();
  const oldReceipt=issueHistoricalArchivePinOffline({scope:SCOPE,
    checkpoint:{...x.checkpoint,revision:x.checkpoint.revision-1},
    issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey:x.ownerPrivateKey});
  await assert.rejects(x.reader({ownerReceipt:oldReceipt}).read());
  const futureReceipt=issueHistoricalArchivePinOffline({scope:SCOPE,
    checkpoint:{...x.checkpoint,revision:x.checkpoint.revision+1},
    issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey:x.ownerPrivateKey});
  await assert.rejects(x.reader({ownerReceipt:futureReceipt}).read());
});
test('No bearer tokens or private source contents in error messages',async()=>{
  const x=setup();
  x.setTransform((path,record)=>{if(path.endsWith('.bin'))throw Error(TOKEN+' secret SOURCE');return record;});
  await assert.rejects(x.reader().read(),err=>{
    assert.doesNotMatch(String(err),/synthetic-token|secret SOURCE/);
    return true;
  });
});
