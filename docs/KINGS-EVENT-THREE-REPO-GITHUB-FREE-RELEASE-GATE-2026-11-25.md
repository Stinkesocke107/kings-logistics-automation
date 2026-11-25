# Kings Event Capacity — History × Witness × Backup Three-Repository Preflight

**Date:** 25 November 2026  
**Status:** DRAFT / PRIVATE / OFFLINE READ-ONLY / NO DEPLOYMENT  
**Infrastructure constraint:** GitHub Free only; no separate hosting, VPS or paid third-party database.

## Actual GitHub repository metadata checked

GitHub connector reported on 25 November 2026:

| Logical function | Private GitHub repository | Visibility / branch |
| --- | --- | --- |
| Historical archive | \`Stinkesocke107/kings-event-capacity-history\` | private / main |
| Owner witness | \`Stinkesocke107/kings-event-capacity-witness\` | private / main |
| Encrypted daily backup | \`Stinkesocke107/kings-event-capacity-backups\` | private / main |

All three were reported accessible, not archived, with pull and push permission. This checks **repository configuration**, not whether real encrypted archive content, independently signed witness high-water data, or backups have actually been populated. **All three belong to the same GitHub account**. This is a common account-failure domain, not independent owner custody/offsite storage.

## New offline preflight

\`event-capacity-three-repo-release-gate.js\` accepts only a **minimal caller-supplied metadata projection**, stripped of GitHub credentials:

\`{repository_full_name, visibility, default_branch, archived, owner}\`.

It also accepts optional **untrusted** \`{revision,tip,archiveDigest}\` checkpoint claims from history, witness, backup and separately held owner highwater, plus the UTC backup date. It:

- Rejects unknown/duplicate/misidentified repositories, wrong account declarations and secret-bearing extra properties.
- Checks private visibility, branch \`main\`, archived status and common-owner account failure domain.
- Surfaces missing checkpoint claims, drift between history/witness revisions and digests, backup ahead/behind history, and mismatched owner highwater.
- Rejects impossible backup dates or invalid digest/revision formats.
- Outputs aggregate-only diagnostics and private ephemeral Discord preview *shape* without repo names, secrets or original checkpoint digests.

**It does not** authenticate metadata through a network transport; the input remains an untrusted claim. Even perfect checkpoint equality does not authenticate signatures, independently retained owner highwater, a 90-day backup history or a real restore. It never certifies source completeness, free Event capacity or readiness to activate.

## Activation requirements not yet satisfied

1. Independently authenticate actual current/legacy/archived Discord Event evidence and known deletions across the true historical period. Deleted Discord messages may no longer be recoverable; unknown is not empty.
2. Implement CEO-approved, minimally privileged and current effective Discord Staff authorization before any protected read/write.
3. Verify encrypted History source, signed Witness revision and backup content with explicit scope, non-replayed highwater, CAS/version locks and trustworthy source provenance. A GitHub metadata read alone is insufficient.
4. Arrange **separate owner-held current checkpoint custody** and ideally a separate security/failure domain for recovery. A same-account repository does not provide that independently.
5. Complete real daily retention continuity, independently tested restore and a crash/lost-response reconciliation workflow without automatic retry.
6. Run a protected, owner-approved end-to-end staging pilot and verify no unexpected Discord messages, announcements, tasks or booking allocations. Only then decide whether to activate a limited subset.

Existing \`main\` and live Convoy Checker workflows remain untouched. PR #143 must remain Draft until release signoff.
