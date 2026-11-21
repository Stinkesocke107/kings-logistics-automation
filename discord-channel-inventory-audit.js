'use strict';
// READ ONLY. Verify channel destinations, guild binding and channel types.
// This is intentionally NOT a claim that every event-driven post is fresh.
const API='https://discord.com/api/v10';
const DEFAULT_GUILD='1114967437788577792';
const TARGETS=Object.freeze([
  {key:'driver-leadership',id:'1551675577226887229',types:[0,5],group:'leadership'},
  {key:'hr-leadership',id:'1383508442857340969',types:[0,5],group:'leadership'},
  {key:'staff-leadership',id:'1551675877178474526',types:[0,5],group:'leadership'},
  {key:'event-leadership',id:'1551675735633297418',types:[0,5],group:'leadership'},
  {key:'management-leadership',id:'1492936683304517792',types:[0,5],group:'leadership'},
  {key:'staff-public-updates',id:'1494095653096128604',types:[0,5],group:'public'},
  {key:'public-convoy-announcements',id:'1351613882791366838',types:[0,5],group:'public'},
  {key:'convoy-overview',id:'1550619865805754378',types:[0,5],group:'public'},
  {key:'internal-convoy-reminders',id:'1550997669596631200',types:[0,5],group:'internal'},
  {key:'convoy-management-forum',id:'1550619824005062697',types:[15,16],group:'internal'},
  {key:'kings-convoy-source-forum',id:'1506133821693755502',types:[15,16],group:'internal'},
  {key:'system-monitor',name:'system-monitor',types:[0,5],group:'technical'},
  {key:'system-alerts',name:'system-alerts',types:[0,5],group:'technical'}
]);
function normalize(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');}
function verifyChannels(channels,guildId,targets=TARGETS){
  if(!Array.isArray(channels) || !channels.length) throw new Error('Incomplete Discord channel inventory');
  const seen=new Set();
  if(!/^\d{17,22}$/.test(String(guildId)))throw new Error('Invalid guild');
  return targets.map(target=>{
    const candidates=channels.filter(channel=>
      channel&&target.types.includes(Number(channel.type))&&
      (target.id?String(channel.id)===target.id:normalize(channel.name)===normalize(target.name)));
    let status='VERIFIED',reason='channel-exists-correct-type';
    if(candidates.length!==1){status='UNVERIFIED';reason=candidates.length===0?'missing-or-type-mismatch':'ambiguous';}
    else if(candidates[0].guild_id&&String(candidates[0].guild_id)!==String(guildId)){
      status='UNVERIFIED';reason='guild-mismatch';
    } else if(seen.has(String(candidates[0].id))) {
      status='UNVERIFIED';reason='duplicate-mapping';
    }else seen.add(String(candidates[0].id));
    // Never return the full channel objects: private channel properties,
    // permission overwrites or IDs must not enter public CI logs.
    return {key:target.key,group:target.group,status,reason};
  });
}
function renderSummary(results){
  const groups=['leadership','public','internal','technical'];
  return groups.map(group=>{
    const arr=results.filter(r=>r.group===group);
    return {group,verified:arr.filter(r=>r.status==='VERIFIED').length,total:arr.length};
  });
}
async function main(){
  const token=process.env.DISCORD_BOT_TOKEN||'';
  const guildId=process.env.DISCORD_GUILD_ID||DEFAULT_GUILD;
  if(!token) throw new Error('Bot configuration unavailable');
  const resp=await fetch(API+'/guilds/'+guildId+'/channels',{
    method:'GET',headers:{Authorization:'Bot '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(15000)
  });
  if(!resp.ok)throw new Error('Discord channel inventory request failed (status withheld)');
  const channels=await resp.json();
  const checks=verifyChannels(channels,guildId);
  for(const item of checks){
    console.log('[Kings Channel Audit] '+item.key+': '+item.status+' ('+item.reason+')');
  }
  for(const group of renderSummary(checks)){
    console.log('[Kings Channel Audit] '+group.group+': '+group.verified+'/'+group.total+' destination mappings verified');
  }
  console.log('Note: channel existence does not prove publisher freshness, content correctness, permissions, or unconfigured webhook destinations.');
  if(checks.some(x=>x.status!=='VERIFIED'))throw new Error('Kings configured Discord channel mapping audit incomplete');
}
if(require.main===module)main().catch(()=>{
  console.error('Kings read-only channel inventory check incomplete; private details withheld.');
  process.exitCode=1;
});
module.exports={TARGETS,verifyChannels,renderSummary};
