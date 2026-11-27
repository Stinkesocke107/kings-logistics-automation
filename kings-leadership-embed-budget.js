'use strict';
// Discord embed budget policy for the consolidated Kings Event dashboard.
// Preserve staff decisions/review progress and Invitation source evidence
// byte-for-byte; only secondary advisory descriptions may be condensed.
// 6000 chars total per embed, 1024 per field value, 256 per field name.
const MAX_EMBED=6000,MAX_NAME=256,MAX_VALUE=1024,MAX_FIELDS=25;
const PROTECTED=new Set([
  '📝 Event Operations — Manual Staff Progress',
  '🔐 Event Operations — Private Review Codes',
  '✉️ Invitation Tracker — Source Review'
]);
const FALLBACKS=new Map([
  ['⏱️ Event Operations — Review Order',
    'Review source warnings in the protected Event worklist. Starting a Staff review never clears a BLOCKED source; original records and human decisions are required.'],
  ['🗂️ Event History — Priority Months',
    'Priority months and unresolved original evidence remain in the protected Event review agenda. Historic source gaps are NOT proof of no Events.'],
  ['🗓️ Calendar / History — Source Review',
    'Review the twelve-month UTC calendar and 24-month History against original records. Missing source months and future holds remain unverified; no free slots certified.'],
  ['🧾 Event History — Decision Evidence Review',
    'Original 24-month Event decisions, cancellations and legacy holds remain unverified until Staff checks original records. No historic approvals or free slots certified.'],
  ['📊 Event Capacity — Advisory Review',
    'Advisory source limits only: 3/day, 20 Partner/month, 20 External/month, under-2h spacing warning; CEO policy decision remains open. No booking or availability certification.'],
  ['💬 Event Operations — Discord Staff Commands',
    'Use a fresh KR code from the private Review Codes field with the approved !kings-review command in the protected Event Operations channel. This records review progress only.'],
  ['🟣 Last Completed Week',
    'See the protected weekly Event report for period and verified source detail; this short dashboard never certifies attendance or approval.'],
  ['👑 Last Completed Month',
    'See the protected monthly Event report for period and verified source detail; no missing data is inferred as zero.'],
  ['🎯 Next Staff Step',
    'Validate the original Event and Invitation records, then record an authorised manual review. No automatic approval, invitations or bookings.'],
  ['🔵 Live Overview',
    'Current read-only Event status claims are advisory; consult the protected source for detailed counts. Missing or stale data are not zero and do not release availability.']
]);
function refuse(){throw Error('Kings Event dashboard Discord embed budget unverified');}
function lengthOf(embed){
  if(!embed||typeof embed!=='object'||Array.isArray(embed)||
    typeof embed.title!=='string'||typeof embed.description!=='string'||
    typeof embed.footer?.text!=='string'||!Array.isArray(embed.fields)||
    embed.fields.length>MAX_FIELDS)refuse();
  let total=embed.title.length+embed.description.length+embed.footer.text.length;
  if(embed.title.length>256||embed.description.length>4096||
     embed.footer.text.length>2048)refuse();
  for(const field of embed.fields){
    if(!field||typeof field.name!=='string'||typeof field.value!=='string'|| 
      field.name.length>MAX_NAME||field.value.length>MAX_VALUE)refuse();
    total+=field.name.length+field.value.length;
  }
  return total;
}
function fitEventEmbed(embed){
  const fields=embed?.fields;
  if(!Array.isArray(fields)||fields.length>MAX_FIELDS)refuse();
  const copy={...embed,fields:fields.map(field=>({...field}))};
  // A large or invalid secondary field may be compacted, but protected
  // Staff/Invitation evidence cannot be silently truncated or rewritten.
  for(const row of copy.fields){
    if(!PROTECTED.has(row.name)&&FALLBACKS.has(row.name)&&
      (typeof row.value!=='string'||row.value.length>MAX_VALUE))
      row.value=FALLBACKS.get(row.name);
  }
  let total=lengthOf(copy);
  for(const [name,value] of FALLBACKS){
    if(total<=MAX_EMBED)break;
    const field=copy.fields.find(row=>row.name===name);
    if(!field||field.value===value||field.value.length<=value.length)continue;
    total-=field.value.length-value.length;
    field.value=value;
  }
  if(lengthOf(copy)>MAX_EMBED)refuse();
  return copy;
}
module.exports={fitEventEmbed,lengthOf,MAX_EMBED,PROTECTED};
