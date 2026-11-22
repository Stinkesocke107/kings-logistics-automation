'use strict';
// Kings private Driver Register: READ-ONLY *aggregate* Administrator-assignment
// verification. This action transiently reads guild member role IDs in memory
// but NEVER logs or persists human user IDs, role IDs, names or member objects.
// Every Discord request is GET. No private channel messages are fetched.
// Without full, valid member pagination it MUST NOT claim no assignments.
const {assessChannel,authorizedRole,TARGETS}=require('./discord-protected-channel-access-audit');
const {PERMISSIONS}=require('./discord-permission-audit');
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const TOKEN=process.env.DISCORD_BOT_TOKEN||'';
const API='https://discord.com/api/v10';
const SNOWFLAKE=/^\d{17,22}$/;
const MAX_PAGES=25;
const LIMIT=1000;

function isAdmin(role){
  try{return (BigInt(role?.permissions??'0')&PERMISSIONS.ADMINISTRATOR)===PERMISSIONS.ADMINISTRATOR;}
  catch{return false;}
}
function roleCandidates(roles,botId,guildId=GUILD){
  if(!Array.isArray(roles)||!SNOWFLAKE.test(String(botId||''))||
     !SNOWFLAKE.test(String(guildId||'')))throw Error('role-metadata-unavailable');
  if(roles.some(role=>String(role.id)===String(guildId)&&isAdmin(role)))
    return {guildWide:true,identities:[]};
  const candidate=roles.filter(role=>
    String(role?.id)!==String(guildId) &&
    SNOWFLAKE.test(String(role?.id||'')) &&
    isAdmin(role) && !authorizedRole(role,'management',botId)
  ).map(role=>String(role.id));
  if(new Set(roles.map(r=>String(r.id))).size!==roles.length)throw Error('duplicate-role-metadata');
  return {guildWide:false,identities:candidate};
}

