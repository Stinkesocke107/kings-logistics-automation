'use strict';
// Read-only snapshot bundle for Kings historical audit and private Event
// Workboard proposals. No trusted Discord actor, commands, writes, completion
// approval or rollback recovery is possible from this module.
const {isDeepStrictEqual}=require('node:util');
const {validate}=require('./event-capacity-workboard');
const {proposeHistoricalWorkboardTasks}
  =require('./event-capacity-historical-workboard-proposals');
const ERROR='Kings Event Capacity private historical task snapshot changed.';
function fail(){throw new Error(ERROR);}
function createStableHistoricalWorkboardReview({
  readHistoricalCrosscheck,readWorkboard,scope
}={}){
  if(typeof readHistoricalCrosscheck!=='function'||
    typeof readWorkboard!=='function')fail();
  async function read(){
    try{
      const before=await readWorkboard();
      validate(before,scope);
      const audit=await readHistoricalCrosscheck();
      const after=await readWorkboard();
      validate(after,scope);
      if(!isDeepStrictEqual(before,after))fail();
      const proposed=proposeHistoricalWorkboardTasks({
        audit,workboard:before,scope
      });
      if(proposed.staffTasksCreated!==0||
        proposed.staffTasksReopened!==0||
        proposed.commandsReadyToExecute!==false||
        proposed.freeSlotsCertified!==false)fail();
      return Object.freeze({
        version:1,visibility:'PRIVATE_ONLY',readOnly:true,
        state:'Historical Review Workboard Snapshot',
        crosscheckIssueCount:audit.counts.newCrosscheckIssues,
        workboardRevisionRead:before.revision,
        proposedCount:proposed.proposedCount,
        alreadyTrackedCount:proposed.alreadyTrackedCount,
        proposals:proposed.proposals,
        alreadyTracked:proposed.alreadyTracked,
        currentSourceAuthenticatedByThisBundle:false,
        privateWorkboardStorageAuthenticatedByThisBundle:false,
        workboardSnapshotConsistent:true,
        crosscheckReadConsistentWithProvidedAdapter:true,
        commandsReadyToExecute:false,humanAuthorizationRequired:true,
        staffTasksCreated:0,staffTasksReopened:0,
        eventStatusesChanged:false,
        historicalCoverageCertified:false,freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({read});
}
module.exports={createStableHistoricalWorkboardReview};
