# Kings Event Capacity — Crash-safe import preflight rehearsal

**25 November 2026 | Draft PR #143 | PRIVATE / OFFLINE / ZERO EXTERNAL WRITES**

## Purpose

Kings Logistics Event Coordination needs an eventual source-import flow that cannot lose approved, cancelled, archived or rescheduled convoy evidence when an extraction fails, a bot restarts or one historical source disappears from a later read. The previous **staged quarantine preflight** already marks all records unsafe for automatic import. This addition tests **four local review phases** with HMAC-sealed, replayable checkpoints, not production transactions.

**A finished synthetic drill is NOT a restored backup, not a completed real Event migration and not an approved historical reservation release.** No persistent checkpoint is created by this module: callers must never substitute these local HMAC objects for separately maintained, independently attested owner highwater.

## New modules

### `event-capacity-atomic-import-rehearsal.js`

The pure `runKingsAtomicImportRehearsal({sourceInput,checkpoint,fault})` always revalidates the **entire private staged source import plan** and its complete old/new pagination receipt evidence before advancing any step. The plan remains `stagingReadyForProduction:false`, all Event rows remain in quarantine and no original event contents are exposed.

Four **synthetic-only** phases:

| Phase | Meaning | Changes in actual Kings data |
| --- | --- | --- |
| `SOURCE_SNAPSHOT_LOCKED` | Validate the exact, quarantined source inputs and bind a local replay seal | None |
| `QUARANTINE_MANIFEST_REVIEWED` | Recheck the record and source category tally under the same seal | None |
| `RECOVERY_CONSISTENCY_INSPECTED` | Check that the same source evidence can be used after restart | None |
| `OFFLINE_DRILL_COMPLETE` | Finish the **synthetic rehearsal only** | None |

A checkpoint is tightly shaped and locally **HMAC-SHA256-sealed**, binding the plan's exact replay seal, phase index, immutable phase name and quarantined record count. All prior source digests, original Event IDs, guild/channel IDs, invitations and secret keys stay outside returned checkpoint data. Checkpoint verification uses constant-time comparison. An altered phase, data count, HMAC, source snapshot, archive page digest/cursor or tracker source coverage **fails closed**.

Injected interruptions support `BEFORE_PHASE` and `AFTER_PHASE_BEFORE_CHECKPOINT`, for the next phase only. In either case the **previous sealed checkpoint is returned unchanged**, including at the initial no-checkpoint stage. The simulated consumer may **replay** the same phase against the same source. It must **never assume** that a real write completed merely because a phase started. The design purposely offers no `COMMIT`, `APPLY`, `DELETE`, `ROLLBACK` or old-slot-release operation.

The final synthetic checkpoint is idempotent: retrying it returns `ALREADY_FINISHED_OFFLINE_ONLY`; there is **no external commit**.

### `event-capacity-import-recovery-team-preview.js`

Composes the offline recovery drill with the **existing private Event Team staged import preview**. It requires the exact same candidate snapshot and pagination objects. It exposes only: current offline phase, aggregate quarantine counts, Event and outgoing invitation claim counts, changed/missing review counters, urgent human-review counts and the HMAC-only local checkpoint.

The optional Discord-style response is only **an ephemeral preview payload**, has no command binding, includes no individual Event or source identities and does not post messages.

## Test matrix

The new tests exercise starting a fresh phase, completing four phases, repeated full replay, before/after crash simulation at each boundary, stale checkpoint after changed Event state, reschedule, missing old thread, archive page content digest or scan interruption, tracker flag or additional invite changes, modified HMAC secret, forged/missing/extra checkpoint fields and secret redaction. Integration verifies that the progress preview is connected to the same **24-month historical source / Convoy Center / old channels / outbound invitation** candidate and never creates capacity availability. Isolation confirms no production Convoy Checker imports and no network/file writes.

## What is still missing for a real crash-safe importer

This work is **a transaction design rehearsal**, not a true atomic durable commit. An actual implementation would still require all of the following verified in an independently controlled private runtime:

1. Explicit CEO consent for the private read-only source pilot; only then collect actual current and historical Discord source evidence using narrowly scoped credentials and appropriate privacy retention.
2. A private durable **write-ahead transaction log** and atomic/conditional database commit (not in this module), protected against concurrent workers and stale plan/checkpoint replay.
3. An owner-signed independent latest highwater, an actual offsite encrypted backup and a real isolated recovery rehearsal.
4. A reviewed reconciliation of edited, deleted, archived, cancelled and rescheduled original source events, historical provisional holds and all active/legacy Convoy Center and outbound Tracker data.
5. Effective Staff/Management permissions, private access controls, human booking review and a separately authorized production deployment. No auto-accept, auto-decline or release of historical reservations.

No customer-facing slot availability, verified historical completeness or actual source authentication can be asserted from this simulated drill.

**CEO action now: none for the offline work.** Do not place bot tokens, encryption secrets, signing keys or private Discord exports in this public Draft PR. The Kings maintenance announcement through 30 November 2026 does not automatically switch anything on.
