'use strict';
// Advisory-only Discord notifications. Never modifies a convoy, approval, or forum tag.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const REPORT='output/convoy-planning-limits.json';
const STATE='data/convoy-planning-alert-state.json';
function keyOf(w){const stable=w.code==='external-month-threshold'?[w.code,w.period,w.threshold]:w.code==='departure-under-two-hours'?[w.code,...[w.first,w.second].sort()]:[w.code,w.period];return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0,24);}
function pending(warnings,state){
  const sent=new Set(Array.isArray(state?.sent)?state.sent:[]);
  return (warnings||[]).map(w=>({key:keyOf(w),warning:w})).filter(x=>!sent.has(x.key));
}
function describe(w){
  if(w.code==='external-month-threshold')return 'External Convoys: '+w.count+'/20 in '+w.period+' (threshold '+w.threshold+'/20).';
  if(w.code==='external-month-over-limit')return 'External Convoys exceed monthly limit: '+w.count+'/20 in '+w.period+'.';
  if(w.code==='external-day-over-limit')return 'External Convoys exceed daily limit: '+w.count+'/2 on '+w.period+'.';
  if(w.code==='partner-day-over-limit')return 'Partner Convoys exceed daily limit: '+w.count+'/3 on '+w.period+'.';
  if(w.code==='departure-under-two-hours')return 'Departure conflict: '+w.first+' and '+w.second+' are '+w.minutesApart+' minutes apart (minimum 120).';
  return 'Planning advisory: '+w.code;
}
async function main(){
  if(!fs.existsSync(REPORT))throw Error('Planning report not found');
  const report=JSON.parse(fs.readFileSync(REPORT,'utf8'));
  if(report.mode!=='advisory-only'||!Array.isArray(report.warnings))throw Error('Invalid advisory report');
  const existing=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{version:1,sent:[]};
  if(!Array.isArray(existing.sent))throw Error('Invalid alert state');
  const monthNow=new Date().toISOString().slice(0,7);
  const activeWarnings=report.warnings.filter(w=>String(w.period||'').slice(0,7)>=monthNow);
  const notices=pending(activeWarnings,existing);
  if(!notices.length){console.log('No new convoy planning warnings.');return;}
  if(process.env.CONVOY_DRY_RUN==='true'){console.log('Read-only: '+notices.map(n=>describe(n.warning)).join(' | '));return;}
  const token=process.env.DISCORD_BOT_TOKEN;
  const guild=process.env.DISCORD_GUILD_ID;
  if(!token||!guild)throw Error('Discord settings missing');
  async function call(uri,options={}){
    const res=await fetch('https://discord.com/api/v10'+uri,{...options,headers:{Authorization:'Bot '+token,'Content-Type':'application/json','User-Agent':'Kings Convoy Planning Alerts/1.0'}});
    if(!res.ok)throw Error('Discord '+res.status+' '+(await res.text()).slice(0,250));
    return res.status===204?null:res.json();
  }
  let channel=process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_ID;
  if(!channel){
    const channels=await call('/guilds/'+guild+'/channels');
    const matches=channels.filter(c=>String(c.name||'').replace(/^[^a-z]+/i,'').toLowerCase()==='event-leadership');
    if(matches.length!==1)throw Error('Cannot uniquely resolve event-leadership channel');
    channel=matches[0].id;
  }
  // Discord is the recovery ledger if the state commit failed after posting.
  // Only inspect the latest 100 messages; older state remains in Git.
  const recent=await call('/channels/'+channel+'/messages?limit=100');
  const posted=new Set((Array.isArray(recent)?recent:[]).flatMap(message=>{
    const match=String(message.content||'').match(/Convoy Alert Key: ([a-f0-9]{24})/);
    return match?[match[1]]:[];
  }));
  const state={version:1,sent:[...existing.sent]};
  for(const notice of notices){
    if(posted.has(notice.key)){
      console.log('Recovered previously posted alert '+notice.key);
    }else{
      await call('/channels/'+channel+'/messages',{method:'POST',body:JSON.stringify({content:'⚠️ **Kings Convoy Planning Advisory**\n'+describe(notice.warning)+'\nReview in Convoy Center. No convoy status has been changed.\nConvoy Alert Key: '+notice.key,allowed_mentions:{parse:[]}})});
      posted.add(notice.key);
    }
    state.sent.push(notice.key);
    // Persist locally after each successful send; pipeline commits after the batch.
    fs.mkdirSync(path.dirname(STATE),{recursive:true});
    fs.writeFileSync(STATE,JSON.stringify(state,null,2)+'\n');
  }
  console.log('Sent '+notices.length+' new advisories.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={keyOf,pending,describe};
