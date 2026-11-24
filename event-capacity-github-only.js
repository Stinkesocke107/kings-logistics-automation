'use strict';
// GitHub Actions-only / outbound Discord REST Event Capacity read-only worker.
// No Gateway, HTTP interaction endpoint, database, permanent process or writes
// to real Convoy Center. Does not certify event capacity without staff decisions.
const {assertRun,assertArtifact}=require('./event-capacity-private-import');
const {parsePrivateConvoyArchive}=require('./event-capacity-private-archive');
const {reconcileSourceInventory}=require('./event-capacity-source-reconcile');
const ERROR='Kings Event Capacity GitHub-only publication rejected.';
const GUILD=/^\d{17,22}$/;
const VIEW=1024n;
const SEND=2048n;
const REPO='Stinkesocke107/kings-logistics-automation';
const MARKER='**Kings Event Capacity | GitHub Actions**';
function fail(){throw new Error(ERROR);}
function snowflake(v){if(!GUILD.test(String(v||'')))fail();return String(v);}
function configCheck({guildId,channelId,messageId=null,roles}={}){
  const checked={guildId:snowflake(guildId),channelId:snowflake(channelId)};
  if(messageId!==null)checked.messageId=snowflake(messageId);
  if(!roles||typeof roles!=='object'||Array.isArray(roles))fail();
  const required=['Event Coordination','Event Leadership','CEO'];
  if(Object.keys(roles).sort().join(',')!==required.slice().sort().join(','))fail();
  const ids=required.map(r=>snowflake(roles[r]));
  if(new Set(ids).size!==3||ids.includes(checked.guildId))fail();
  checked.roles=Object.freeze(Object.fromEntries(required.map((r,i)=>[r,ids[i]])));
  return Object.freeze(checked);
}
function mask(v){
  try{
    if(typeof v!=='string'&&!Number.isSafeInteger(v))fail();
    const s=String(v);
    if(!/^\d{1,22}$/.test(s))fail();
    return BigInt(s);
  }catch{fail();}
}
function validateChannelPrivacy(channel,roles,config,{botId}={}){
  if(!channel||String(channel.id)!==config.channelId||
    String(channel.guild_id)!==config.guildId||
    ![0,5].includes(channel.type)||!Array.isArray(channel.permission_overwrites)||
    !Array.isArray(roles)||!roles.length)fail();
  const known=new Set(roles.map(r=>String(r.id)));
  const allowed=new Set(Object.values(config.roles));
  if([...allowed].some(x=>!known.has(x)))fail();
  const guildEveryone=channel.permission_overwrites.filter(x=>
    x.type===0&&String(x.id)===config.guildId);
  if(guildEveryone.length!==1||(mask(guildEveryone[0].deny)&VIEW)!==VIEW||
    (mask(guildEveryone[0].allow)&VIEW)!==0n)fail();
  for(const roleId of allowed){
    const entries=channel.permission_overwrites.filter(x=>
      x.type===0&&String(x.id)===roleId);
    if(entries.length!==1||(mask(entries[0].allow)&VIEW)!==VIEW||
      (mask(entries[0].deny)&VIEW)!==0n)fail();
  }
  for(const overwrite of channel.permission_overwrites){
    if(!overwrite||![0,1].includes(overwrite.type))fail();
    if((mask(overwrite.allow)&VIEW)!==VIEW)continue;
    if(overwrite.type===0&&!allowed.has(String(overwrite.id))||
      overwrite.type===1&&String(overwrite.id)!==String(botId||''))fail();
  }
  // Guild owner and roles with Administrator can bypass overwrites. A private
  // admin must explicitly verify current effective Discord permissions.
  return true;
}
async function verifySourceFreshness(reader,nowMs=Date.now()){
  if(!reader||typeof reader.getLatestScheduledRun!=='function'||
    typeof reader.getRun!=='function'||typeof reader.getArtifacts!=='function'||
    typeof reader.readArtifact!=='function'||!Number.isFinite(nowMs))fail();
  try{
    const candidate=await reader.getLatestScheduledRun({repository:REPO,nowMs});
    const run=assertRun(await reader.getRun({repository:REPO,runId:candidate.runId}),
      {nowMs,requestedRunId:candidate.runId});
    if(run.attempt!==candidate.attempt)fail();
    const artifact=assertArtifact(await reader.getArtifacts({
      repository:REPO,runId:run.id
    }),run);
    const bytes=await reader.readArtifact({repository:REPO,runId:run.id,
      runAttempt:run.attempt,artifactId:artifact.id,
      maxArchiveBytes:25*1024*1024,
      requiredFiles:['convoy-check-results.json','convoy-overview.json']});
    if(!Buffer.isBuffer(bytes)||bytes.length!==artifact.bytes)fail();
    const data=parsePrivateConvoyArchive(bytes);
    if(reconcileSourceInventory(data.report,data.overview).ok!==true)fail();
    // Source provenance verified; human classification/acceptance/exception
    // decisions have NOT been independently verified in GitHub-only mode.
    return Object.freeze({sourceAvailable:true,runId:run.id,
      classificationsVerified:false,verifiedFreeSlots:false});
  }catch{
    return Object.freeze({sourceAvailable:false,runId:null,
      classificationsVerified:false,verifiedFreeSlots:false});
  }
}
function messageFor({sourceAvailable=false,nowMs=Date.now()}={}){
  if(typeof sourceAvailable!=='boolean'||!Number.isFinite(nowMs))fail();
  const firstMonth=new Date(nowMs).toISOString().slice(0,7);
  const lines=[];
  for(let i=0;i<3;i++){
    const d=new Date(Date.UTC(Number(firstMonth.slice(0,4)),
      Number(firstMonth.slice(5,7))-1+i,1));
    const month=d.toISOString().slice(0,7);
    lines.push('**'+month+' UTC** · ? Availability unverified');
  }
  const status=sourceAvailable?'Needs Verification':'Data Outdated';
  return MARKER+'\n'+
    '**Status: '+status+'**\n'+
    (sourceAvailable?
      'Convoy Center report source checked. Staff classification and accepted status need separate verification.\n':
      'No current verified Convoy Center report was available.\n')+
    lines.join('\n')+'\n'+
    'Limits: 2 Partner + External per UTC day; 20 Partner / 20 External per UTC month; Kings events unlimited.\n'+
    '**No free slots are confirmed by this preview.** No events or approvals are changed.';
}
function createDiscordRest({token,transport=fetch}={}){
  if(typeof token!=='string'||token.length<25||token.length>200||
    /[\r\n]/.test(token)||typeof transport!=='function')fail();
  const BASE='https://discord.com/api/v10';
  async function api(method,route,body=null){
    const headers={
      Authorization:'Bot '+token,
      Accept:'application/json',
      'User-Agent':'Kings-Event-Capacity-GitHub-Actions'
    };
    if(body!==null)headers['Content-Type']='application/json';
    let response;
    try{
      response=await transport(BASE+route,{method,headers,redirect:'manual',
        signal:AbortSignal.timeout(15000),
        ...(body!==null?{body:JSON.stringify(body)}:{})});
    }catch{fail();}
    if(!response||response.ok!==true||
      ![200,201,204].includes(response.status))fail();
    if(response.status===204)return null;
    try{
      const raw=await response.text();
      if(raw.length>1048576)fail();
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed!=='object')fail();
      return parsed;
    }catch{fail();}
  }
  return Object.freeze({
    me:()=>api('GET','/users/@me'),
    roles:guildId=>api('GET','/guilds/'+snowflake(guildId)+'/roles'),
    channel:channelId=>api('GET','/channels/'+snowflake(channelId)),
    message:(channelId,messageId)=>api('GET','/channels/'+snowflake(channelId)+
      '/messages/'+snowflake(messageId)),
    recent:channelId=>api('GET','/channels/'+snowflake(channelId)+
      '/messages?limit=100'),
    create:(channelId,payload)=>api('POST','/channels/'+snowflake(channelId)+
      '/messages',payload),
    edit:(channelId,messageId,payload)=>api('PATCH','/channels/'+snowflake(channelId)+
      '/messages/'+snowflake(messageId),payload)
  });
}
async function publishGithubOnlyStatus({client,config,sourceAvailable=false,
  mode='preview',manualDispatch=false,nowMs=Date.now()}={}){
  if(!['preview','sync','bootstrap'].includes(mode)||!Number.isFinite(nowMs))fail();
  const content=messageFor({sourceAvailable,nowMs});
  // A no-network preview needs no Discord token, channel or role IDs.
  if(mode==='preview')return Object.freeze({state:'Preview',content});
  const c=configCheck(config);
  if(!client||['me','roles','channel','message','recent','create','edit']
    .some(k=>typeof client[k]!=='function'))fail();
  // Live Discord writing requires explicit opt-in in the workflow AND a real,
  // currently verified restricted channel, with no arbitrary public IDs.
  let me,channel,roles;
  try{
    [me,channel,roles]=await Promise.all([
      client.me(),client.channel(c.channelId),client.roles(c.guildId)
    ]);
    snowflake(me?.id);
    validateChannelPrivacy(channel,roles,c,{botId:me.id});
  }catch{fail();}
  const payload={content,allowed_mentions:{parse:[]}};
  if(mode==='bootstrap'){
    // One-time manual setup only in an EMPTY private channel.
    if(manualDispatch!==true||c.messageId!==undefined)fail();
    let recent;
    try{recent=await client.recent(c.channelId);}catch{fail();}
    if(!Array.isArray(recent)||recent.length!==0)fail();
    let created;
    try{created=await client.create(c.channelId,payload);}catch{fail();}
    return Object.freeze({state:'Bootstrapped',messageId:snowflake(created?.id)});
  }
  if(c.messageId===undefined)fail();
  let previous;
  try{previous=await client.message(c.channelId,c.messageId);}catch{fail();}
  if(previous?.author?.id!==me.id||String(previous.channel_id)!==c.channelId||
    typeof previous.content!=='string'||!previous.content.startsWith(MARKER))fail();
  if(previous.content===content)return Object.freeze({state:'Unchanged'});
  try{await client.edit(c.channelId,c.messageId,payload);}catch{fail();}
  return Object.freeze({state:'Updated'});
}
module.exports={configCheck,validateChannelPrivacy,verifySourceFreshness,
  messageFor,createDiscordRest,publishGithubOnlyStatus};
