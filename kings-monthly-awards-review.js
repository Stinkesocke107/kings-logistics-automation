'use strict';
// Kings Monthly Awards: human-operated, public-safe cycle checklist only.
// This source NEVER chooses winners, stores candidate identities, changes
// Discord roles or publishes awards. Private nominations stay with Staff.
const catalog=require('./data/awards-catalog.json');
const EXPECTED=Object.freeze([
  'driver-of-the-month','staff-of-the-month',
  'recruiter-of-the-month','photo-of-the-month'
]);
const STAGES=Object.freeze([
  'REVIEW_ORIGINAL_SOURCES','REVIEW_NOMINATIONS',
  'CHECK_CONFLICTS_AND_ELIGIBILITY','HUMAN_LEADERSHIP_DECISION',
  'VERIFY_PUBLIC_ANNOUNCEMENT','PRIVATE_ARCHIVE_AND_HANDOVER'
]);
const EVIDENCE=Object.freeze({
  'driver-of-the-month':'Verified Driver activity and contributions; authorized leave must not be treated as misconduct.',
  'staff-of-the-month':'Verified team contributions across Staff and every Leadership level; no retired High Staff category.',
  'recruiter-of-the-month':'Verified genuine completed Driver onboarding, not unverified invites or spam.',
  'photo-of-the-month':'Original photo eligibility, consent/usage rights and recognition of the selected winning livery.'
});
function assertCatalog(value=catalog){
  if(!value||value.mode!=='manual-recognition-only'||
     !Array.isArray(value.awards)||value.awards.length!==4||
     value.awards.some((a,i)=>a.id!==EXPECTED[i]||
       a.cadence!=='monthly'||a.assignment!=='human-leadership-only')||
     value.awards[1].includesLeadership!==true||
     value.awards[3].winningLiveryRecognition!==true)
    throw Error('Kings Monthly Awards catalog must preserve four human-only awards');
  return value;
}
function monthBounds(month){
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw Error('Month must be YYYY-MM');
  const [y,m]=month.split('-').map(Number);
  if(y<2020||y>2100)throw Error('Invalid Kings Awards month');
  const start=new Date(Date.UTC(y,m-1,1));
  const end=new Date(Date.UTC(y,m,1));
  return {month,startUtc:start.toISOString(),endExclusiveUtc:end.toISOString()};
}
function monthlyAwardsReview(month,value=catalog){
  assertCatalog(value);
  const period=monthBounds(month);
  const awards=value.awards.map(a=>Object.freeze({
    id:a.id,name:a.name,owner:'Human Kings Leadership',
    status:'HUMAN_REVIEW_PENDING',
    evidenceToReview:EVIDENCE[a.id],
    includesLeadership:a.id==='staff-of-the-month',
    winningLiveryRecognition:a.id==='photo-of-the-month',
    steps:Object.freeze(STAGES.map(code=>Object.freeze({
      code,status:'PENDING_AUTHORIZED_REVIEW'
    })))
  }));
  return Object.freeze({
    version:1,mode:'MANUAL_REVIEW_ONLY',...period,
    awards:Object.freeze(awards),
    winnersSelected:false,originalEvidenceVerified:false,
    privateNominationsStored:false,discordMessagesSent:0,
    rolesChanged:0,automaticAwardsGranted:0,
    pendingTeamApproval:true,pendingCeoFinalApproval:true
  });
}
function renderReview(month){
  const r=monthlyAwardsReview(month);
  const lines=[
    '# Kings Logistics — Monthly Awards private Staff checklist',
    'UTC month: '+r.month+' | Review status: HUMAN_REVIEW_PENDING',
    '',
    'No candidate names or decisions belong in a public GitHub report.',
    ''
  ];
  for(const a of r.awards){
    lines.push('## '+a.name,
      'Check original sources: '+a.evidenceToReview,
      ...a.steps.map(step=>'- [ ] '+step.code.replaceAll('_',' ').toLowerCase()),
      '');
  }
  lines.push('Winners, publication and award archives require actual authorized human decisions.',
    'Never automatically assign roles, choose recipients, publish names or create discontinued award categories.');
  return lines.join('\n')+'\n';
}
if(require.main===module){
  try{process.stdout.write(renderReview(process.argv[2]||new Date().toISOString().slice(0,7)));}
  catch{console.error('Kings Monthly Awards: REVIEW_UNAVAILABLE');process.exitCode=1;}
}
module.exports={EXPECTED,STAGES,assertCatalog,monthBounds,monthlyAwardsReview,renderReview};
