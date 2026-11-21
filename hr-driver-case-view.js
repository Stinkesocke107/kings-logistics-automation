'use strict';

// Kings HR private individual case view. This module is deliberately PURE:
// it never accesses Discord, writes files, changes roles, or logs persons.
// Consumers may render returned pages ONLY to a permission-validated private
// HR surface, never to GitHub artifacts, public embeds or Actions logs.
const {activeDriverSourceCoverage}=require('./kings-data-sources');

const ID=/^\d{17,20}$/;
const ACTIONS=new Set(['approved','declined','revoked']);
const ADMISSIONS=new Set(['first','return']);
const CASES_PER_PAGE=10;
const PAGE_LIMIT=1900;

const STATUS_PRIORITY=Object.freeze({
  'active-role-with-declined-decision':1,
  'active-role-with-revoked-decision':1,
  'approved-without-original-identity':2,
  'missing-identity-and-decision':3,
  'verified-approved-return':4,
  'verified-approved-first':5
});

function buildPrivateHrCaseView(currentDriverIds,identityRegister,evidence,now=new Date()){
  const coverage=activeDriverSourceCoverage(identityRegister,currentDriverIds,now);
  if(!['complete','incomplete'].includes(coverage.status)||
     !(evidence?.latest instanceof Map)||!Array.isArray(evidence.events)||
     !(now instanceof Date)||!Number.isFinite(now.getTime())){
    throw new Error('Private Kings HR case view requires authorized current Driver and HR decision sources.');
  }
  const stats={
    currentDrivers:coverage.activeDrivers,
    originalIdentityRegistered:coverage.registered,
    approvedFirst:0,approvedReturn:0,
    deniedOrRevokedWithActiveRole:0,
    approvedWithoutOriginalIdentity:0,
    missingOriginalIdentityAndDecision:0,
    unverifiedHistoricalDecision:0
  };
  const cases=[];
  for(const raw of currentDriverIds){
    const discordId=String(raw);
    if(!ID.test(discordId))throw new Error('Private HR case view has invalid Driver identity.');
    const record=identityRegister.identities.get(discordId);
    const decision=evidence.latest.get(discordId);
    if(!decision){
      if(record){stats.unverifiedHistoricalDecision++;continue;}
      stats.missingOriginalIdentityAndDecision++;
      cases.push(Object.freeze({
        discordId,
        status:'missing-identity-and-decision',admission:'undetermined',
        ticketId:null,recordedAt:null,originalKingsJoinedAt:null,
        needsHumanReview:true
      }));
      continue;
    }
    if(!ID.test(String(decision.ticketId||''))||
       !ACTIONS.has(decision.decision)||!ADMISSIONS.has(decision.admission)||
       !ID.test(String(decision.approvedBy||''))||
       !Number.isFinite(Date.parse(decision.recordedAt))||
       Date.parse(decision.recordedAt)>now.getTime()+5*60000){
      throw new Error('Private HR case view has unverified or contradictory human decision evidence.');
    }
    let status,needsHumanReview;
    if(decision.decision==='declined'||decision.decision==='revoked'){
      status='active-role-with-'+decision.decision+'-decision';
      needsHumanReview=true;
      stats.deniedOrRevokedWithActiveRole++;
    } else if(!record) {
      status='approved-without-original-identity';
      needsHumanReview=true;
      stats.approvedWithoutOriginalIdentity++;
    } else {
      status=decision.admission==='return'
        ?'verified-approved-return':'verified-approved-first';
      needsHumanReview=false;
      if(decision.admission==='return')stats.approvedReturn++;
      else stats.approvedFirst++;
    }
    cases.push(Object.freeze({
      discordId,status,admission:decision.admission,
      ticketId:decision.ticketId,recordedAt:decision.recordedAt,
      // This sensitive value must remain exclusively inside the private view.
      originalKingsJoinedAt:record?.joinedAt instanceof Date
        ?record.joinedAt.toISOString():null,
      needsHumanReview
    }));
  }
  cases.sort((a,b)=>STATUS_PRIORITY[a.status]-STATUS_PRIORITY[b.status]||
    a.discordId.localeCompare(b.discordId));
  return Object.freeze({
    status:stats.deniedOrRevokedWithActiveRole||stats.approvedWithoutOriginalIdentity||
      stats.missingOriginalIdentityAndDecision?'needs-human-review':
      stats.unverifiedHistoricalDecision?'historical-evidence-unknown':'reviewed',
    generatedAt:now.toISOString(),
    stats:Object.freeze(stats),
    cases:Object.freeze(cases),
    privateOnly:true,
    // A legacy person with a verified Kings identity but no HR record is
    // counted, never shamed as an "unapproved" or auto-rejected individual.
    legacyNoFormalEvidenceIsNotRejection:true
  });
}
function privateCaseLine(entry){
  if(!ID.test(entry.discordId))throw new Error('Invalid private HR case rendering key.');
  const ticket=entry.ticketId?' • HR ticket ID: '+entry.ticketId:' • Ticket: needs HR review';
  const date=entry.recordedAt?' • Evidence <t:'+Math.floor(Date.parse(entry.recordedAt)/1000)+':d>':'';
  const original=entry.originalKingsJoinedAt?
    ' • Original Kings date verified':' • Original Kings date: not verified';
  return '• '+entry.discordId+' • '+entry.status+' • '+entry.admission+
    ticket+date+original;
}
function privateHrCasePages(view){
  if(!view?.privateOnly||!Array.isArray(view.cases)||
     !Number.isFinite(Date.parse(view.generatedAt))||!view.stats){
    throw new Error('Cannot render unverified private HR case view.');
  }
  const s=view.stats;
  const chunks=[];
  for(let i=0;i<view.cases.length;i+=CASES_PER_PAGE)
    chunks.push(view.cases.slice(i,i+CASES_PER_PAGE));
  const pageCount=1+chunks.length;
  const head=[
    '👑 Kings HR Driver Case View | 1/'+pageCount,
    '🔒 PRIVATE HR/Management ONLY — read-only evidence, never an approval action',
    'Current Kings Drivers: **'+s.currentDrivers+'** • Original identities: **'+s.originalIdentityRegistered+'**',
    'Verified HR first: **'+s.approvedFirst+'** • return: **'+s.approvedReturn+'**',
    'Active-role conflicts (declined/revoked): **'+s.deniedOrRevokedWithActiveRole+'**',
    'Approved but no original identity: **'+s.approvedWithoutOriginalIdentity+'**',
    'No identity or HR record: **'+s.missingOriginalIdentityAndDecision+'**',
    'Existing registered Drivers without formal HR record: **'+s.unverifiedHistoricalDecision+'**',
    'Historical missing HR evidence is UNKNOWN, not rejected or automatically approved.',
    'Each case requires authorized HR/Management review; no roles, dates or tickets modified.'
  ].join('\n');
  if(head.length>PAGE_LIMIT)throw new Error('Private HR overview exceeds safe Discord message size.');
  const pages=[Object.freeze({marker:'Kings HR Driver Case View | 1/',content:head})];
  for(let i=0;i<chunks.length;i++){
    const lines=[
      '👑 Kings HR Driver Case View | '+(i+2)+'/'+pageCount,
      '🔒 PRIVATE HR/Management ONLY • Human authorization required',
      'Source: verified Discord Driver roles + protected Kings identity/HR decisions',
      ...chunks[i].map(privateCaseLine)
    ];
    const content=lines.join('\n');
    if(content.length>PAGE_LIMIT)throw new Error('Private HR case page exceeds safe Discord message size.');
    pages.push(Object.freeze({
      marker:'Kings HR Driver Case View | '+(i+2)+'/',
      content
    }));
  }
  return Object.freeze(pages);
}
module.exports={buildPrivateHrCaseView,privateHrCasePages};
