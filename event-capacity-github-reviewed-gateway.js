'use strict';
// Safe assembly point: the reviewed-decision code receives reports ONLY
// through the authenticated, fixed-repository GitHub Actions reader.
// Not imported by the scheduled bot worker. No automatic decision writes.
const {createAuthenticatedKingsSource}
  =require('./event-capacity-github-authenticated-source');
const {stageReviewedDecision}=require('./event-capacity-reviewed-staging');
const {commitOwnerApprovedDecision}
  =require('./event-capacity-owner-controlled-commit');
const ERROR='Kings Event Capacity authenticated review gateway unavailable.';
function fail(){throw new Error(ERROR);}
function createAuthenticatedKingsReviewGateway({
  githubToken,githubTransport=fetch,
  protectedVault,client,config,scope,reviewSecret,
  ownerReceipt,ownerPublicKey,nowMs=()=>Date.now()
}={}){
  if(!protectedVault||
    typeof protectedVault.read!=='function'||
    typeof protectedVault.commitDecision!=='function'||
    !client||typeof reviewSecret!=='string'||
    reviewSecret.length<32||typeof nowMs!=='function')fail();
  let readVerifiedSource;
  try{
    readVerifiedSource=createAuthenticatedKingsSource({
      githubToken,transport:githubTransport,nowMs
    });
  }catch{fail();}
  const common={protectedVault,client,config,scope};
  async function prepare({proposal,challenge,reviewMessageId}={}){
    try{
      return await stageReviewedDecision({
        ...common,readVerifiedSource,proposal,challenge,
        reviewMessageId,secret:reviewSecret,nowMs:nowMs()
      });
    }catch{fail();}
  }
  async function commitWithOfflineOwnerPermit({
    permit,proposal,challenge,reviewMessageId
  }={}){
    try{
      return await commitOwnerApprovedDecision({
        ...common,readVerifiedSource,
        ownerReceipt,ownerPublicKey,reviewSecret,
        permit,proposal,challenge,reviewMessageId,nowMs:nowMs()
      });
    }catch{fail();}
  }
  return Object.freeze({prepare,commitWithOfflineOwnerPermit});
}
module.exports={createAuthenticatedKingsReviewGateway};
