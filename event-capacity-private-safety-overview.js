'use strict';
// DRAFT/OFFLINE: privacy-safe leadership summary from untrusted developer
// reports. NEVER equate signed-but-incomplete archives, successful synthetic
// recovery or user-asserted backup records with actual production readiness.
const ERROR='Kings Event Capacity private safety overview unavailable.';
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function bounded(x){return Number.isSafeInteger(x)&&x>=0&&x<=100000;}
function inspect(report,kind){
  if(report===null)return null;
  if(!plain(report)||report.visibility!=='PRIVATE_ONLY'||
    report.readOnly!==true||report.safeToActivate!==false||
    report.freeSlotsCertified!==false)fail();
  if(kind==='history'){
    if(report.reviewWindowMonths!==24||!plain(report.counters)||
      !bounded(report.counters.unresolvedEvidenceGaps)||
      !bounded(report.counters.urgentGaps)||
      report.counters.urgentGaps>report.counters.unresolvedEvidenceGaps||
      report.originalSourceRecordsIndependentlyAuthenticated!==false||
      report.historicalCoverageCertified!==false)fail();
    return Object.freeze({
      state:'Historical Source Claims Reviewed — Original Evidence Still Unverified',
      observedEvidenceGaps:report.counters.unresolvedEvidenceGaps,
      urgentHumanReviewGaps:report.counters.urgentGaps
    });
  }
  if(kind==='backups'){
    if(report.reviewedDayCount!==90||!plain(report.counts)||
      !bounded(report.counts.missingClaimedBackups)||
      report.counts.missingClaimedBackups>90||
      !bounded(report.counts.offsiteCopyNotClaimed)||
      report.independentOffsiteStorageCustodyVerified!==false||
      report.monthlyIndependentRecoveryDrillVerified!==false||
      report.automaticDeletions!==0)fail();
    return Object.freeze({
      state:'Ninety-Day Backup Claims Reviewed — Recovery Still Unverified',
      missingCompletedDailyBackupClaims:report.counts.missingClaimedBackups,
      offsiteCopyNotClaimed:report.counts.offsiteCopyNotClaimed
    });
  }
  if(kind==='grants'){
    if(report.eachCredentialObservedOneExpectedRepository!==true||
      report.effectivePermissionScopesVerified!==false||
      report.privateSyntheticPilotApproved!==false)fail();
    return Object.freeze({
      state:'Proposed One-Repository Inventory Observed — Real Rights Not Proven',
      effectivePermissionsVerified:false
    });
  }
  if(kind==='recovery'){
    if(report.syntheticEncryptionAndSignedJournalIntegrityVerified!==true||
      report.productionRestorePerformed!==false||
      report.actualIndependentStorageCustodyVerified!==false||
      report.latestOwnerFloorProven!==false)fail();
    return Object.freeze({
      state:'Synthetic Recovery Verified — No Independent Disaster Recovery',
      independentPhysicalRestoreVerified:false
    });
  }
  fail();
}
function summarizeKingsCapacityPrivateSafety({
  historicalEvidenceReport=null,backupRecoveryReport=null,
  runtimeScopeReport=null,syntheticRestoreReport=null,
  historicalHoldsReport=null
}={}){
  try{
    const reports={
      historicalEvidence:inspect(historicalEvidenceReport,'history'),
      backupRecovery:inspect(backupRecoveryReport,'backups'),
      runtimeScopes:inspect(runtimeScopeReport,'grants'),
      syntheticRestore:inspect(syntheticRestoreReport,'recovery')
    };
    const analyzed=Object.values(reports).filter(x=>x!==null).length;
    const review=Object.freeze(Object.fromEntries(Object.entries(reports)
      .map(([name,value])=>[name,value??Object.freeze({
        state:'No Offline Review Supplied'
      })])));
    const historyGaps=reports.historicalEvidence?.observedEvidenceGaps??null;
    const missingBackups=reports.backupRecovery?.missingCompletedDailyBackupClaims??null;
    let historicalProvisionalHolds=Object.freeze({
      state:'No Signed Historical Hold Review Supplied'
    });
    if(historicalHoldsReport!==null){
      const h=historicalHoldsReport;
      if(!plain(h)||h.visibility!=='PRIVATE_ONLY'||
        h.readOnly!==true||h.safeToActivate!==false||
        h.freeSlotsCertified!==false||
        h.signedHistoricalJournalVerified!==true||
        h.original24MonthSourceInventoryComplete!==false||
        h.latestOwnerHighwaterIndependentlyVerified!==false||
        h.cancellationsNeverAutoRelease!==true||
        h.previousDatesNeverAutoReleaseAfterReschedule!==true||
        !/^20\\d{2}-(?:0[1-9]|1[0-2])$/.test(h.month)||
        !plain(h.provisionalCounts)||!bounded(h.provisionalCounts.totalProvisionalDailyHolds)||
        !bounded(h.provisionalCounts.daysExceedingDailyLimit))fail();
      historicalProvisionalHolds=Object.freeze({
        state:'Signed Provisional Holds Need Human Release Review',
        month:h.month,
        provisionalDateHolds:h.provisionalCounts.totalProvisionalDailyHolds,
        daysExceedingStandardLimit:h.provisionalCounts.daysExceedingDailyLimit,
        originalSourceCompletenessProven:false,
        availableSlotsCertified:false
      });
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:analyzed===4?
        'Four Offline Review Reports Present — Production Blocked':
        'Private Development Review Incomplete',
      softwareReviewReportsPresent:analyzed,
      softwareReviewReportsExpected:4,
      review,historicalProvisionalHolds,
      counts:Object.freeze({
        observedHistoricalEvidenceGaps:historyGaps,
        missingNinetyDayBackupClaims:missingBackups
      }),
      callerSuppliedReportsCryptographicallyBoundTogether:false,
      originalPrivateEventSourcesAuthenticated:false,
      full24MonthHistoryCertified:false,
      actualCredentialsPermissionSeparated:false,
      independentLatestOwnerHighwaterVerified:false,
      externalBackupAndMonthlyRestoreVerified:false,
      staffEffectiveDiscordPermissionsVerified:false,
      explicitCEOProductionApprovalVerified:false,
      eventAvailabilityCertified:false,
      productionWorkflowsModified:false,
      operationsPerformed:0,
      safeToActivate:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={summarizeKingsCapacityPrivateSafety};
