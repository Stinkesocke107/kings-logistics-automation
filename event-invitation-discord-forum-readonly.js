'use strict';
// DRAFT / PRIVATE / GET-ONLY — preview EXISTING invite-tracker forum layout.
// One forum thread per convoy; Staff may post free-form VTC invitation entries.
// NEVER infer acceptance, sent delivery, or a Kings Event booking from text.
const {makeKingsDiscordReadOnlyRequest,reduceKingsDiscordReadOnlyPage}
  =require('./event-capacity-discord-rest-readonly-contract');
const {PERMISSIONS,basePermissions,effectiveChannelPermissions}
  =require('./discord-permission-audit');
const ERROR='Kings Event Invitation forum source inspection refused.';
const ID=/^[1-9]\d{16,21}$/;
const GUILD='1114967437788577792';
const MAX_THREADS=40,MAX_PAGES=5,MAX_AUTHORS=25;
function fail(){throw Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function time(x){
  if(typeof x!=='string'||x.length>48)fail();
  const t=Date.parse(x);if(!Number.isFinite(t))fail();return t;
}
function has(value,bit){return (value&bit)===bit;}
async function scanKingsInvitationForumContent({
  get,config,asOfUtc,channel,roles,staffIds,authorization
}={}){
  try{
    if(typeof get!=='function'||!plain(config)||
      config.guildId!==GUILD||!ID.test(config.channelId)||
      !plain(channel)||channel.id!==config.channelId||
      channel.guild_id!==GUILD||channel.type!==15||
      !Array.isArray(roles)||!(staffIds instanceof Set)||
      !authorization?.byId)fail();
    const at=time(asOfUtc),threads=[],unique=new Set();
    function addThread(row){
      if(!plain(row)||!ID.test(row.id)||row.parent_id!==config.channelId||
        unique.has(row.id))fail();
      unique.add(row.id);threads.push(row);
      if(threads.length>MAX_THREADS)fail();
    }
    // Existing Discord forum's active threads; the shared contract verifies
    // API shape and parent filtering. It does not claim full deleted history.
    const activePlan=makeKingsDiscordReadOnlyRequest({
      guildId:GUILD,channelId:config.channelId,
      sourceKind:'current-forum',stream:'active'
    });
    const active=await get(activePlan.path);
    const a=reduceKingsDiscordReadOnlyPage({
      request:activePlan,response:{status:200,data:active},
      fetchedAtUtc:asOfUtc
    });
    if(a.status!=='ok'||!plain(active)||!Array.isArray(active.threads))fail();
    for(const t of active.threads){
      if(t.parent_id===config.channelId)addThread(t);
    }
    let cursor=null,archivesDone=false;
    for(let page=0;page<MAX_PAGES;page++){
      const plan=makeKingsDiscordReadOnlyRequest({
        guildId:GUILD,channelId:config.channelId,
        sourceKind:'current-forum',stream:'archived-public',
        before:cursor,limit:100
      });
      const data=await get(plan.path);
      const r=reduceKingsDiscordReadOnlyPage({
        request:plan,response:{status:200,data},
        fetchedAtUtc:asOfUtc
      });
      if(r.status!=='ok')fail();
      for(const t of data.threads)addThread(t);
      if(!r.hasMore){archivesDone=true;break;}
      if(page===MAX_PAGES-1)fail();
      cursor=r.nextCursor;if(cursor===null)fail();
    }
    if(!archivesDone)fail();
    let candidateEntries=0,missingEventLinks=0,ambiguousEventLinks=0;
    const authors=new Set();
    for(const thread of threads){
      const found=new Set();
      const texts=[];
      if(typeof thread.name==='string')texts.push(thread.name);
      let before=null,done=false;
      for(let page=0;page<MAX_PAGES;page++){
        const plan=makeKingsDiscordReadOnlyRequest({
          guildId:GUILD,channelId:thread.id,sourceKind:'legacy-text',
          stream:'messages',before,limit:100
        });
        const rows=await get(plan.path);
        const receipt=reduceKingsDiscordReadOnlyPage({
          request:plan,response:{status:200,data:rows},
          fetchedAtUtc:asOfUtc
        });
        if(receipt.status!=='ok')fail();
        for(const msg of rows){
          if(!plain(msg)||!ID.test(msg.id)||msg.channel_id!==thread.id||
            !plain(msg.author)||!ID.test(msg.author.id)||
            typeof msg.content!=='string'||msg.content.length>10000||
            time(msg.timestamp)>at)fail();
          texts.push(msg.content);
          // The existing human-readable tracker format MAY use VTC,
          // VTC Link and Invited by. This is an untrusted candidate only.
          const labels=['VTC','VTC Link','Invited by']
            .filter(label=>new RegExp('(?:^|\\n)\\s*'+label+
              '\\s*:', 'i').test(msg.content));
          if(labels.length>=2){
            if(msg.author.bot===true)fail();
            candidateEntries++;
            authors.add(msg.author.id);
          }
        }
        if(!receipt.hasMore){done=true;break;}
        if(page===MAX_PAGES-1)fail();
        before=receipt.nextCursor;if(before===null)fail();
      }
      if(!done)fail();
      for(const str of texts){
        for(const match of str.matchAll(/truckersmp\.com\/events\/([0-9]{1,8})\b/gi))
          found.add(match[1]);
      }
      if(found.size===0)missingEventLinks++;
      else if(found.size>1)ambiguousEventLinks++;
    }
    if(authors.size>MAX_AUTHORS)fail();
    for(const id of authors){
      const member=await get('/guilds/'+GUILD+'/members/'+id);
      if(!plain(member)||member.user?.id!==id||
        member.user?.bot===true||!Array.isArray(member.roles)||
        member.roles.length>100||
        new Set(member.roles).size!==member.roles.length||
        !member.roles.every(x=>typeof x==='string'&&ID.test(x)&&
          authorization.byId.has(x))||
        !member.roles.some(x=>staffIds.has(x)))fail();
      const p=effectiveChannelPermissions(channel,GUILD,id,member.roles,
        basePermissions(GUILD,member.roles,roles));
      if(!has(p,PERMISSIONS.VIEW_CHANNEL)||
        !has(p,PERMISSIONS.READ_MESSAGE_HISTORY))fail();
    }
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      sourceKind:'EXISTING_OUTBOUND_INVITE_FORUM_REVIEW',
      sourceAccess:'DISCORD_GET_OBSERVED_WITH_RUNTIME_BOT',
      forumThreadClaims:threads.length,
      staffInvitationEntryClaims:candidateEntries,
      threadsWithoutSingleEventLink:missingEventLinks,
      threadsWithAmbiguousEventLinks:ambiguousEventLinks,
      currentlyAuthorizedEntryAuthors:authors.size,
      structuredInvitationLifecycleImported:0,
      historicalEventCoverageVerified:false,
      organizerRepliesIndependentlyVerified:false,
      originalOrganizerResponsesIndependentlyVerified:false,
      authorsHistoricalRolesIndependentlyVerified:false,
      staffApprovalsCommitted:0,eventBookingsCreated:0,remindersSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={scanKingsInvitationForumContent};
