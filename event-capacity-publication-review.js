'use strict';
// Publication Impact Review: PRIVATE, pure, versioned; NO public writes.
// Only authorized publishers can actually edit external/Discord posts.
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity publication review validation failed.';
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const FIELDS=new Set(['date','meeting','departure','end','route','parking','logo','important-info','asset']);
const STATES=new Set(['Update Required','Needs Verification','No Update Needed','Verified Updated']);
const ACTORS=new Set(['Event Coordination','Event Leadership','CEO']);
function fail(){throw new Error(ERROR);}
function time(v){const x=timestamp(v);if(x===null)fail();return new Date(x).toISOString();}
function text(v,max=256){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))fail();return v.trim();}
function role(actor){
  if(!actor||actor.source!=='trusted-server-gateway'||
    !(/^\d{5,25}$/).test(String(actor.id||''))||
    !Array.isArray(actor.verifiedRoles))fail();
  const selected=['CEO','Event Leadership','Event Coordination']
    .find(x=>ACTORS.has(x)&&actor.verifiedRoles.includes(x));
  if(!selected)fail();return selected;
}
function empty(eventRef,at){
  if(!ID.test(eventRef||'')||!(/^(?:event|thread):/).test(eventRef))fail();
  return {version:1,eventRef,revision:0,cycle:0,status:'None',
    createdAt:time(at),updatedAt:time(at),changeKeys:[],
    items:{},summaries:[],activity:[]};
}
function validate(s){
  if(!s||s.version!==1||!ID.test(s.eventRef||'')||
    !Number.isSafeInteger(s.revision)||s.revision<0||
    !Number.isSafeInteger(s.cycle)||s.cycle<0||
    !['None','Open','Closed'].includes(s.status)||
    !s.items||typeof s.items!=='object'||Array.isArray(s.items)||
    !Array.isArray(s.summaries)||!Array.isArray(s.activity)||
    !Array.isArray(s.changeKeys)||s.activity.length!==s.revision||
    timestamp(s.createdAt)===null||timestamp(s.updatedAt)===null||
    Object.keys(s.items).length>10000||s.summaries.length>1000)fail();
  for(const [id,item] of Object.entries(s.items)){
    if(!ID.test(id)||!item||!STATES.has(item.status)||
      typeof item.platform!=='string'||!item.platform||
      typeof item.assetVersion!=='string'||!item.assetVersion)fail();
  }
  return s;
}
function compare(rec){
  const verification=rec?.verification;
  if(!['Verified','Unverified','Unavailable'].includes(verification))fail();
  // A platform URL failing or a screenshot disappearing is not proof of deletion.
  if(verification!=='Verified')return 'Needs Verification';
  if(rec.contentCompared!==true||typeof rec.matchesCurrentEvent!=='boolean')
    return 'Needs Verification';
  return rec.matchesCurrentEvent?'No Update Needed':'Update Required';
}
function apply(input,command,actor,at){
  validate(input);
  if(!command||typeof command!=='object'||Array.isArray(command)||
    command.expectedRevision!==input.revision)fail();
  const selectedRole=role(actor),when=time(at),s=structuredClone(input),action=command.action;
  if(action==='open'){
    if(command.sourceVerified!==true||!ID.test(command.changeKey||'')||
      !Array.isArray(command.fields)||!command.fields.length||
      command.fields.some(x=>!FIELDS.has(x))||
      !Array.isArray(command.publications)||command.publications.length===0||
      command.publications.length>1000)fail();
    if(s.changeKeys.includes(command.changeKey))return input; // no duplicate cycle
    const seen=new Set();
    for(const item of command.publications){
      if(!ID.test(item.id||'')||seen.has(item.id))fail();
      seen.add(item.id);
      const status=compare(item);
      // Unaffected existing records retain previously verified evidence;
      // affected records enter a new review cycle.
      s.items[item.id]={id:item.id,
        platform:text(item.platform,80),assetVersion:text(item.assetVersion,120),
        status,verification:item.verification,
        evidenceRef:item.verification==='Verified'?
          text(item.evidenceRef,256):null,
        reason:status==='No Update Needed'?'Verified unchanged content':null,
        lastCheckedAt:when,cycle:s.cycle+1};
    }
    // A new relevant change reopens the same review, never overwrites its
    // immutable prior completion summary or silently closes old open items.
    s.changeKeys.push(command.changeKey);
    s.cycle++;
    s.status='Open';
  }else if(action==='recheck'){
    if(!ID.test(command.publicationId||'')||!s.items[command.publicationId])fail();
    const item=s.items[command.publicationId];
    if(command.relevantChangeDetected!==true)return input;
    // Only a verified changed publication or concrete relevant suspicion
    // triggers a new review. Purely cosmetic/unrelated edits are ignored.
    if(command.verification==='Verified'&&command.contentCompared===true&&
      command.matchesCurrentEvent===true)return input;
    if(!['Verified','Unverified','Unavailable'].includes(command.verification))fail();
    if(!ID.test(command.changeKey||'')||s.changeKeys.includes(command.changeKey))return input;
    s.changeKeys.push(command.changeKey);
    if(s.status==='Closed'){s.cycle++;s.status='Open';}
    item.status=command.verification==='Verified'&&command.contentCompared===true&&
      command.matchesCurrentEvent===false?'Update Required':'Needs Verification';
    item.verification=command.verification;
    item.evidenceRef=command.verification==='Verified'?text(command.evidenceRef,256):null;
    item.lastCheckedAt=when;item.cycle=s.cycle;item.reason=null;
  }else if(action==='resolve'){
    if(s.status!=='Open'||!ID.test(command.publicationId||'')||
      !s.items[command.publicationId]||
      !['Verified Updated','No Update Needed'].includes(command.value))fail();
    const item=s.items[command.publicationId];
    if(command.verifiedAgainstCurrent!==true&&command.verifiedAbsent!==true)fail();
    if(command.value==='Verified Updated'&&command.verifiedAgainstCurrent!==true)fail();
    item.status=command.value;
    item.verification='Verified';
    item.evidenceRef=text(command.evidenceRef,256);
    item.reason=command.value==='No Update Needed'?text(command.reason,256):null;
    item.lastCheckedAt=when;item.cycle=s.cycle;
  }else if(action==='close'){
    if(s.status!=='Open'||Object.keys(s.items).length===0||
      Object.values(s.items).some(x=>!['Verified Updated','No Update Needed'].includes(x.status)||
        x.verification!=='Verified'||!x.evidenceRef))fail();
    s.summaries.push({cycle:s.cycle,closedAt:when,closedBy:actor.id,
      itemResults:Object.values(s.items).map(x=>({
        publicationId:x.id,platform:x.platform,assetVersion:x.assetVersion,
        status:x.status,evidenceRef:x.evidenceRef,reason:x.reason
      }))});
    s.status='Closed';
  }else fail();
  s.revision++;s.updatedAt=when;
  s.activity.push({revision:s.revision,cycle:s.cycle,action,actorId:actor.id,
    role:selectedRole,at:when});
  return validate(s);
}
module.exports={empty,validate,compare,apply};
