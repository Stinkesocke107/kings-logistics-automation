'use strict';
// AUTHENTICATED GITHUB SOURCE BOUNDARY FOR REVIEWED CAPACITY DECISIONS.
// Read-only, never scheduled/activated by itself and never prints source data.
// The public source repo is fixed; API responses and ZIP bytes are bounded by
// the existing GitHub reader and private archive guards. The returned data are
// in-memory only. No self-hosted Discord Gateway or bot server is necessary.
const crypto=require('node:crypto');
const {createPrivateGitHubReader}=require('./event-capacity-github-source');
const {assertRun,assertArtifact}=require('./event-capacity-private-import');
const {parsePrivateConvoyArchive}=require('./event-capacity-private-archive');
const {checkedReport}=require('./event-capacity-github-decision-evidence');
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity authenticated GitHub source unavailable or unsafe.';
const REPO='Stinkesocke107/kings-logistics-automation';
const EXPECTED_GUILD='1114967437788577792';
const EXPECTED_FORUM='1550619824005062697';
const MAX_ZIP=25*1024*1024;
function fail(){throw new Error(ERROR);}
function verifyReportTimeline(data,runRaw,nowMs){
  if(!data||!data.report||!data.overview)fail();
  const report=data.report,overview=data.overview;
  checkedReport(report,overview,nowMs);
  if(report.guildId!==EXPECTED_GUILD||report.forumId!==EXPECTED_FORUM||
    overview.guildId!==EXPECTED_GUILD||overview.forumId!==EXPECTED_FORUM)fail();
  const started=timestamp(runRaw.run_started_at);
  const finished=timestamp(runRaw.updated_at);
  const generated=timestamp(report.generatedAt);
  const finalized=timestamp(report.finalization?.finalizedAt);
  const overviewAt=timestamp(overview.generatedAt);
  if([started,finished,generated,finalized,overviewAt].some(x=>x===null)||
    generated<started-60000||generated>finalized||
    finalized>overviewAt||overviewAt>finished+60000||
    overviewAt>nowMs+60000||
    nowMs-overviewAt>30*60000)fail();
}
function sourceFromReader({reader,nowMs=Date.now()}={}){
  if(!reader||['getLatestScheduledRun','getRun','getArtifacts','readArtifact']
    .some(k=>typeof reader[k]!=='function')||!Number.isFinite(nowMs))fail();
  async function readVerifiedSource(){
    try{
      const latest=await reader.getLatestScheduledRun({
        repository:REPO,nowMs
      });
      if(!latest||!/^[1-9]\d{5,19}$/.test(String(latest.runId||''))||
        !Number.isSafeInteger(latest.attempt)||latest.attempt<1)fail();
      const runRaw=await reader.getRun({
        repository:REPO,runId:latest.runId
      });
      const verified=assertRun(runRaw,{
        nowMs,requestedRunId:latest.runId
      });
      if(runRaw.event!=='schedule'||verified.attempt!==latest.attempt)fail();
      const artifact=assertArtifact(
        await reader.getArtifacts({repository:REPO,runId:verified.id}),verified
      );
      const bytes=await reader.readArtifact({
        repository:REPO,runId:verified.id,runAttempt:verified.attempt,
        artifactId:artifact.id,maxArchiveBytes:MAX_ZIP,
        requiredFiles:['convoy-check-results.json','convoy-overview.json']
      });
      if(!Buffer.isBuffer(bytes)||bytes.length!==artifact.bytes||
        bytes.length<22||bytes.length>MAX_ZIP)fail();
      const data=parsePrivateConvoyArchive(bytes);
      verifyReportTimeline(data,runRaw,nowMs);
      // Check the same scheduled run is still the latest authoritative source
      // after the potentially lengthy CDN download. A new scheduled run
      // arriving during the request must trigger a fresh private review.
      const [latestAfter,rawAfter]=await Promise.all([
        reader.getLatestScheduledRun({repository:REPO,nowMs}),
        reader.getRun({repository:REPO,runId:verified.id})
      ]);
      const after=assertRun(rawAfter,{
        nowMs,requestedRunId:verified.id
      });
      if(rawAfter.event!=='schedule'||after.id!==verified.id||
        after.attempt!==verified.attempt||after.sha!==verified.sha||
        String(latestAfter?.runId)!==verified.id||
        latestAfter.attempt!==verified.attempt)fail();
      const archiveDigest=crypto.createHash('sha256')
        .update('kings-event-capacity-convoy-zip-v1\0')
        .update(bytes).digest('hex');
      return Object.freeze({
        sourceKind:'authenticated-kings-convoy-checker',
        runId:verified.id,attempt:verified.attempt,
        headSha:verified.sha,artifactId:artifact.id,archiveDigest,
        report:data.report,overview:data.overview
      });
    }catch{fail();}
  }
  return readVerifiedSource;
}
function createAuthenticatedKingsSource({
  githubToken,transport=fetch,nowMs=()=>Date.now()
}={}){
  if(typeof nowMs!=='function')fail();
  // Token and transport are passed only to the strict, fixed-repository
  // API reader. No loose caller-supplied sourceKind flag is trusted here.
  let reader;
  try{
    reader=createPrivateGitHubReader({token:githubToken,transport});
  }catch{fail();}
  return async()=>{
    const current=nowMs();
    if(!Number.isFinite(current))fail();
    return sourceFromReader({reader,nowMs:current})();
  };
}
module.exports={createAuthenticatedKingsSource,sourceFromReader};
