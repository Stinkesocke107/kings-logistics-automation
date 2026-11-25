'use strict';
// PRIVATE-ONLY READ PATH. No Discord, production workflows or mutation.
// A successful double read authenticates a CURRENT GitHub report and owner-
// signed history archive, not every historical Convoy Center source record.
const {isDeepStrictEqual}=require('node:util');
const {createAuthenticatedKingsSource}
  =require('./event-capacity-github-authenticated-source');
const {createPrivateHistoricalArchiveReader}
  =require('./event-capacity-historical-github-reader');
const {reconcileSignedHistoricalSource}
  =require('./event-capacity-historical-source-crosscheck');
const ERROR='Kings Event Capacity historical sources changed or could not be reconciled.';
const GUILD='1114967437788577792';
const FORUM='1550619824005062697';
const HASH40=/^[0-9a-f]{40}$/;
const HASH64=/^[0-9a-f]{64}$/;
function fail(){throw new Error(ERROR);}
function scopeOf(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    scope.guildId!==GUILD||scope.forumId!==FORUM)fail();
  return {guildId:GUILD,forumId:FORUM};
}
function validLedgerSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !value.ledger||!value.checkpoint||
    !Number.isSafeInteger(value.ledger.revision)||
    value.ledger.revision!==value.checkpoint.revision||
    !HASH64.test(String(value.checkpoint.digest||'')))fail();
}
function validArchiveSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !value.journal||!value.checkpoint||
    value.repositoryVerifiedPrivate!==true||
    value.encryptedArchiveIntegrityVerified!==true||
    value.sourceEvidenceAuthenticityVerified!==false||
    value.historicalCoverageCertified!==false||
    value.freeSlotsCertified!==false||
    !HASH40.test(String(value.indexSha||''))||
    !HASH64.test(String(value.indexDigest||''))||
    value.journal.revision!==value.checkpoint.revision||
    value.journal.tip!==value.checkpoint.tip)fail();
}
function identityOf(source){
  if(!source||source.sourceKind!=='authenticated-kings-convoy-checker'||
    !/^[1-9]\d{5,19}$/.test(String(source.runId||''))||
    !Number.isSafeInteger(source.attempt)||source.attempt<1||
    !/^[1-9]\d{5,19}$/.test(String(source.artifactId||''))||
    !HASH40.test(String(source.headSha||''))||
    !HASH64.test(String(source.archiveDigest||'')))fail();
  return [source.runId,source.attempt,source.artifactId,
    source.headSha,source.archiveDigest];
}
// General read-composition helper is intentionally UNTRUSTED as to origin.
// It is testable with synthetic providers and can NEVER claim a real source
// gateway authentication, independent highwater or verified available slots.
function createStableHistoricalCrosscheck({
  readSource,readLedger,readHistoricalArchive,
  scope,taskSecret,ownerPublicKey,nowMs=()=>Date.now()
}={}){
  const scoped=scopeOf(scope);
  if(typeof readSource!=='function'||typeof readLedger!=='function'||
    typeof readHistoricalArchive!=='function'||typeof nowMs!=='function')fail();
  async function read(){
    try{
      const at=nowMs();
      if(!Number.isFinite(at)||at<0)fail();
      const [ledgerBefore,historyBefore]=await Promise.all([
        readLedger(),readHistoricalArchive()
      ]);
      validLedgerSnapshot(ledgerBefore);
      validArchiveSnapshot(historyBefore);
      const sourceBefore=await readSource();
      identityOf(sourceBefore);
      const audit=reconcileSignedHistoricalSource({
        source:sourceBefore,ledger:ledgerBefore.ledger,
        journal:historyBefore.journal,scope:scoped,
        ownerPublicKey,taskSecret,nowMs:at
      });
      const sourceAfter=await readSource();
      const [historyAfter,ledgerAfter]=await Promise.all([
        readHistoricalArchive(),readLedger()
      ]);
      validLedgerSnapshot(ledgerAfter);
      validArchiveSnapshot(historyAfter);
      identityOf(sourceAfter);
      if(!isDeepStrictEqual(sourceBefore,sourceAfter)||
        !isDeepStrictEqual(ledgerBefore,ledgerAfter)||
        !isDeepStrictEqual(historyBefore,historyAfter))fail();
      if(audit.sourceProvenanceTrustedByThisPureFunction!==false||
        audit.historicalCoverageCertified!==false||
        audit.freeSlotsCertified!==false)fail();
      return Object.freeze({
        ...audit,ownerPinnedLedgerReadConsistent:true,
        encryptedHistoricalArchiveReadConsistent:true,
        sourceSnapshotDoubleReadConsistent:true,
        sourceAuthenticationEstablishedByThisComposer:false,
        independentLatestOwnerHighwaterVerified:false,
        historicalCoverageCertified:false,freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({read});
}
function createGithubOnlyAuthenticatedHistoricalCrosscheck({
  githubToken,sourceTransport=fetch,ownerPinnedVault,
  historicalRepository,historicalToken,historicalTransport=fetch,
  scope,ownerPublicKey,ownerReceipt,encryptionSecret,
  taskSecret,nowMs=()=>Date.now()
}={}){
  const scoped=scopeOf(scope);
  if(!ownerPinnedVault||typeof ownerPinnedVault.read!=='function')fail();
  let readSource,history;
  try{
    readSource=createAuthenticatedKingsSource({
      githubToken,transport:sourceTransport,nowMs
    });
    history=createPrivateHistoricalArchiveReader({
      repository:historicalRepository,token:historicalToken,
      scope:scoped,ownerPublicKey,ownerReceipt,
      encryptionSecret,transport:historicalTransport,nowMs
    });
  }catch{fail();}
  const composition=createStableHistoricalCrosscheck({
    scope:scoped,ownerPublicKey,taskSecret,nowMs,
    readSource,readLedger:()=>ownerPinnedVault.read(),
    readHistoricalArchive:()=>history.read()
  });
  async function read(){
    try{
      const audit=await composition.read();
      // This gateway uses the FIXED Kings official GitHub source reader and
      // private, offline-owner-pinned historical archive reader. Supplied
      // ownerPinnedVault.read is an external contract, not an independently
      // inspected authentic latest historical source or owner highwater.
      return Object.freeze({...audit,
        currentGithubSourceAuthenticatedByGateway:true,
        historicalArchivePrivateReaderVerified:true,
        ownerPinnedLedgerContractRead:true,
        historicalCoverageCertified:false,
        independentLatestOwnerHighwaterVerified:false,
        freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({read});
}
module.exports={createStableHistoricalCrosscheck,
  createGithubOnlyAuthenticatedHistoricalCrosscheck};
