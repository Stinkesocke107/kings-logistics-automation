'use strict';
// Read-only private register diagnostics. A malformed Management entry may
// block the strict Loyalty loader, but we can still point Management to its
// message without copying private dates/IDs to GitHub logs or other channels.
const {
  parseDriverIdentityRecords, createPlatformIndex, addIdentityToIndex
} = require('./driver-identity-register');
const {assertPrivateChannel,authorizedManager}=require('./driver-loyalty-register');

const GUILD='1114967437788577792';
const CHANNEL='1572736232969084948';
const PREFIX='👑 **Kings Driver Register Audit | ';
function isSnowflake(value){return /^\d{17,20}$/.test(String(value||''));}
function issueKind(error){
  const m=String(error?.message||'');
  if(/non-Management member/i.test(m))return 'Author not authorized';
  if(/Duplicate .*ID|Duplicate field|duplicate.*register/i.test(m))return 'Duplicate ID or field';
  if(/joining date|future Kings/i.test(m))return 'Invalid or missing joining date';
  if(/Discord ID/i.test(m))return 'Invalid Discord ID';
  if(/truckersmp ID|haulmp ID|trucklinemp ID/i.test(m))return 'Invalid platform ID';
  if(/record field or line|batch header/i.test(m))return 'Unrecognized field or extra text';
  if(/batch must contain|Invalid or duplicate Driver identity/i.test(m))return 'Invalid batch structure';
  return 'Invalid private register entry';
}
function looksLikeWrappedEntry(content){
  const value=String(content||'');
  return /(?:^|\n)\s*(?:id|discord_id)\s*:/i.test(value) &&
    /^\s*(?:\x60{3}|>|\*\*|[0-9]+\.\s)/.test(value);
}
async function inspectRegisterMessages(discord,roles,members,botId){
  if(typeof discord!=='function' || !Array.isArray(roles) || !Array.isArray(members) ||
     !isSnowflake(botId))throw Error('Invalid private Kings register audit setup.');
  const [channels,guild]=await Promise.all([
    discord('/guilds/'+GUILD+'/channels'),discord('/guilds/'+GUILD)
  ]);
  if(!Array.isArray(channels) || !isSnowflake(guild?.owner_id))
    throw Error('Cannot verify private register guild and channel directory.');
  const matches=channels.filter(c=>String(c.id)===CHANNEL);
  if(matches.length!==1)throw Error('Private register channel missing or ambiguous.');
  assertPrivateChannel(matches[0],GUILD,roles,members,guild.owner_id,botId);

  const seenUsers=new Set(),platformIndex=createPlatformIndex(),issues=[];
  let before='',scanned=0,validEntries=0;
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({limit:'100'});
    if(before)qs.set('before',before);
    const batch=await discord('/channels/'+CHANNEL+'/messages?'+qs);
    if(!Array.isArray(batch))throw Error('Cannot read private register message page.');
    for(const message of batch){
      scanned++;
      if(!isSnowflake(message?.id))throw Error('Invalid private register message cursor.');
      try{
        const parsed=parseDriverIdentityRecords(message.content);
        if(!parsed.length){
          if(looksLikeWrappedEntry(message.content))
            throw Error('Invalid Kings Driver identity record field or line.');
          continue;
        }
        if(!authorizedManager(message.author?.id,members,roles,guild.owner_id))
          throw Error('Loyalty record was posted by a non-Management member.');
        for(const entry of parsed){
          if(seenUsers.has(entry.userId))
            throw Error('Duplicate register Discord ID.');
          addIdentityToIndex(platformIndex,entry);
          seenUsers.add(entry.userId);
          validEntries++;
        }
      }catch(error){
        issues.push({messageId:String(message.id),kind:issueKind(error)});
      }
    }
    if(batch.length<100)return {issues,scanned,validEntries};
    before=String(batch.at(-1)?.id||'');
    if(!isSnowflake(before))throw Error('Invalid private register message pagination.');
  }
  throw Error('Private register exceeds safe 2000-message diagnostic scan.');
}
function diagnosticPages(report,maxLength=1900){
  if(!report || !Array.isArray(report.issues) || !report.issues.length)
    throw Error('No malformed entries to report.');
  const summaryMarker=PREFIX+'Summary**';
  const summary=[
    summaryMarker,
    '**INCOMPLETE — correct private register entry formatting**',
    'Unsafe or malformed Management register records found: **'+report.issues.length+'**.',
    'Messages scanned: '+report.scanned+
      '. Initially parseable records: '+report.validEntries+' (NOT a completed registration).',
    'Fix each linked entry in <#'+CHANNEL+'>, then rerun the audit.',
    'No Driver IDs, dates or record contents are copied into Leadership.',
    'No Loyalty roles or register entries were modified.'
  ].join('\n');
  const pages=[{marker:summaryMarker,content:summary}];
  const chunks=[];
  let current=[];
  for(const item of report.issues){
    if(!isSnowflake(item.messageId))throw Error('Invalid private diagnostic message locator.');
    const kind=String(item.kind||'Invalid register entry');
    if(!/^[a-zA-Z ,/-]{5,80}$/.test(kind))throw Error('Invalid diagnostic classification.');
    const line='• [Open entry](https://discord.com/channels/'+GUILD+'/'+CHANNEL+
      '/'+item.messageId+') — '+kind;
    if(current.length && (current.join('\n').length+line.length+170>maxLength)){
      chunks.push(current);current=[];
    }
    current.push(line);
  }
  if(current.length)chunks.push(current);
  if(chunks.length>30)throw Error('Too many malformed entry pages to publish safely.');
  for(let i=0;i<chunks.length;i++){
    const marker=PREFIX+'Invalid Entries '+(i+1)+'/';
    const content=marker+chunks.length+'**\n'+
      'Private register entry corrections only — no account data is shown.\n'+chunks[i].join('\n');
    if(content.length>maxLength)throw Error('Diagnostic page exceeds Discord text limit.');
    pages.push({marker,content});
  }
  return pages;
}
module.exports={inspectRegisterMessages,diagnosticPages,issueKind,looksLikeWrappedEntry};
