# Kings Event Capacity — Adapter & Shadow Readiness (2026-11-24)

**Phase:** 2, read-only normalization prototype; **NOT LIVE**. Master specification: [KINGS-EVENT-CAPACITY-MASTERPLAN-2026-11-24.md](./KINGS-EVENT-CAPACITY-MASTERPLAN-2026-11-24.md).

## Implemented without production side effects

- \`event-capacity-core.js\`: pure, UTC-anchored capacity engine; no network or disk writes.
- \`event-capacity-adapter.js\`: accepts already generated \`output/convoy-check-results.json\` and \`output/convoy-overview.json\` structures in memory. All actual conversions are explicitly gated by source evidence; derived Staff status and manual Kings classification are independent.
- \`event-capacity-shadow.js\`: **manual only**; reads these local inputs; prints **aggregate-only** counts/issue categories, no Event ID, private names, staff IDs, route or publication URLs; no network and no persisted results.
- Isolated tests cover quota boundaries, date rollover, approved vs pending, end-time uncertainties, archived/legacy entries, trusted Staff decisions, report completeness, separate exception permissions, HaulMP-style manually evidenced data, and data minimization.

## Important existing source limitations discovered

1. The existing \`convoy-checker.js\` and \`convoy-finalize.js\` derive \`Scheduled\` from a role-recognized \`staffStatus\`; an archived/incomplete thread can still have an underlying staff approval but a derived \`Needs Information\`. Such contradictions **must never** become verified capacity.
2. Existing \`validation.parsed.eventType\` contains a claimed human-entered category but not yet a separately authenticated **Kings official partner/classification approval record**. It is *not automatically attested by this adapter*.
3. Existing \`convoy-truckersmp-sync.js\` contains \`truckersmp.startAtUtc\`, \`meetupAtUtc\`, matched Event ID and \`truckersmpSync.syncedAt\` evidence. Only fresh matched API data are treated as directly verified departure/meeting time. A manually verified non-TMP source may be used from separately authorized private decisions.
4. Existing sources do **not** consistently supply a reliable planned end timestamp. For accepted events without an end, calendar availability is **unverified**, even when an accepted event is correctly counted.
5. Frozen legacy calendar records have inferred \`Scheduled\` / \`Legacy Past\` statuses and generic \`Legacy Calendar\` classification. They are reconciliation candidates, **not automatically accepted Partner or External events**.
6. A first-pass adapter can neither prove historical event attendance nor reconstruct old accepted departure allocations if an event was rescheduled without a secured provenance ledger.
7. The repository is **public** and earlier audits have identified cleartext private event/Staff state risk. Never commit raw source reports, private classifications, approval evidence, staff assignments, unpublished documents or generated capacity details to this repo.

## Source verification & private decision boundaries

The adapter's \`trustedSource: true\` setting is a **declarative integration gate, not a cryptographic authentication mechanism**. A future protected ingestion process must supply this only after verifying origin, privileges, integrity and completeness. For a report to be fresh, it must also provide:

- matching, independently configured guild/forum scope across the Convoy Checker and Overview;
- well-formed time-bounded finalization + overview generation;
- reconciled thread counts and legacy coverage metadata;
- no known report read errors.

Before a Kings Event type can count, the restricted private classification ledger must supply a reviewed event-specific record. **Only the encrypted ledger container is accepted by the manual shadow loader.** The following is a **synthetic in-memory adapter projection** of the private decrypted data, not a plaintext file format to store or upload:

\`\`\`json
{
  "event:123456": {
    "approved": true,
    "approvedByRole": "Event Coordination",
    "evidenceRef": "private-opaque-decision-reference",
    "eventType": "Partner Convoy",
    "endVerified": true,
    "plannedEndAtUtc": "2027-03-20T19:00:00Z"
  }
}
\`\`\`

This is **only a schema example**, not an authorization API. Verification of reviewer identity, role membership at decision time, record integrity and the evidence reference **must happen upstream**. A falsely asserted \`approved: true\` is not acceptable evidence in production.

An independent over-quota exception must be present in a distinct nested object with \`approvedByRole\` **Event Management** or **CEO**, its own proof reference, and \`approved:true\`. A classification by Event Coordination does *not* grant an exception.

## Manual shadow invocation (controlled local context only)

The shadow runner is deliberately **not attached to Actions** or live Discord jobs. It reads locally available \`output/convoy-check-results.json\` and \`output/convoy-overview.json\`, not remote APIs. It requires appropriate local secure source material, and never writes results.

\`\`\`bash
# Default: no claimed verified source, no classifications; safe uncertain output.
node event-capacity-shadow.js
\`\`\`

For an authorized protected test environment only, configure \`DISCORD_GUILD_ID\`, \`DISCORD_CONVOY_FORUM_ID\`, and \`KINGS_EVENT_CAPACITY_SOURCE_VERIFIED=true\` **after independent validation**. If available, \`KINGS_EVENT_CAPACITY_PRIVATE_DECISIONS_PATH\` must refer to an **absolute path outside the repository**, mounted and access-controlled privately. Do not put private classification JSON under \`data/\`, \`output/\`, tracked files or a public Actions artifact.

**Neither the environment flag nor a classification JSON file authenticates the user by itself.** Do not expose the protected report/ledger to a public CI runner. Do not publish per-event results in a public Actions log.

## Next implementation gates

1. **Complete the production trust boundary for the new encrypted ledger**: authenticated server-side Discord role checks, current event scope, proof validation, transactional persistence, monotonic revision/rollback protection, correct 24-month personal-log retention, 90-day backups and required deletion propagation.
2. Audit the exact authoritative Staff role mapping and public/archived Convoy Center behavior in a controlled environment. Read-only shadow compare against verified event snapshots.
3. Add immutable original allocation for accepted historical events and human-approved reschedules. The current pure engine intentionally fails closed on unresolved rescheduling.
4. Add independent reliable source adapters for other officially supported platforms rather than guessing from TMP.
5. Build private dashboard and validated RBAC/Discord interactions, then notifications/reporting, only after isolated tests and owner review.

**No changes to the existing scheduled Convoy Checker or its old advisory alerts have been made in this branch.**
