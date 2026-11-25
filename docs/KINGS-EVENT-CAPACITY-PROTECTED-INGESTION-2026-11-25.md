# Kings Event Capacity — Protected Scheduled Import & Sync Health

**Development date:** 25 November 2026  
**Status:** Draft code and synthetic tests only. **No automatic production polling, private deployed server, Discord listener or real Kings import has been activated.**

## Completed private integration interfaces

### Verified routine GitHub source discovery
\`event-capacity-github-source.js\` now exposes \`getLatestScheduledRun({repository,nowMs})\`. It requests a bounded, successful \`main\`-branch *scheduled* Convoy Checker workflow listing through the authenticated GitHub API. It validates each result using the already restricted \`assertRun\` rules, which require:

- Exact upstream repo, workflow path and checked head repository.
- Completed successful scheduled run; manual dispatch is **not auto-selected** (may be a dry-run). Manually authorized live runs require separate explicit run selection and approval.
- Real ISO run timing, bounded completion delay, correct branch and a valid SHA.
- No claim of a verified source when no eligible run is available, metadata are incomplete, or any source has expired.

Automatic discovery is for a future private scheduler. The GitHub source module has no scheduler and cannot act on its own.

### Import orchestration
\`event-capacity-private-ingestion.js\` connects:

1. A **separate trusted-host workload identity verifier**, rejecting bare booleans and caller-provided role claims.
2. The restricted GitHub scheduled-run discovery and ZIP reader.
3. The current private human decision ledger.
4. The externally anchored, encrypted SQLite cursor/snapshot storage boundary.
5. The existing strict \`importPrivateConvoySnapshot\` validation: GitHub source provenance, allowed archive ZIP members, source inventory reconciliation, scope, ledger, signed snapshot and monotonic transactional commit.
6. Post-write verification that the independent protected checkpoint and current private source agree.

When the run/attempt/ledger revision match a still-fresh protected snapshot, repeat polling returns \`NoChange\` without downloading or committing the same ZIP again. A new staff decision-ledger revision **invalidates NoChange**, even if the Convoy Checker run itself has not changed.

It returns only minimal import state metadata, not raw events, source ZIP bytes, staff identities, ledger or HMAC secrets. All errors are intentionally opaque; a real private host must route explicit diagnostics only to authorized staff.

### Sync outage safety
\`event-capacity-sync-health.js\` is pure private state and notice policy:

- At the first failed source reconciliation, reports \`Data Outdated\` and disallows verified-free capacity claims.
- After two consecutive failed sync cycles, proposes one private escalation to Development, Event Management and CEO.
- Integrity, authorization or protected-storage failure causes an immediate critical private notice **proposal**.
- Only independent verified, reconciled and anchored fresh-source success can restore Healthy, emitting one restricted recovery notice proposal.
- No actual Discord pings, role writes, scheduled checks or durable delivery receipts exist here; a private host must persist state, dedupe notification delivery and check current permissions.

## Verified synthetic test coverage

- Eligible vs stale/forged/manually dispatched GitHub runs; wrong repository and opaque transport errors.
- Synthetic ZIP through signed scoped snapshot to a real encrypted SQLite test file and a mocked independent CAS anchor; no duplicates on repeated polls.
- Source correction through a later authorized ledger revision.
- Unauthorized issuer denial before source access.
- Tampered ZIP and disconnected checkpoint deny import without exposing private source.
- First failure blocks free-capacity claims; two-cycle escalation; immediate security alerts; verified recovery and no repeated notice proposals.

## Non-negotiable deployment gates

- Provision **real protected host** with genuine workload identity credentials and audited short-lived issuer grants.
- Deploy an **actual independent linearizable monotonic checkpoint service** on a separate protected fault domain, not an in-memory mock.
- Ensure a real secret manager, encrypted off-host backup, retention/deletion propagation and monthly isolated restore proof.
- Reconcile live and historical Convoy Center source categories, accepted statuses, UTC departure, missing end times and manual decisions; unknown values must remain uncertain.
- Configure authentic Discord application interactions, current private channel/role permissions, latency and replay protection before any private dashboard response.
- Wire durable storage for task/checklist/approval/publication/report state, notification receipts, monthly reports and the private dashboard's rich search/filter controls.
- Keep existing public GitHub workflows and production Convoy Checker legacy quota behavior unchanged until explicit CEO authorization, staged E2E verification, audit and rollback plan.

**PR #143 remains Draft; no real staff actions or scheduled imports have been performed by these changes.**
