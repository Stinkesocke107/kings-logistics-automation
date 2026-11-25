'use strict';
// REVIEWED DECISION DRY-RUN STAGER — no GitHub/Discord writes.
// The injected readVerifiedSource MUST be an authenticated first-party
// Convoy Checker archive reader, NEVER a caller-supplied boolean or webhook.
// protectedVault MUST be the offline-owner-pinned read-only vault wrapper.
// The resulting command is a candidate, NOT final approval authority.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {validateLedger,applyDecision}=require('./event-capacity-decision-ledger');
const {verifyHumanReview}=require('./event-capacity-human-review');
const {checkedReport,sourceIdentity,assessment}
  =require('./event-capacity-github-decision-evidence');
const ERROR='Kings Event Capacity reviewed decision cannot be staged securely.';
const RUN=/^[1-9]\d{5,19}$/;
const HEX=/^[a-f0-9]{64}$/;
function fail(){throw new Error(ERROR);}
function sourceProof(value,proposal,nowMs,scope){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    value.sourceKind!=='authenticated-kings-convoy-checker'||
    !RUN.test(String(value.runId||''))||
    !Number.isSafeInteger(value.attempt)||value.attempt<1||
    value.attempt>100||!Number.isFinite(nowMs)||
    value.archiveDigest!==undefined&&!HEX.test(value.archiveDigest)||
    value.headSha!==undefined&&!/^[a-f0-9]{40}$/.test(value.headSha)||
    value.artifactId!==undefined&&!/^[1-9]\d{5,19}$/.test(String(value.artifactId)))fail();
  checkedReport(value.report,value.overview,nowMs);
  if(value.report.guildId!==scope.guildId||
    value.report.forumId!==scope.forumId)fail();
  const match=sourceIdentity(value.report,proposal.ref);
  if(match.state!=='Matched'||assessment(proposal,match)!=='Needs Human Review')
    fail();
  const digest=crypto.createHash('sha256').update(
    JSON.stringify({
      runId:value.runId,attempt:value.attempt,
      // Authenticated source adapter contributes the raw ZIP digest and
      // precise GitHub commit/artifact identity. Non-attested legacy
      // synthetic test sources retain explicit null markers.
      archiveDigest:value.archiveDigest??null,
      headSha:value.headSha??null,artifactId:value.artifactId??null,
      report:value.report,overview:value.overview
    })
  ).digest('hex');
  if(!HEX.test(digest))fail();
  return {runId:String(value.runId),attempt:value.attempt,digest};
}
async function stageReviewedDecision({
  readVerifiedSource,protectedVault,client,config,scope,
  proposal,challenge,reviewMessageId,secret,nowMs=Date.now()
}={}){
  if(typeof readVerifiedSource!=='function'||!protectedVault||
    typeof protectedVault.read!=='function'||!Number.isFinite(nowMs)||
    !scope||typeof scope.guildId!=='string'||
    typeof scope.forumId!=='string')fail();
  try{
    // The owner-pinned vault protects against both old and unpinned
    // newer encrypted states. We never invoke commitDecision here.
    const before=await protectedVault.read();
    validateLedger(before.ledger,scope);
    if(!before.checkpoint||
      before.checkpoint.revision!==before.ledger.revision)fail();
    const source=sourceProof(await readVerifiedSource(),proposal,nowMs,scope);
    if(source.runId!==challenge?.runId||
      challenge.ledgerRevision!==before.ledger.revision)fail();
    const review=await verifyHumanReview({
      client,config,scope,proposal,challenge,
      sourceRunId:source.runId,ledgerRevision:before.ledger.revision,
      reviewMessageId,secret,nowMs
    });
    if(review.state!=='HumanReviewVerified'||
      review.decisionCommitted!==false||
      review.availabilityCertified!==false||
      review.ownerReceiptRequired!==true||
      !['CEO','Event Leadership'].includes(review.reviewerRole)||
      review.reviewerId===review.submitterId)fail();
    const finalSource=sourceProof(await readVerifiedSource(),
      proposal,nowMs,scope);
    const after=await protectedVault.read();
    if(!isDeepStrictEqual(source,finalSource)||
      !isDeepStrictEqual(before.checkpoint,after.checkpoint)||
      !isDeepStrictEqual(before.ledger,after.ledger))fail();
    const receipt={
      version:1,evidenceMessageId:proposal.messageId,
      reviewMessageId:String(reviewMessageId),
      submitterId:review.submitterId,
      reviewerId:review.reviewerId,sourceRunId:source.runId,
      sourceAttempt:source.attempt,sourceDigest:source.digest,
      verifiedAt:new Date(nowMs).toISOString()
    };
    const command={...review.candidate,reviewProof:receipt};
    const actor={
      id:review.reviewerId,source:'trusted-server-gateway',
      verifiedRoles:[review.reviewerRole]
    };
    // This checks the same ledger revision, authorization and durable
    // evidence/reviewer non-replay constraints that a later write must obey.
    const proposed=applyDecision(before.ledger,command,actor,
      receipt.verifiedAt);
    if(proposed.revision!==before.ledger.revision+1)fail();
    return Object.freeze({
      state:'ReadyForOwnerControlledCommit',readOnly:true,
      decisionCommitted:false,availabilityCertified:false,
      ownerReceiptRequired:true,
      expectedRevision:before.ledger.revision,
      command:Object.freeze(command),
      actor:Object.freeze(actor),
      sourceDigest:source.digest
    });
  }catch{fail();}
}
module.exports={stageReviewedDecision};
