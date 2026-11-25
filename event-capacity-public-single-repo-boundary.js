'use strict';
// DRAFT: STRICT PUBLIC-REPO OUTPUT BOUNDARY. Code can live publicly; real
// driver/staff/event records, owner pins and keys must not be published by
// this adapter. An attacker can clone all public Git history. This module
// does not accept, validate or post encrypted private archives.
const REPO='Stinkesocke107/kings-logistics-automation';
const PATH='data/event-capacity/public-readiness.json';
const ERROR='Kings Event Capacity public-only storage boundary rejected content.';
const FIELDS=[
  'schemaVersion','repository','mode','releaseStatus',
  'confidentialEventDataPublished','ownerSigningKeyPublished',
  'humanApprovalRequired','realHistoricalCoverageCertified',
  'freeSlotsCertified','publicStatusOnly','realDataStorageConfigured',
  'productionActivated'
];
function fail(){throw new Error(ERROR);}
function exact(value,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).sort().join(',')!==fields.slice().sort().join(','))
    fail();
}
function publicReadiness(){
  return Object.freeze({
    schemaVersion:1,
    repository:REPO,
    mode:'PUBLIC_CODE_AND_ANONYMOUS_STATUS_ONLY',
    releaseStatus:'DRAFT_UNVERIFIED',
    confidentialEventDataPublished:false,
    ownerSigningKeyPublished:false,
    humanApprovalRequired:true,
    realHistoricalCoverageCertified:false,
    freeSlotsCertified:false,
    publicStatusOnly:true,
    realDataStorageConfigured:false,
    productionActivated:false
  });
}
function preparePublicReadinessArtifact(){
  return Object.freeze({
    path:PATH,
    content:JSON.stringify(publicReadiness(),null,2)+'\n',
    publicOnly:true,
    writePerformed:false,
    liveWorkflowChanged:false
  });
}
function validatePublicReadinessArtifact({repository,path,content}={}){
  if(repository!==REPO||path!==PATH||
    typeof content!=='string'||Buffer.byteLength(content,'utf8')>2048||
    content.length===0)fail();
  let parsed;
  try{parsed=JSON.parse(content);}catch{fail();}
  exact(parsed,FIELDS);
  const allowed=publicReadiness();
  for(const field of FIELDS){
    if(parsed[field]!==allowed[field])fail();
  }
  return Object.freeze({
    verified:true,publicOnly:true,
    confidentialDataAllowed:false,
    encryptedHistoricalPayloadAllowed:false,
    keyMaterialAllowed:false,
    realDataStorageConfigured:false,
    productionActivated:false,
    historicalCoverageCertified:false,
    freeSlotsCertified:false
  });
}
module.exports={
  publicReadiness,
  preparePublicReadinessArtifact,
  validatePublicReadinessArtifact
};
