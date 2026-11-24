'use strict';
// Private read-only checklist proposal, never writes, assigns, publishes or approves.
// Only attested Event Capacity adapter snapshots may be used by the protected host.
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity preparation input unverified.';
const REF=/^(?:event|thread):[A-Za-z0-9_-]{1,100}$/;
const ACCEPTED=new Set(['Scheduled','Rescheduled','Completed']);
const TEMPLATES=Object.freeze({
  'Kings Convoy':Object.freeze([
    ['approval','Official Kings event acceptance',true],
    ['time','Verified meeting and departure times',true],
    ['route','Confirmed route and parking',true],
    ['publication','Official event publication',true],
    ['coordination','Event team coordination',true],
    ['convoy-control','Convoy control arrangements',false],
    ['media','Media coverage',false],
    ['assets','Approved event graphics',false],
    ['invitations','Partner and public invitations',false]
  ]),
  'Partner Convoy':Object.freeze([
    ['approval','Kings event participation accepted',true],
    ['time','Verified meeting and departure times',true],
    ['slot','Confirmed Kings parking or event slot',true],
    ['route','Verified official route information',true],
    ['coordination','Coordinator assigned for participation',false],
    ['media','Media coverage if arranged',false],
    ['publication','Kings participation announcement if approved',false]
  ]),
  'External Convoy':Object.freeze([
    ['approval','Kings participation accepted',true],
    ['time','Verified meeting and departure times',true],
    ['slot','Verified Kings participation and meeting place',true],
    ['route','Official route information',false],
    ['publication','Optional Kings event announcement',false]
  ])
});
const FACTS=Object.freeze({
  approval:'approved',time:'times',route:'route',slot:'slot',
  publication:'publication',coordination:'coordination',
  'convoy-control':'convoyControl',media:'media',
  assets:'assets',invitations:'invitations'
});
const MILESTONES=new Set([
  'Kings Anniversary','Partnership Anniversary','Special Kings Event',
  'Special Collaboration','Other Milestone'
]);
function fail(){throw new Error(ERROR);}
function eventRef(event){
  const id=String(event?.eventId||'').trim(),thread=String(event?.threadId||'').trim();
  const r=id?'event:'+id:thread?'thread:'+thread:null;
  if(!r||!REF.test(r))fail();
  return r;
}
function milestoneTag(item){
  if(!item)return null;
  if(!item.verified||!MILESTONES.has(item.type)||
    typeof item.evidenceRef!=='string'||!item.evidenceRef.trim())return null;
  if(item.type==='Other Milestone'&&
    (typeof item.name!=='string'||!item.name.trim()||item.name.length>80))return null;
  return {type:item.type,name:item.type==='Other Milestone'?item.name:item.type};
}
function proposedChecklist(event,{
  sourceVerified=false,existingTasks=[],verifiedFacts={},milestone=null,
  includeCompleted=false,criticalConflict=false
}={}){
  if(!event||typeof event!=='object'||Array.isArray(event)||
    !Array.isArray(existingTasks)||!verifiedFacts||typeof verifiedFacts!=='object')fail();
  const ref=eventRef(event);
  if(!ACCEPTED.has(event.status)||event.statusVerified!==true||
    event.eventTypeVerified!==true||!TEMPLATES[event.eventType])fail();
  // Historical completed records remain searchable but are not assigned new
  // operational tasks unless Leadership deliberately reviews their migration.
  if(event.status==='Completed'&&!includeCompleted)return {
    eventRef:ref,archived:true,status:'Historical',items:[],createProposals:[],
    warnings:['Historical Completed is not evidence of attendance']
  };
  const fresh=sourceVerified===true;
  const tag=milestoneTag(milestone);
  const defs=[...TEMPLATES[event.eventType]];
  if(tag){
    defs.push(['milestone-details','Verify milestone wording and dates',true]);
    defs.push(['milestone-assets','Optional milestone media and graphics',false]);
  }
  const items=[],createProposals=[];
  let anyProgress=false,requiredAttention=false,allRequired=true;
  for(const [code,title,required] of defs){
    const matches=existingTasks.filter(x=>x?.eventRef===ref&&x?.code===code);
    if(matches.length>1){requiredAttention=true;allRequired=false;}
    const task=matches.length===1?matches[0]:null;
    const proof=verifiedFacts[FACTS[code]||code];
    const factVerified=fresh&&proof&&proof.verified===true&&
      typeof proof.evidenceRef==='string'&&proof.evidenceRef.length>0&&
      proof.evidenceRef.length<=256;
    const waived=!!(task?.waiver&&typeof task.waiver.evidenceRef==='string'&&
      task.waiver.evidenceRef.trim()&&
      (!required||['Event Leadership','CEO'].includes(task.waiver.approvedByRole)));
    const done=!!(task?.status==='Done'&&(task.proof||waived))||!!factVerified;
    const blocked=required&&(
      code==='time'&&(event.departureVerified!==true||
        timestamp(event.departureAtUtc)===null||
        timestamp(event.meetingAtUtc)===null)
      ||code==='approval'&&event.statusVerified!==true
    );
    if(done||task&&task.status!=='Open')anyProgress=true;
    if(required&&!done)allRequired=false;
    if(required&&blocked)requiredAttention=true;
    const row={eventRef:ref,code,title,required,
      status:done?'Done':task?.status||'Open',
      proof:done?(task?.proof?'task':'verified-source'):null,
      existingTaskId:task?.id||null,
      blocked,waived};
    items.push(row);
    if(!task&&!done)createProposals.push({
      id:(ref+'__'+code).slice(0,128),eventRef:ref,code,title,required
    });
  }
  if(!fresh||event.dataConflict===true||criticalConflict===true||
    matchesConflict(existingTasks,ref))requiredAttention=true;
  const status=requiredAttention?'Needs Attention':allRequired?'Ready':
    anyProgress?'In Progress':'Not Started';
  return {
    eventRef:ref,archived:false,category:event.eventType,
    status,sourceVerified:fresh,milestone:tag,
    items,createProposals,warnings:!fresh?['Source Data Outdated']:[],
    // Creation is only a PROPOSAL; verified authorization and private
    // transaction must occur before any task becomes real.
    readOnly:true
  };
}
function matchesConflict(tasks,ref){
  return tasks.some(t=>t?.eventRef===ref&&
    (t.status==='Reopened'||t.status==='On Hold'&&t.required===true));
}
function planChecklists(events,opts={}){
  if(!Array.isArray(events)||events.length>50000||!Array.isArray(opts.existingTasks||[]))fail();
  const results=[],issues=[],counts=new Map();
  // First collect all identities. If two source records claim the same event,
  // neither is eligible for confident task creation until reconciled.
  for(const event of events){
    if(!event||!ACCEPTED.has(event.status)||event.statusVerified!==true)continue;
    try{const ref=eventRef(event);counts.set(ref,(counts.get(ref)||0)+1);}
    catch{issues.push('Invalid event identity');}
  }
  const processed=new Set();
  for(const event of events){
    if(!event||!ACCEPTED.has(event.status)||event.statusVerified!==true)continue;
    let ref;
    try{ref=eventRef(event);}catch{continue;}
    if(processed.has(ref))continue;
    processed.add(ref);
    if(counts.get(ref)!==1){issues.push('Duplicate event identity');continue;}
    try{
      results.push(proposedChecklist(event,{...opts,
        milestone:opts.milestones?.[ref]||null}));
    }catch{issues.push('Unverified event '+ref);}
  }
  return {readOnly:true,results,issues,sourceVerified:opts.sourceVerified===true};
}
module.exports={proposedChecklist,planChecklists,milestoneTag,TEMPLATES};
