# Kings Event Capacity — Private Source Intake (2026-11-24)

**Release: prototype only. No private live artifacts fetched, no workflow edited, no real Discord write and no production ingestion deployed.**

## Actual repository source audited

The existing .github/workflows/convoy-checker.yml runs on main (scheduled about every 15 minutes) and produces:

1. output/convoy-check-results.json via convoy-checker.js;
2. the TruckersMP enrichment + finalization of that report in convoy-truckersmp-sync.js and convoy-finalize.js;
3. output/convoy-overview.json via convoy-overview.js, with frozen Legacy Calendar records;
4. a **kings-convoy-reports** GitHub Actions artifact (current retention: 14 days).

The report and overview are generated in *the same workflow*, but those files contain **potentially sensitive staff/member/event data**. Their presence in a workflow artifact does **not** confer permission to copy them into the public Git repository, paste them into GitHub logs, or give them to an unauthenticated dashboard.

## New private attestation bridge

The pure module **event-capacity-snapshot-attestation.js** now:
- requires the report and overview to match the configured guild/forum and to have ordered, recent timestamps;
- uses the record-by-record source reconciler to reject inconsistent copies and legacy duplicate collisions;
- validates a scoped private decision ledger and binds its revision;
- binds report, overview and ledger to the same private snapshot proof, plus workflow run ID/attempt and issuance time;
- computes SHA-256 fingerprints and an HMAC-SHA-256 using a dedicated secret, verified with constant-time comparison;
- requires a separate explicitly trusted producer context to **create** an attestation; mismatched, stale, unsigned or tampered snapshots fail closed.

The read-only Discord capacity service now calls **verifyPrivateSnapshot** before it can use a snapshot and requires a dedicated private snapshot verification key supplied by the authenticated host. The existing `integrityVerified:false` flag can still impose a further fail-closed operational hold: a valid HMAC alone is not sufficient to claim source readiness.

This is **message authenticity between a designated private producer and private consumer sharing a secret**, not independent validation that the underlying GitHub workflow actually completed successfully. In particular, the code **does not** check GitHub API run status, artifact permissions, an authorized ingestion service identity, a durable latest-run cursor, or tamper-resistant private state storage. A private party holding the HMAC secret could fabricate a signed snapshot; secure secret injection and producer authentication are mandatory.

## Secure production ingestion sequence — not implemented

1. Privately authenticate the ingestion service and its delegated GitHub workflow/artifact read permission.
2. Fetch only a **completed, successful, expected Kings Convoy Checker run on main**, by its immutable run ID + attempt; compare artifact provenance, source checksum and real scope against live expected configuration. Do not infer trust from a downloaded JSON string alone.
3. Verify the private artifact contains both files from the same run, completeness/freshness and exact source inventory reconciliation.
4. Load the private encrypted ledger from transactional access-controlled storage and verify independently anchored revision; never copy its decrypted content into a public repo.
5. **Inside the protected issuer** create the signed snapshot; transfer over authenticated encrypted transport to the private host.
6. Verify the scope, signature, run attempt and freshest approved run cursor before the private dashboard may show verified availability.
7. Persist only privacy-minimized state; apply 24-month personal-data log retention, 90-day encrypted backups with isolated restore tests and deletion propagation.

If the source pipeline fails, its last successful run is too old, or approved historical records cannot be reconciled, the dashboard must show **Data Outdated / Unverified**, not an invented free spot.

### No automatic historical approval

Old and archived records may be unconfirmed or lack reliable UTC departure, meeting/end and separate Kings classification. A matching Event ID does not prove Kings officially accepted an event. These records remain queued for an authorized Event Coordination review; exceptions require Event Management/CEO and prior reviewed slots are not silently released on reschedule.

### Security/operational blockers

- No protected issuer or ingestion host has been provisioned; the private HMAC key is not present in this repository.
- No actual GitHub Actions artifacts or member records have been read in this work.
- No connected private Discord role IDs/channel permissions have been verified live.
- No HMAC replay cursor, private ledger anti-rollback, key rotation, erasure/restore, or end-to-end live testing has been implemented.
- Existing main Convoy Checker and old planning limits remain **untouched**.

**This branch remains a draft and must not be activated based on offline test results alone.**
