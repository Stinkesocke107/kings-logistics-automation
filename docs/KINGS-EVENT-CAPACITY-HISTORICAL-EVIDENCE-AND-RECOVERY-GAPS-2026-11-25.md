# Kings Event Capacity — Historical evidence gaps and backup recoverability

**25 November 2026. DRAFT PR #143. No production or real private Event archive access.**

This runbook explains the newest read-only development components and what remains necessary to obtain reliable event capacity decisions. These components **do not** certify free slots, archived-event completeness or real recovery readiness.

## 1. Signed 24-month historical evidence reconciliation

`event-capacity-historical-evidence-gap-audit.js` exposes `crosscheckKingsHistoricalEvidenceClaims` to privately compare an already owner-signed, Ed25519-verified lifecycle journal against an independently **supplied** list of purported original Convoy Center records. The journal itself is cryptographically verified using the existing `verifyHistoricalJournal` helper.

The review uses an **explicit 24-calendar-month UTC window**. Every source record must provide its event reference, classification, original-source record kind (`current`, `archived`, `deleted`, or `legacy`), source status, verified-form departure date, source digest and a distinct list of historical lifecycle-evidence digests.

Checks include:

- Original-source entries with no owner-signed historical match
- Signed historical Events missing from the supplied original-source inventory
- Status, category and departure-time disagreements
- Original lifecycle-evidence digests missing from a signed transition
- Extra claimed source-evidence digests without signed history
- Legacy, deleted or unknown-status records needing independent human review
- Duplicate identities and duplicate evidence, incorrect owner keys, malformed UTC timestamps or invalid source content

Only a **private per-month count** and keyed HMAC review IDs are returned; raw Event references, original source hashes and Staff/Driver details are not returned. A missing-source issue is **not** automatically resolved, nor does the code create a Discord ticket or event action.

**Important evidentiary limitation:** Although owner journal signatures are checked, the original source inventory passed into this pure function could be fabricated, incomplete or stale. A perfect zero-gap crosscheck is not authenticated 24-month historical completeness. Real authentication must occur at the provider/original source layer, with trustworthy coverage of cancellations, reschedules, completed, deleted, archived and legacy Events. `Completed` does not establish driver attendance.

## 2. The last 90 completed UTC backup days

`event-capacity-backup-90day-recovery-audit.js` provides `inspectKingsNinetyDayBackupRecovery`.

The review window covers **the preceding 90 completed UTC days**, stopping at yesterday. The current day is not treated as missing while its backup schedule is still in progress. It rejects invalid dates, duplicate backups, future or out-of-window records, forged 90-day retention review dates, and malformed evidence digests.

The read-only output distinguishes:

- Days with no backup record supplied
- Supplied backups that claim no independent offsite copy
- Legal holds that must **not** be automatically deleted
- 90-day retention-review due dates (review only, not deletion)
- Claimed restoration checks from the last 30 days, which do **not** prove an isolated monthly recovery test

Even 90 claims out of 90 do **not** prove real storage, backup automation, legal hold enforcement or independent recovery custody. A valid claim is a review input, not an observed external backup. No files are deleted, stored, copied, or restored by this audit.

## 3. Private CEO / Event Management readiness overview

`event-capacity-private-safety-overview.js` composes four independently provided offline reports:

1. 24-month source / owner-signed history evidence gaps
2. 90-day completed-day backup and restore claims
3. Five separate proposed runtime repository scope observations
4. Synthetic encrypted archive recovery review

The aggregate deliberately retains `safeToActivate:false`, `freeSlotsCertified:false` and `explicitCEOProductionApprovalVerified:false` even when **all four** software review reports exist and all reported gaps equal zero. It displays only counts and private status phrases, and it does not authenticate or bind the four reports together. In future it can inform a CEO Command Center **after a separate authenticated private backend and rights checks have been built**; it is not an active dashboard today.

## 4. What must still happen in the real environment

- Authenticate full 24-month original Event lifecycle evidence from the Convoy Center and other trusted original sources, including deleted/archived and legacy material; review all missing or conflicting records privately
- Verify actual, narrowly scoped GitHub App runtime credentials and the separate issue/read/write paths; do not reuse the broadly privileged setup actor
- Create and independently retain the offline owner Ed25519 signed latest highwater and verify genuinely separate disaster-recovery custody
- Implement and test real encrypted daily backup execution, the 90-day retention/legal-hold policy, and monthly isolated-host restore
- Review private Discord data privacy, access logs, actual Staff/Leadership permissions and separate human approval for consequential Event decisions
- Run a **separately approved, narrowly scoped synthetic private pilot** before real Event archival
- Require fresh exact-current-HEAD CI and explicit CEO merge/go-live authorization

**Safety:** All new modules are offline and read-only. They are never imported by the live Convoy Checker or public Actions production runner. No raw Event data, keys, tokens, new runtime workers, Discord permissions or production code are changed.
