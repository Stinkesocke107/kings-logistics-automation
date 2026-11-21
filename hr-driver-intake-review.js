'use strict';

// HR intake / returning Driver QUEUE only. A current Discord Kings Driver role
// proves role membership, not that HR approved admission, re-entry or an
// original Kings joining date. Only Management-approved private registry
// records may supply that joining date. No network or Discord writes.
const {activeDriverSourceCoverage}=require('./kings-data-sources');

const CASE_TYPE='first-admission-or-returner-undetermined';
const CASE_STATUS='human-hr-management-review-required';

function pendingHrDriverIntake(drivers, register, checkedAt=new Date()) {
  if (!Array.isArray(drivers) || drivers.length===0 ||
      !(checkedAt instanceof Date) || !Number.isFinite(checkedAt.getTime())) {
    throw new Error('Cannot review incomplete Kings HR intake sources.');
  }
  const active=drivers.filter(d=>d?.role==='Driver');
  if(active.length===0) throw new Error('No verified current Kings Driver role holders for HR intake.');
  const coverage=activeDriverSourceCoverage(register,active.map(d=>d.discordId),checkedAt);
  if(!['complete','incomplete'].includes(coverage.status)) {
    throw new Error('Authoritative private Kings Driver registry is unavailable for HR intake.');
  }
  // Registration coverage is NOT an HR approval check: both a new Driver
  // and a returner could have the same current role. Cases are intentionally
  // undecided until HR has verified the official admission/re-entry decision.
  const cases=active
    .filter(d=>!register.identities.has(d.discordId))
    .map(d=>Object.freeze({
      discordId:d.discordId,
      status:CASE_STATUS,
      admissionType:CASE_TYPE
    }));
  if(cases.length!==coverage.missing ||
     coverage.registered!==active.length-cases.length) {
    throw new Error('Kings HR intake cases conflict with the authoritative private identity source.');
  }
  return Object.freeze({
    counts:Object.freeze({
      activeDrivers:coverage.activeDrivers,
      registered:coverage.registered,
      needsHumanReview:cases.length,
      status:coverage.status
    }),
    cases:Object.freeze(cases)
  });
}

function humanHrIntakeInstructions() {
  return Object.freeze([
    'Confirm the actual HR/Management admission approval; a Driver role alone is not an approval.',
    'Ask HR to classify FIRST ADMISSION or RETURNING DRIVER. Do not guess from Discord or TMP dates.',
    'For a returner, verify whether the original Kings joining date remains valid under Kings policy.',
    'Confirm Discord ID and optional official-platform IDs; resolve mismatches privately.',
    'Only authorized Management edits the original Kings joining date in the protected Driver Register.',
    'Rerun the read-only registration check. Never auto-assign roles, approve applicants or alter dates.'
  ]);
}

module.exports={CASE_TYPE,CASE_STATUS,pendingHrDriverIntake,humanHrIntakeInstructions};
