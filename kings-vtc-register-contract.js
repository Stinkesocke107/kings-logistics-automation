'use strict';
const VTC_ID = 64284;
const MAX_ROSTER = 500;
function numericId(x) {
  const s = String(x === null || x === undefined ? '' : x);
  return /^[1-9]\d{0,17}$/.test(s) ? s : null;
}
function discordId(x) {
  const s = String(x === null || x === undefined ? '' : x);
  return /^\d{17,20}$/.test(s) ? s : null;
}
function parseVtcJoinDate(input, now=new Date()) {
  if (typeof input !== 'string') throw Error('Missing VTC joining date.');
  const raw=input.trim();
  let value=raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) value=value.replace(' ','T')+'Z';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value+='T00:00:00Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw Error('Unsupported VTC joining date format.');
  }
  const date=new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear()<2015 || date>now) {
    throw Error('Invalid or future VTC joining date.');
  }
  return date;
}
function parseRoster(body,now=new Date()) {
  if (body?.error !== false || !Array.isArray(body?.response?.members) ||
      body.response.members.length===0 || body.response.members.length>MAX_ROSTER) {
    throw Error('Official Kings VTC member roster missing or unsafe.');
  }
  const seen=new Set(),out=[];
  for (const raw of body.response.members) {
    const id=numericId(raw?.user_id);
    if (!id || seen.has(id)) throw Error('Invalid or duplicate TruckersMP user ID in Kings VTC roster.');
    seen.add(id);
    out.push({tmpId:id,joinedAt:parseVtcJoinDate(raw.joinDate,now)});
  }
  return out;
}
function readPublicProfile(payload, expectedId) {
  if (payload?.error !== false || !payload.response || String(payload.response.id)!==expectedId) {
    return {valid:false,discordId:null};
  }
  const vtc=payload.response.vtc;
  // Presence in the official VTC roster is authoritative. Refuse conflicting
  // profile VTC attribution, but allow profiles omitting optional VTC metadata.
  if (vtc && (String(vtc.id)!==String(VTC_ID) || vtc.inVTC===false)) {
    return {valid:false,discordId:null};
  }
  return {valid:true,discordId:discordId(payload.response.discordSnowflake)};
}
function matchProfiles(roster, profiles, drivers) {
  const allowed=new Set(drivers.map(d=>d.discordId));
  const candidates=new Map(),duplicate=new Set();
  for (const member of roster) {
    const profile=profiles.get(member.tmpId);
    if (!profile?.valid || !profile.discordId || !allowed.has(profile.discordId)) continue;
    if (candidates.has(profile.discordId))duplicate.add(profile.discordId);
    else candidates.set(profile.discordId,{...member,discordId:profile.discordId,source:'public-truckersmp-discord-link'});
  }
  for (const id of duplicate)candidates.delete(id);
  const matched=[...candidates.values()].sort((a,b)=>a.discordId.localeCompare(b.discordId));
  const outstanding=drivers.filter(d=>!candidates.has(d.discordId))
    .sort((a,b)=>a.discordId.localeCompare(b.discordId));
  return {matched,outstanding,duplicateCount:duplicate.size};
}
function deDate(iso) {
  const d=new Date(iso);
  return String(d.getUTCDate()).padStart(2,'0')+'.'+String(d.getUTCMonth()+1).padStart(2,'0')+'.'+d.getUTCFullYear();
}
function registerBlock(member) {
  return 'discord_id: '+member.discordId+'\ntruckersmp_id: '+member.tmpId+
    '\nkings_join_date: '+deDate(member.joinedAt.toISOString());
}
function chunk(array,size) {
  const out=[];
  for(let i=0;i<array.length;i+=size)out.push(array.slice(i,i+size));
  return out;
}
function reportPages(result, guild, options={}) {
  const maxLength=options.maxLength||1900;
  const pages=[];
  const code=String.fromCharCode(96).repeat(3);
  const confirmed=chunk(result.matched,9);
  for(let i=0;i<confirmed.length;i++){
    const title='👑 **Kings TruckersMP VTC Date Review | Batch '+(i+1)+'/'+confirmed.length+'**';
    const note='Public TruckersMP Discord-ID match, but **VTC join date is not automatically the original Kings date**. Verify previous memberships/rejoins, then copy the batch content into the restricted register <#1572736232969084948>. No role updates.';
    const content=title+'\n'+note+'\n'+code+'text\nKINGS_REGISTER_BATCH_V1\n'+
      confirmed[i].map(registerBlock).join('\n---\n')+'\n'+code;
    if(content.length>maxLength)throw Error('Batch report exceeds Discord message length.');
    pages.push({marker:'👑 **Kings TruckersMP VTC Date Review | Batch '+(i+1)+'/',content});
  }
  const missing=chunk(result.outstanding,23);
  for(let i=0;i<missing.length;i++){
    const title='👑 **Kings TruckersMP Unlinked Drivers | Page '+(i+1)+'/'+missing.length+'**';
    const note='No *verified public* Discord-to-TMP link. Never match by nickname. Manually confirm TruckersMP profile and original Kings join date. No register writes.';
    const content=title+'\n'+note+'\n'+missing[i].map(d=>
      '• '+d.role+' • Discord ID: '+d.discordId).join('\n');
    if(content.length>maxLength)throw Error('Unlinked report exceeds Discord message length.');
    pages.push({marker:'👑 **Kings TruckersMP Unlinked Drivers | Page '+(i+1)+'/',content});
  }
  if(pages.length>30)throw Error('Unreasonably large private VTC review report.');
  if(pages.length===0)throw Error('Refusing empty VTC review report.');
  return pages;
}
module.exports={VTC_ID,numericId,discordId,parseVtcJoinDate,parseRoster,readPublicProfile,matchProfiles,deDate,registerBlock,reportPages};
