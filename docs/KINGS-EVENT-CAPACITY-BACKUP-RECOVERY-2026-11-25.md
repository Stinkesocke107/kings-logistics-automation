# Kings Event Capacity — External Checkpoint, Encrypted Backup & Restore

**Date:** 25 November 2026  
**Status:** DEVELOPMENT DRAFT / OFFLINE TEST COVERAGE — NOT A LIVE BACKUP SYSTEM.

The public Git repository contains no real Kings event approval records, live Discord identities, private storage keys or backup files. All tests use synthetic fixtures in restricted temporary directories.

## 1. Independent checkpoint contract

- \`event-capacity-private-sqlite.js\` now binds its \`checkpoint()\` to the SHA-256 digest of the **exact authenticated encrypted SQLite envelope** (scope-bound), not merely the run ID and revision.
- \`event-capacity-external-anchor.js\` wraps that SQLite store and requires **separately authenticated, linearizable, durable** \`anchor.load\` and \`anchor.compareAndAdvance\` callbacks for each private read, protected import and encrypted backup export.
- Before use, the externally stored checkpoint and the local encrypted snapshot checkpoint must match in **both revision and digest**.
- An absent remote checkpoint when local data exists, an older/restored DB, a different encrypted payload at the same revision, and a crash after SQLite commit but before external anchor commit **all fail closed**.
- The order is SQLite commit first, remote anchor advance next. This is **not** a distributed atomic transaction. If the process fails in between, the local database is ahead and the system intentionally cannot serve verified dashboard data or continue imports. An authorized human recovery/reconciliation is required; no blind rollback or auto-promote.
- The remote \`anchor\` client is a **contract only**. The branch does not provision an actual independently protected checkpoint service. A fake/in-memory anchor in tests is **not production rollback protection**.

## 2. Private encrypted backup and retention plan

\`event-capacity-private-backup.js\` provides a local, protected backup prototype:

1. Requires a snapshot that already passed external highwater/ciphertext verification; a raw unanchored SQLite store is **not accepted** as a backup source.
2. Exports only the already encrypted SQLite envelope, then applies a second AES-256-GCM layer under a **separate backup secret** and scope-specific authenticated data.
3. Uses a private directory outside the public Git checkout, restrictive file permissions, fsync, and atomic non-overwriting daily filename \`kings-capacity-YYYY-MM-DD.enc\`.
4. Rejects tampered, wrong-key, wrong-scope and unsafe backup files; verifies exact archived ciphertext and source checkpoint.
5. \`proposeRetention\` reports candidates older than **90 days**. **No automatic deletion** occurs, including of backup files and identity data.
6. \`monthlyRestoreDue\` proposes a monthly isolated restore test based on the last successful test's month. It does not schedule or certify an actual test.
7. A restore requires an explicit \`isolatedTestMode\` flag and an SQLite store separately opened with \`enableIsolatedRestore\`. It can restore **only into an empty test database**, never over existing source state.
8. Historical backup integrity is checked against the source's originally signed issuance time; successfully restoring an old archive **does not renew the Convoy Center source's 30-minute freshness**. Historical data remain unavailable as a verified current dashboard until independently reconciled and freshly attested.

## 3. What is and is not verified

**Implemented as draft code + synthetic tests:** encrypted backup creation, non-overwriting daily files, integrity checks, forbidden unsafe paths, wrong backup keys and scopes, strict restored-state matching, old snapshot rejection for current dashboard, retention planning, mock external highwater crash-gap fail-closed, restored encryption validity.

**Not verified or implemented as production operations:** real independently hosted checkpoint authority, authenticated real event import/Discord permissions, real 90-day backups and backup secret rotation, actual independently located backup target, hardened off-host access controls, automated daily backup schedule, automatic retention/DSAR erasure, immutable/WORM backup policy, real remote integrity monitoring, monthly external isolated restore attestations, multi-host failover, approved incident recovery playbooks and CEO sign-off.

## 4. Required private recovery sequence (no automatic production restore)

1. Stop new writes and flag source **Data Outdated**. Never mark quota slots confidently free during a storage incident.
2. Verify the independently protected authority's last accepted revision and encrypted-source digest against audit evidence.
3. Select an encrypted off-host backup with validated scope/key, date and checkpoint. Never infer restored data's accuracy from \`Completed\` planning statuses.
4. Restore into a separately isolated private environment. Check ciphertext, attestation, role authorization, roster/event inventory reconciliation, staff decision history and historical UTC departure allocation.
5. Compare the recovered revision/digest to the protected checkpoint. If the restored state lags, escalate for explicit human-approved reconciliation/re-ingestion; do **not** automatically lower or reset the checkpoint or accept a "fresh" dashboard.
6. Revalidate the authoritative live Convoy Center records and refresh an authenticated snapshot, create new protected audit evidence, then perform an approved service recovery.
7. Complete the restricted recovery review and only then resume normal notifications. Never replay old external invitations/reminders or silently alter existing event acceptance.

## 5. Release gate

Maintain draft PR #143. Offline CI alone does not prove production readiness. Do not merge, publish, create Discord channels, run actual backups on public Actions runners or change live admission rules without owner approval and real private host/storage/role verification.
