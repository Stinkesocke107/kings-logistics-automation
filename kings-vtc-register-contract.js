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
    out.push({tmpId:id,joinedAt:parseVtcJoinDate(raw.joinDate,now),
      username:typeof raw.username==='string'?raw.username.trim():''});
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
function matchProfiles(roster, profiles, drivers, storedMappings=[]) {
  const allowed=new Set(drivers.map(d=>d.discordId));
  const rosterById=new Map(roster.map(r=>[r.tmpId,r]));
  const historical=new Map();
  for(const item of storedMappings){
    if(!rosterById.has(item.tmpId) || !allowed.has(item.discordId))continue;
    if(historical.has(item.tmpId) && historical.get(item.tmpId)!==item.discordId)
      throw Error('Conflicting trusted historical TruckersMP ID mapping.');
    historical.set(item.tmpId,item.discordId);
  }
  const candidates=new Map(),duplicate=new Set();
  let contradictions=0;
  for(const member of roster){
    const profile=profiles.get(member.tmpId);
    const publicId=profile?.valid ? profile.discordId : null;
    const storedId=historical.get(member.tmpId)||null;
    if(publicId && storedId && publicId!==storedId){
      // Current public link disagrees with the previously verified ID. Neither
      // must be guessed as correct. Refuse both for this account.
      contradictions++;
      continue;
    }
    const chosen=publicId||storedId;
    if(!chosen || !allowed.has(chosen))continue;
    if(candidates.has(chosen))duplicate.add(chosen);
    else candidates.set(chosen,{
      ...member,discordId:chosen,
      source:publicId?'public-truckersmp-discord-link':'historical-verified'
    });
  }
  for(const id of duplicate)candidates.delete(id);
  const matched=[...candidates.values()].sort((a,b)=>a.discordId.localeCompare(b.discordId));
  const outstanding=drivers.filter(d=>!candidates.has(d.discordId))
    .sort((a,b)=>a.discordId.localeCompare(b.discordId));
  return {matched,outstanding,duplicateCount:duplicate.size+contradictions};
}

// Human-facing suggestion ONLY. Exact display-name similarity can never prove
// a Discord/TruckersMP identity and must never populate an approved batch.
function attachManualNameHints(roster,result) {
  const normalize=value=>String(value||'').normalize('NFKC')
    .toLowerCase().trim().replace(/\s+/g,' ');
  const used=new Set(result.matched.map(m=>m.tmpId));
  const byName=new Map();
  for(const item of roster) {
    if(used.has(item.tmpId))continue;
    const name=normalize(item.username);
    if(name.length<4 || /^\d+$/.test(name))continue;
    if(!byName.has(name))byName.set(name,[]);
    byName.get(name).push(item);
  }
  const outstanding=result.outstanding.map(driver=>{
    const choices=new Map();
    for(const text of driver.possibleNames||[]) {
      const name=normalize(text);
      if(name.length<4)continue;
      const matches=byName.get(name)||[];
      if(matches.length!==1)continue;
      choices.set(matches[0].tmpId,matches[0]);
    }
    if(choices.size!==1)return {...driver,manualHint:null};
    const match=[...choices.values()][0];
    return {...driver,manualHint:{
      tmpId:match.tmpId,joinedAt:match.joinedAt
    }};
  });
  const hintCounts=new Map();
  for(const item of outstanding){
    if(!item.manualHint)continue;
    const id=item.manualHint.tmpId;
    hintCounts.set(id,(hintCounts.get(id)||0)+1);
  }
  const unique=outstanding.map(item=>item.manualHint &&
    hintCounts.get(item.manualHint.tmpId)!==1
    ? {...item,manualHint:null} : item);
  return {...result,outstanding:unique,manualHintCount:unique.filter(x=>x.manualHint).length};
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
    const historic=confirmed[i].filter(x=>x.source==='historical-verified').length;
    const note='Verified TMP Discord link (current public or previously verified Kings mapping; '+historic+' historic). **VTC join date is not automatically the original Kings date**. Check rejoins before copying the approved batch to <#1572736232969084948>. No roles change here.';
    const content=title+'\n'+note+'\n'+code+'text\nKINGS_REGISTER_BATCH_V1\n'+
      confirmed[i].map(registerBlock).join('\n---\n')+'\n'+code;
    if(content.length>maxLength)throw Error('Batch report exceeds Discord message length.');
    pages.push({marker:'👑 **Kings TruckersMP VTC Date Review | Batch '+(i+1)+'/',content});
  }
  const missing=chunk(result.outstanding,12);
  for(let i=0;i<missing.length;i++){
    const title='👑 **Kings TruckersMP Unlinked Drivers | Page '+(i+1)+'/'+missing.length+'**';
    const note='Unlinked Drivers: an exact-name TMP suggestion is **NOT** a verified identity. Check the TMP profile and true original Kings date manually before making a separate register entry. No role changes.';
    const content=title+'\n'+note+'\n'+missing[i].map(d=>
      '• '+d.role+' • Discord ID: '+d.discordId+
      (d.manualHint?' • [Possible TMP](https://truckersmp.com/user/'+d.manualHint.tmpId+') • VTC '+deDate(d.manualHint.joinedAt.toISOString())+' • *VERIFY*':''))
      .join('\n');
    if(content.length>maxLength)throw Error('Unlinked report exceeds Discord message length.');
    pages.push({marker:'👑 **Kings TruckersMP Unlinked Drivers | Page '+(i+1)+'/',content});
  }
  if(pages.length>30)throw Error('Unreasonably large private VTC review report.');
  if(pages.length===0)throw Error('Refusing empty VTC review report.');
  return pages;
}
module.exports={VTC_ID,numericId,discordId,parseVtcJoinDate,parseRoster,readPublicProfile,matchProfiles,attachManualNameHints,deDate,registerBlock,reportPages};
