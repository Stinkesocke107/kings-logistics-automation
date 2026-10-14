'use strict';
const fs = require('fs');
const path = require('path');
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
  if (method !== 'GET' && !/^\/channels\/\d+\/messages(?:\/\d+)?$/.test(route)) throw Error('Write outside message endpoints blocked');
  if (!['GET','POST','PATCH'].includes(method)) throw Error('Discord method blocked');
  const response = await fetch(API+route, {method, headers:{Authorization:'Bot '+TOKEN,'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined, signal:AbortSignal.timeout(20000)});
  const result = await response.text();
  if (!response.ok) throw Error('Discord '+response.status+' '+route+': '+result.slice(0,400));
  return result ? JSON.parse(result) : null;
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
  const selected=HIERARCHY.map(label=>({label, role:selectRole(roles,members,label)}));
  const staffIds=new Set(selected.map(x=>x.role.id));
  const total=members.filter(m=>(m.roles||[]).some(r=>staffIds.has(r))).length;
  const fields=selected.map(x=>({name:x.label,value:'**'+x.role.assigned+'** members',inline:true}));
  return {title:'👔 '+MARKER,description:'Current Staff structure based on **live Discord roles**. Members holding multiple hierarchy roles are counted once in the total, but once per assigned role.',color:0x182DFF,fields:[{name:'Total unique Staff members',value:'**'+total+'**',inline:false},...fields],footer:{text:'Kings Logistics • Live Discord role snapshot • Read-only'},timestamp:new Date().toISOString()};
}
async function main() {
  const [members,roles,target,bot]=await Promise.all([allMembers(),discord('/guilds/'+GUILD+'/roles'),channel(),discord('/users/@me')]);
  if (!bot?.id) throw Error('Cannot verify Kings Bot identity; refusing dashboard write');
  const embed=makeEmbed(members,roles);
  let stored=null;
  if(fs.existsSync(STATE)) { try {stored=JSON.parse(fs.readFileSync(STATE,'utf8'));}catch {throw Error('Corrupt live overview state; refusing to reset');} }
  let messageId=stored?.messageId||null;
  const payload={embeds:[embed],allowed_mentions:{parse:[]}};
  if(messageId) {
    try {
      const old=await discord('/channels/'+target.id+'/messages/'+messageId);
      if(String(old?.author?.id||'')!==String(bot.id) || !old?.embeds?.some(e=>e.title?.includes(MARKER))) throw Error('Stored message does not belong to Kings Bot live overview');
    } catch(error) { if(!String(error.message).includes('Discord 404 ')) throw error; messageId=null; }
  }
  if(!messageId) {
    const recent=await discord('/channels/'+target.id+'/messages?limit=100');
    const own=recent.find(m=>String(m.author?.id||'')===String(bot.id) && m.embeds?.some(e=>e.title?.includes(MARKER)));
    messageId=own?.id||null;
  }
  const sent=await discord('/channels/'+target.id+'/messages'+(messageId?'/'+messageId:''),messageId?'PATCH':'POST',payload);
  fs.mkdirSync(path.dirname(STATE),{recursive:true});
  fs.writeFileSync(STATE,JSON.stringify({version:1,channelId:target.id,messageId:sent.id,updatedAt:new Date().toISOString(),totalStaff:Number(embed.fields[0].value.replace(/\D/g,''))},null,2)+'\n');
  console.log('Live Staff hierarchy overview '+(messageId?'updated':'created')+'; unique Staff '+embed.fields[0].value+'; message '+sent.id);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
