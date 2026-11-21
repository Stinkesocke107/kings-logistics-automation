'use strict';
const fs = require('fs');
const path = require('path');
const {currentStaffRoleSnapshot}=require('./kings-staff-role-source');
const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const NAME = process.env.STAFF_LEADERSHIP_CHANNEL_NAME || 'staff-leadership';
const STATE = path.join(__dirname, 'data', 'staff-leadership-live-overview.json');
const MARKER = 'Kings Staff Leadership — Live Role Overview';
const HIERARCHY = ['Head Management', 'Management', 'Director', 'Team Lead', 'Staff'];
function norm(v) { return String(v || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
async function discord(route, method='GET', body) {
  if (!TOKEN) throw Error('DISCORD_BOT_TOKEN is missing');
  // This is an UPDATE-ONLY dashboard. A bot must never silently replace a
  // missing stored message with another post or modify Staff roles/members.
  if (!['GET','PATCH'].includes(method)) throw Error('Staff role dashboard method blocked');
  if(method==='PATCH' && !/^\/channels\/\d{17,20}\/messages\/\d{17,20}$/.test(route))
    throw Error('Staff role dashboard write outside fixed message blocked');
  const response = await fetch(API+route, {method, headers:{Authorization:'Bot '+TOKEN,'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined, signal:AbortSignal.timeout(20000)});
  const result = await response.text();
  if (!response.ok) throw Error('Discord API HTTP '+response.status+' (body and path withheld)');
  if(!result)return null;
  try{return JSON.parse(result);}
  catch{throw Error('Discord API returned invalid JSON (body withheld)');}
}
async function allMembers() {
  const result = []; let after = '';
  for(let i=0;i<20;i++) {
    const q = new URLSearchParams({limit:'1000'}); if(after) q.set('after',after);
    const page = await discord('/guilds/'+GUILD+'/members?'+q);
    if(!Array.isArray(page)) throw Error('Invalid Discord members');
    result.push(...page);
    if(page.length<1000) return result.filter(m=>m.user?.id && !m.user.bot);
    after=page.at(-1)?.user?.id;
    if(!after) throw Error('Missing Discord pagination cursor');
  }
  throw Error('Discord member pagination limit reached; refusing incomplete counts');
}
async function channel() {
  const channels = await discord('/guilds/'+GUILD+'/channels');
  const matches=channels.filter(c=>[0,5].includes(c.type)&&norm(c.name)===norm(NAME));
  if(matches.length!==1) throw Error('Staff leadership channel missing or ambiguous');
  return matches[0];
}
function selectRole(roles,members,label) {
  const candidates=roles.filter(r=>norm(r.name)===norm(label)).map(r=>({
    ...r,assigned:members.filter(m=>(m.roles||[]).includes(r.id)).length,
    preferred:/^\s*[|｜]/.test(r.name)?1:0
  })).sort((a,b)=>b.assigned-a.assigned||b.preferred-a.preferred||b.position-a.position);
  if(!candidates.length) throw Error('Staff hierarchy role missing: '+label);
  if(candidates.length>1 && candidates[0].assigned===candidates[1].assigned && candidates[0].preferred===candidates[1].preferred) throw Error('Ambiguous Staff hierarchy role '+label);
  return candidates[0];
}
function makeEmbed(members, roles) {
  const snapshot=currentStaffRoleSnapshot(members,roles);
  const fields=snapshot.roleCounts.map(r=>({
    name:r.label,value:'**'+r.count+'** members',inline:true
  }));
  return {title:'👔 '+MARKER,
    description:'Current Discord Staff hierarchy roles only. A role does NOT prove an HR-approved Staff appointment, its original date or a department decision. TruckersMP VTC Staff classification is a separate source.',
    color:0x182DFF,
    fields:[
      {name:'Total unique Staff members',value:'**'+snapshot.uniqueStaffRoleHolders+'**',inline:false},
      ...fields,
      {name:'Staff appointment / HR authorization',value:'**Not verified** — no authorized HR Staff appointment register connected.',inline:false}
    ],
    footer:{text:'Kings Logistics • Verified Discord role snapshot • Advisory only'},
    timestamp:snapshot.observedAt
  };
}
async function main() {
  const [members,roles,target,bot]=await Promise.all([allMembers(),discord('/guilds/'+GUILD+'/roles'),channel(),discord('/users/@me')]);
  if (!bot?.id) throw Error('Cannot verify Kings Bot identity; refusing dashboard write');
  const embed=makeEmbed(members,roles);
  let stored=null;
  if(fs.existsSync(STATE)) {
    try {stored=JSON.parse(fs.readFileSync(STATE,'utf8'));}
    catch {throw Error('Corrupt Staff live overview state; refusing to reset or recreate');}
    if(stored?.version!==1 ||
       String(stored?.channelId||'')!==String(target.id) ||
       !/^\d{17,20}$/.test(String(stored?.messageId||''))){
      throw Error('Invalid or conflicting Staff live overview ownership state; refusing to publish');
    }
  }
  if(String(target?.guild_id||'')!==String(GUILD))
    throw Error('Staff live overview channel belongs to a different guild');
  const payload={embeds:[embed],allowed_mentions:{parse:[]}};
  let messageId=stored?.messageId||null;
  if(messageId) {
    // No GET 404 -> silent discovery/POST fallbacks; never duplicate a fixed
    // dashboard when the original message was removed or access changed.
    const old=await discord('/channels/'+target.id+'/messages/'+messageId);
    if(String(old?.author?.id||'')!==String(bot.id) ||
       !old?.embeds?.some(e=>e.title?.includes(MARKER)))
      throw Error('Stored Staff live overview is not bot-owned or has wrong title');
  } else {
    // Migration of an already existing bot-owned dashboard is allowed.
    // Initial publication, duplicate owned messages and partial 100-message
    // history require an explicit manual recovery outside this automation.
    const recent=await discord('/channels/'+target.id+'/messages?limit=100');
    if(!Array.isArray(recent)||recent.length>=100)
      throw Error('Staff live overview message history not exhaustive; refusing publication');
    const owned=recent.filter(m=>String(m.author?.id||'')===String(bot.id) &&
      m.embeds?.some(e=>e.title?.includes(MARKER)));
    if(owned.length!==1 || !/^\d{17,20}$/.test(String(owned[0]?.id||'')))
      throw Error('Staff live overview needs exactly one verified existing bot-owned message');
    messageId=owned[0].id;
  }
  const sent=await discord('/channels/'+target.id+'/messages/'+messageId,'PATCH',payload);
  if(String(sent?.id||'')!==String(messageId))
    throw Error('Staff live overview Discord PATCH did not confirm stored message ID');
  fs.mkdirSync(path.dirname(STATE),{recursive:true});
  fs.writeFileSync(STATE,JSON.stringify({
    version:1,channelId:target.id,messageId,
    updatedAt:new Date().toISOString(),
    totalStaff:Number(embed.fields[0].value.replace(/\D/g,''))
  },null,2)+'\n');
  console.log('Live Staff hierarchy overview updated; unique Staff '+embed.fields[0].value+'; message identity preserved.');
}
main().catch(e=>{console.error('Kings Staff hierarchy overview failed: '+String(e?.message||'unknown error'));process.exitCode=1;});