function status(code, detail){
  return Object.freeze({code,detail});
}
function routeAllowed(route){
  return new RegExp('^/users/@me$|^/guilds/'+GUILD+
    '(?:$|/roles$|/channels$|/members/[0-9]{17,22}$|/members\\?limit=1000&after=(?:0|[0-9]{17,22})$)').test(route);
}
async function getJson(route,transport=fetch){
  if(!routeAllowed(route))throw Error('unauthorized-read-route');
  const response=await transport(API+route,{
    method:'GET',
    headers:{
      Authorization:'Bot '+TOKEN,
      Accept:'application/json',
      'User-Agent':'Kings Protected Register Administrator Assignment Audit/1.0'
    },
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('discord-read-unavailable');
  const json=await response.json();
  if(!json||typeof json!=='object')throw Error('discord-invalid-json');
  return json;
}
async function scanMemberAssignments(candidateRoleIds,{transport=fetch,ownerId=null}={}){
  const targets=new Set(candidateRoleIds);
  if(targets.size===0)return status('NO_UNAPPROVED_ADMIN_ROLES','no unapproved Administrator-capable role exists in guild metadata');
  let after='0',matched=false,total=0;
  const seen=new Set();
  for(let page=0;page<MAX_PAGES;page++){
    const members=await getJson('/guilds/'+GUILD+'/members?limit='+LIMIT+'&after='+after,transport);
    if(!Array.isArray(members)||members.length>LIMIT)throw Error('invalid-member-page');
    let last=after;
    for(const member of members){
      const id=String(member?.user?.id||'');
      if(!SNOWFLAKE.test(id)||BigInt(id)<=BigInt(last)||seen.has(id)||
         !Array.isArray(member.roles))throw Error('incomplete-member-evidence');
      seen.add(id);
      if(id!==String(ownerId||'')&&member.roles.some(role=>targets.has(String(role))))
        matched=true;
      last=id;
      total++;
    }
    if(members.length<LIMIT){
      if(total===0)throw Error('empty-member-roster-unverifiable');
      return matched
        ?status('ASSIGNED_PRIVATE_REVIEW_REQUIRED','at least one non-owner has an unapproved Administrator-capable role')
        :status('NO_NONOWNER_ASSIGNMENTS_OBSERVED','complete member enumeration found no non-owner assignments of unapproved Administrator-capable roles');
    }
    if(last===after)throw Error('member-pagination-stalled');
    after=last;
  }
  return status('INCONCLUSIVE_TOO_MANY_MEMBERS','member-list pagination bound reached; no privacy clearance');
}
async function audit({transport=fetch}={}){
  if(!TOKEN)throw Error('bot-token-unavailable');
  const bot=await getJson('/users/@me',transport);
  if(!SNOWFLAKE.test(String(bot?.id||'')))throw Error('bot-identity-unverified');
  const [roles,channels,botMember,guild]=await Promise.all([
    getJson('/guilds/'+GUILD+'/roles',transport),
    getJson('/guilds/'+GUILD+'/channels',transport),
    getJson('/guilds/'+GUILD+'/members/'+bot.id,transport),
    getJson('/guilds/'+GUILD,transport)
  ]);
  if(!Array.isArray(roles)||!Array.isArray(channels)||
     !Array.isArray(botMember.roles)||String(guild?.id||'')!==GUILD||
     !SNOWFLAKE.test(String(guild?.owner_id||'')))
    return status('INCONCLUSIVE_METADATA','role/channel/bot-member/owner evidence incomplete');
  const matches=channels.filter(c=>String(c.id)===String(TARGETS[0].id));
  if(matches.length!==1)
    return status('INCONCLUSIVE_REGISTER_CHANNEL','private register channel not uniquely visible to bot');
  const boundary=assessChannel(TARGETS[0],matches[0],roles,{
    guildId:GUILD,botId:bot.id,botRoleIds:botMember.roles
  });
  if(boundary.status==='UNVERIFIED')
    return status('STRUCTURAL_REVIEW_REQUIRED','private Driver Register permission contract is not verified');
  const candidates=roleCandidates(roles,bot.id);
  if(candidates.guildWide)return status('GUILD_WIDE_ADMINISTRATOR','@everyone holds Administrator; register channel overwrite cannot protect data');
  if(candidates.identities.length===0)return status('NO_UNAPPROVED_ADMIN_ROLES','structural role metadata has no extra Administrator bypass role; owner and explicitly authorized roles remain outside this check');
  try {
    return await scanMemberAssignments(candidates.identities,{transport,ownerId:guild.owner_id});
  }catch{
    return status('INCONCLUSIVE_MEMBER_LIST','complete Guild Members enumeration was unavailable, e.g. privileged members intent or permissions');
  }
}
function main(){
  return audit().then(result=>{
    // Public GitHub Actions logs contain only the standard status code and
    // generic audit contract. NEVER log role/member IDs, names or counts.
    console.log('[Kings Driver Register Administrator Assignment] '+result.code);
    if(result.code.startsWith('INCONCLUSIVE')||result.code==='ASSIGNED_PRIVATE_REVIEW_REQUIRED'||
       result.code==='GUILD_WIDE_ADMINISTRATOR'||result.code==='STRUCTURAL_REVIEW_REQUIRED')
      console.log('::warning::Kings protected register Administrator-assignment review is not cleared; private CEO/Management policy verification is required.');
    else
      console.log('Audit sampled current guild configuration only; future assignments and CEO-approved access still require private oversight.');
    console.log('Read-only role/member evidence; zero private message reads, zero Discord writes, zero stored identities.');
  });
}
if(require.main===module)main().catch(()=>{
  console.error('Kings Administrator-assignment read-only audit unavailable; no privacy clearance claimed. No identities logged.');
  process.exitCode=1;
});
module.exports={isAdmin,roleCandidates,routeAllowed,scanMemberAssignments,audit,status};
