'use strict';
// Offline-only assembly of two separately permissioned GitHub private repos.
// Not connected to live Discord/GitHub workflows; no secret provisioning.
// The witness provides tamper-evident cross-repository state, not absolute
// irreversibility if BOTH private GitHub histories are maliciously rewound.
const {createPrivateGitHubCheckpoint}
  =require('./event-capacity-github-private-checkpoint');
const {createPrivateGitHubLedgerVault}
  =require('./event-capacity-github-private-vault');
const ERROR='Kings Event Capacity private GitHub storage configuration unsafe.';
function fail(){throw new Error(ERROR);}
function createGithubOnlyPrivateDecisionStorage({
  dataRepository,checkpointRepository,
  dataToken,checkpointToken,ledgerSecret,checkpointSecret,
  scope,transport=fetch
}={}){
  if(typeof dataRepository!=='string'||
    typeof checkpointRepository!=='string'||
    dataRepository.toLowerCase()===checkpointRepository.toLowerCase()||
    typeof dataToken!=='string'||typeof checkpointToken!=='string'||
    dataToken===checkpointToken||
    typeof ledgerSecret!=='string'||typeof checkpointSecret!=='string'||
    ledgerSecret===checkpointSecret)fail();
  try{
    const checkpoint=createPrivateGitHubCheckpoint({
      repository:checkpointRepository,dataRepository,
      token:checkpointToken,dataToken,signingSecret:checkpointSecret,
      scope,transport
    });
    const vault=createPrivateGitHubLedgerVault({
      repository:dataRepository,token:dataToken,secret:ledgerSecret,
      scope,anchor:checkpoint,transport
    });
    return Object.freeze({vault,checkpoint});
  }catch{fail();}
}
module.exports={createGithubOnlyPrivateDecisionStorage};
