'use strict';
const fs=require('node:fs');
const REPORT='output/convoy-check-results.json', PREVIOUS='data/convoy-completeness-state.json', OUT='output/convoy-completeness.json';
function inspect(report,previous={},now=Date.now()){
 const current=Number(report?.summary?.actualConvoys);
 const errors=Number(report?.summary?.errors||0);
 const active=Number(report?.summary?.activeThreads||0);
 const archived=Number(report?.summary?.archivedThreads||0);
 const stamp=Date.parse(report?.generatedAt||'');
 const ageMinutes=Number.isFinite(stamp)?Math.round((now-stamp)/60000):null;
 const priorCount=Number(previous.actualConvoys);
 const drop=Number.isFinite(priorCount)&&priorCount>=10&&Number.isFinite(current)&&current<priorCount*0.7;
 const issues=[];
 if(!Number.isFinite(current)||current<0)issues.push('missing-total');
 if(ageMinutes===null||ageMinutes< -5||ageMinutes>45)issues.push('stale-checker-data');
 if(errors>0)issues.push('unreadable-threads');
 if(drop)issues.push('unexpected-count-drop');
 if(current===0&&Number.isFinite(priorCount)&&priorCount>0)issues.push('all-threads-missing');
 return {checkedAt:new Date(now).toISOString(),status:issues.length?'warning':'ok',issues,actualConvoys:current,priorCount:Number.isFinite(priorCount)?priorCount:null,activeThreads:active,archivedThreads:archived,readErrors:errors,ageMinutes};
}
function run(){
 if(!fs.existsSync(REPORT))throw Error('Convoy checker report missing');
 const report=JSON.parse(fs.readFileSync(REPORT,'utf8'));
 const previous=fs.existsSync(PREVIOUS)?JSON.parse(fs.readFileSync(PREVIOUS,'utf8')):{};
 const result=inspect(report,previous);
 fs.mkdirSync('output',{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(result,null,2));
 console.log('Convoy completeness '+result.status+': '+result.issues.join(', '));
 // Never overwrite a good baseline with suspect or incomplete data.
 if(result.status==='ok'){
   fs.mkdirSync('data',{recursive:true});
   fs.writeFileSync(PREVIOUS,JSON.stringify({updatedAt:result.checkedAt,actualConvoys:result.actualConvoys,activeThreads:result.activeThreads,archivedThreads:result.archivedThreads},null,2)+'\n');
 }else process.exitCode=1;
}
if(require.main===module)try{run()}catch(e){console.error(e);process.exitCode=1}
module.exports={inspect};
