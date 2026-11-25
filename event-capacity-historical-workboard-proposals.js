'use strict';
// DRAFT / READ-ONLY: propose private Event Workboard tasks for audited history
// discrepancies. Never execute a task command, authenticate an actor, create
// a Discord ticket, reopen completed work, or infer available Event slots.
const {validate}=require('./event-capacity-workboard');
const ERROR='Kings Event Capacity historical workboard proposal invalid.';
const KEY=/^capacity-crosscheck:[a-f0-9]{40}$/;
const LABELS=Object.freeze({
  'historical-signed-event-not-in-current-source':'Review signed Event missing from current source',
  'current-accepted-event-without-signed-history':'Verify historical acceptance evidence',
  'current-source-cancelled-without-signed-cancellation':'Review unverified historical cancellation',
  'current-source-completed-without-signed-completion':'Verify historical completion evidence',
  'signed-history-status-conflict':'Resolve conflicting historical Event status',
  'signed-history-category-conflict':'Resolve conflicting Event classification',
  'signed-history-departure-conflict':'Resolve conflicting UTC departure',
  'signed-history-ambiguous-identity':'Resolve duplicate signed Event identities',
  'current-source-duplicate-identity':'Resolve duplicated current source identity',
  'current-source-unknown-status':'Review unknown current Event status',
  'current-source-missing-verified-departure':'Verify current source departure time',
  'current-source-missing-verified-category':'Verify current source category',
  'legacy-event-requires-historical-review':'Review legacy Event evidence'
});
const URGENT=new Set(['signed-history-status-conflict',
  'signed-history-category-conflict','signed-history-departure-conflict',
  'signed-history-ambiguous-identity','current-source-duplicate-identity']);
function fail(){throw new Error(ERROR);}
function proposeHistoricalWorkboardTasks({audit,workboard,scope}={}){
  try{
    validate(workboard,scope);
    if(!audit||audit.version!==1||audit.visibility!=='PRIVATE_ONLY'||
      audit.readOnly!==true||audit.signedJournalIntegrityVerified!==true||
      audit.currentSourceStructureChecked!==true||
      audit.sourceProvenanceTrustedByThisPureFunction!==false||
      audit.historicalCoverageCertified!==false||
      audit.freeSlotsCertified!==false||audit.calendarMutated!==false||
      audit.staffDecisionsCommitted!==false||
      !Array.isArray(audit.issues)||audit.issues.length>10000||
      !audit.counts||audit.counts.newCrosscheckIssues!==audit.issues.length)
      fail();
    const proposed=[],alreadyTracked=[],seen=new Set();
    for(const issue of audit.issues){
      const {taskKey,reason,priority}=issue||{};
      if(!KEY.test(taskKey)||!Object.hasOwn(LABELS,reason)||
        priority!==(URGENT.has(reason)?'Urgent':'Review')||
        issue.humanReviewRequired!==true||
        issue.autoResolved!==false||issue.capacityChanged!==false||
        seen.has(taskKey))fail();
      seen.add(taskKey);
      const old=workboard.tasks[taskKey];
      if(old){
        if(old.id!==taskKey||old.eventRef!==taskKey||
          old.code!==reason)fail();
        alreadyTracked.push(Object.freeze({taskId:taskKey,
          status:old.status,reason}));
        continue;
      }
      if(Object.values(workboard.tasks).some(t=>
        t.eventRef===taskKey&&t.code===reason))fail();
      proposed.push(Object.freeze({
        taskId:taskKey,eventRef:taskKey,code:reason,
        title:LABELS[reason],required:false,
        priority,leadershipReviewRecommended:priority==='Urgent',
        proposalOnly:true,requiresVerifiedHumanActor:true
      }));
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:'Human Review Task Proposals',
      workboardRevisionRead:workboard.revision,
      proposedCount:proposed.length,alreadyTrackedCount:alreadyTracked.length,
      proposals:proposed,alreadyTracked,
      commandsReadyToExecute:false,
      staffTasksCreated:0,staffTasksReopened:0,
      humanAuthorizationRequired:true,
      sourceProvenanceIndependentlyVerifiedHere:false,
      historicalCoverageCertified:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={proposeHistoricalWorkboardTasks};
