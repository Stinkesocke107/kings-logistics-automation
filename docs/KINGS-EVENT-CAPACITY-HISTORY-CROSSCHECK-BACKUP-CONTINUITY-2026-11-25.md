# Kings Event Capacity — signed history vs Convoy Center & 90-day backup continuity

**25 November 2026. DRAFT only.** The modules are not imported by the running Convoy Checker, have no Discord/token/prod config changes, and must not be interpreted as authorization to merge or activate Event Capacity.

## Part A: Cross-check signed historical lifecycle against current Event evidence

Module: `event-capacity-historical-source-crosscheck.js`. It validates the **actual existing Kings historical owner-signed journal** using its Ed25519 public key verifier, then reuses the established historical review planner for strict current Convoy Center report, overview, and private decision ledger shape checks. The algorithm is deliberately **read-only**.

For every historical owner-signed Event ID or thread ID it checks whether a current counterpart exists, whether the category matches, whether the VERIFIED UTC **departure** matches, and whether the status is compatible with the signed lifecycle. A previously accepted Event missing from a current snapshot is **review-required**, not proof it was deleted or cancelled. Current accepted Events with no signed historical record are **review-required**, not automatically accepted into the journal. Two signed IDs that map to a single current source record, duplicate current IDs, missing departure/category, a divergent status, and all legacy rows are flagged.

Discrepancies use stable **private HMAC task keys** rather than returning raw Discord member names, sensitive notes or Event IDs. Counts and reasons are for internal authorized staff only. This is an inconsistency report, NOT a complete 24-month inventory: absent old threads, unavailable archives, out-of-band Events and interrupted polling remain unresolved.

The returned flags remain `sourceProvenanceTrustedByThisPureFunction:false`, `historicalSourcesComplete:false`, `historicalCoverageCertified:false`, `freeSlotsCertified:false`, `slotReleaseInferred:false`, `calendarMutated:false`, `staffDecisionsCommitted:false` even if no discrepancy is detected. Only a future independent, authenticated archive/source coverage proof may make stronger claims after review.

## Part B: Private daily encrypted backup continuity

Module: `event-capacity-historical-backup-continuity.js`. It constructs the existing verified **private GitHub daily backup vault**, then re-reads encrypted daily backups from a distinct private repo against externally supplied Ed25519 owner receipts.

The audit covers 1–90 consecutive UTC dates, default 90, and separates:
- **No retained owner receipt** for a date (not fetched and definitely not certified).
- **Receipt present but remote ciphertext/status cannot be verified** (unverifiable; generic safe label only).
- **Encrypted backup and owner signature fully verified** through the current private vault's double-read and source-journal crypto verification.

Even if every expected daily backup is independently readable with a pinned owner receipt, the report does not infer owner custody of the **latest highwater**, private account administrative isolation, true scheduled delivery, 90-day deletion/hold policy, historical completeness, or a monthly separate-host recovery drill. In particular `allDailyReadChecksPassed` refers only to the audit's selected samples; `actualIndependentStorageGovernanceVerified:false`, `monthlyIsolatedHostRestoreVerified:false`, `retentionEnforced:false`, `automaticDeletions:0`, `historicalCoverageCertified:false`, and `freeSlotsCertified:false` remain unchanged.

The module NEVER writes or deletes a file. It uses no 24/7 bot. Although designed for a GitHub Actions future worker, it currently executes only when an authorized caller invokes it and is NOT part of any production workflow.

## Testing and remaining release gates

The new cross-check tests cover matching and missing Event IDs, signed cancellation and rescheduling, category/status/departure contradictions, ambiguous signed aliases, legacy rows, forged signatures or source, and privacy-safe task keys. The private backup vault tests were expanded to cover 90 missing receipts, one verified day with adjacent gaps, 404/forged read results, invalid date and duplicate receipt sets, public repository refusal, and full-sample acceptance with **no** slot certification. A workflow gate ensures neither new module can silently become a production dependency.

**The current HEAD must complete a same-commit GitHub Actions regression run before calling the new code validated**. Existing prior CI passes are not enough for any new commit.

Still required: actual private data/witness/backup repositories and credentials; source-authenticating gateway and complete historical Convoy Center evidence (including archived/deleted events); owner-controlled independent monotonic highwater; production-sized storage and key rotation; real 90-day retention/legal holds and separately isolated monthly restore; effective Discord role/channel permissions; explicit CEO activation approval.

**No automatic accepted Event, free-slot proof, slot release, Discord post, deletion, GitHub workflow dispatch or production feature activation is performed.**

## Part C: Human-reviewed Event Workboard handoff

Module: `event-capacity-historical-workboard-proposals.js`.

A protected internal coordinator can take the private HMAC discrepancy keys from Part A and preview **deduplicated task proposals** for the existing Event Workboard. It validates the original workboard structure and scope, maps known issue reasons to safe generic task titles and marks urgent issues for Leadership attention. It does not include Discord member names, raw Event IDs, Staff message content or event details.

The proposal preview reads workboard task IDs and status; an issue already tracked as Open, In Progress, On Hold, Done or Reopened is **not** duplicated or reopened automatically. A pre-existing colliding task ID with a different reason is rejected, not overwritten. The proposal does **not** supply a trusted Staff actor, and it does not generate an executable workboard revision command.

The output explicitly sets `commandsReadyToExecute:false`, `staffTasksCreated:0`, `staffTasksReopened:0`, `humanAuthorizationRequired:true`, `sourceProvenanceIndependentlyVerifiedHere:false`, `historicalCoverageCertified:false` and `freeSlotsCertified:false`.

An eventual implementation must re-authenticate the current Event Coordination/Leadership permissions, independently re-verify the latest source and signed archive, compare the current workboard revision, obtain authorized human review, and persist a single private workboard transaction with audit history; only then could these generic proposals become tasks. **Nothing is auto-created in Discord or GitHub today.**

The eight new unit tests cover deterministic proposals, manual application via the existing workboard domain rules, no duplicate or automatic reopening of Done tasks, leadership-review indication, malicious task keys, false completeness and scope mismatches, and collision safety.

