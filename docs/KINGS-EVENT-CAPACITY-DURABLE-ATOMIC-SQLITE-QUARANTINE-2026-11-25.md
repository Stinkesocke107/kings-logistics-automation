# Kings Event Capacity — Durable encrypted SQLite quarantine transactions

**25 November 2026 · DRAFT PR #143 · real local SQLite transaction tests, synthetic source inputs ONLY**

## Why a second SQLite component?

The repository already has `event-capacity-private-sqlite.js`, which atomically saves the **signed Convoy Center snapshot with its source cursor**. The staged migration/recovery work is a distinct problem: a **quarantined comparison of two claimed source histories**, original old-channel pagination receipts and outgoing Event Invitation Tracker metadata needs a **restart-safe local checkpoint**. It must never overwrite the existing private snapshot store, a signed historical owner journal or an accepted Event.

The new `event-capacity-atomic-staged-import-sqlite.js` adds **actual isolated on-disk SQLite persistence** for an **offline quarantine rehearsal only**. This is not a production source importer. There are no Discord/GitHub API calls, live bot tokens, Events written, old dates released or Staff approvals created.

## Transaction boundary

The builder `createKingsAtomicStagedImportSqliteStore` requires a deliberate `mode:'SYNTHETIC_OFFLINE_ONLY'`, an existing **absolute directory outside the Git checkout**, restricted Unix mode 0700, valid scope (guild/forum), distinct 32+ byte encryption and review keys, and optional caller-owned minimum revision. A symlink, world-readable directory, existing unsafe file, wrong scope or reused secret is refused.

Its separate `kings-capacity-quarantine-drill.sqlite` database stores one scope-keyed, AES-256-GCM encrypted envelope in a dedicated `staged_quarantine_drills` table. Envelope contents are the **quarantine plan's already opaque item IDs and change seals**, the plan's full-evidence replay seal, stage record count, current HMAC checkpoint and an append-only four-step **synthetic-only** history.

**An AES key is derived from the distinct encryption secret**, and scope identity is bound to authenticated encryption as AAD. The database's scope lookup key is a stable, domain-separated SHA-256 digest of the guild/forum scope (not the raw identifiers), **independent of the AES key**. This is necessary: when the encryption key is lost or rotated, the original row must still be located and decryption must fail explicitly, **never appear as an empty database**. The scope hash is not a secret or independent identity proof. The whole envelope is written as one SQLite `BEGIN IMMEDIATE` / `COMMIT` transaction with `synchronous=FULL`, `journal_mode=DELETE`, and rollback on error. The protected parent directory and SQLite mode 0600 restrict access to the local file. Production durability still depends on the host/filesystem and verified offsite recovery.

The distinct previous quarantine item records, checkpoint and phase history are **not** committed separately. They are encrypted and written **together**. The existing source plan is always recomputed from caller-supplied inputs before opening a write; a local checkpoint cannot substitute for historical source authentication.

## Four durable offline rehearsal phases

| Phase | Persisted meaning | Actual Kings bookings |
| --- | --- | --- |
| `SOURCE_SNAPSHOT_LOCKED` | Initial synthetic evidence plan locked in encrypted SQLite | None |
| `QUARANTINE_MANIFEST_REVIEWED` | Staged anonymous review inventory stored in same envelope | None |
| `RECOVERY_CONSISTENCY_INSPECTED` | Verified matching claimed source/plan after restart | None |
| `OFFLINE_DRILL_COMPLETE` | Only the local synthetic drill finished | None |

`advance({sourceInput,expectedRevision,fault})` requires an exact current revision, revalidates the complete source plan, and atomically advances **one** phase. A stale revision conflicts. The same source and expected revision retried after a commit with a missing acknowledgment returns `ALREADY_STAGED_SAME_PHASE_REPLAY` instead of applying another step. Two SQLite handles are serializable through `BEGIN IMMEDIATE` plus the revision CAS.

Fault injection (test only) distinguishes:
- `BEFORE_BEGIN`: no transaction started
- `AFTER_BEGIN`: transaction must roll back
- `AFTER_UPSERT_BEFORE_COMMIT`: the new record must roll back fully
- `AFTER_COMMIT_BEFORE_ACK`: the data **has** committed even though the caller receives an error; reopening the database and replaying the same expected revision resolves it without duplicating history

`read({sourceInput})` and `checkpointDigest({sourceInput})` require the **exact original source plan** and decrypt/revalidate local state. The checkpoint digest is only a candidate for a separately controlled independent owner-floor service. It is **not itself off-host, independently retained or proven current**.

## What the test covers

Tests use temporary 0700 directories under the OS temp location, **real** Node 24 built-in `node:sqlite` databases and synthetic Kings data; they clean up after completion. They check restart persistence, complete four-step progression, two-handle CAS, fault injection before/during/after commit, missing acknowledgments, digest changes, changed archived page receipts, source cancellations, removed old channels, new outbound Tracker inputs, encryption key changes, ciphertext tampering, unsafe directories/symlinks, scope refusal and independent revision-floor logic.

A separate runtime isolation test ensures no import into `convoy-checker.js`, the live workflow or the existing GitHub Actions capacity writer.

## Remaining critical requirements before actual live import

1. **CEO-authorized, authenticated read-only Discord pilot** with complete actual channel inventory, historical pagination, edited/deleted evidence where available, real source identity and privacy permissions.
2. Independently retained **owner-signed latest highwater** and external revision/digest anchor, verified against the encrypted SQLite state before **and after** any real transaction. This new code neither writes an independent anchor nor proves its custody.
3. Real off-host encrypted backup retention and regular isolated restore; private durable host or independently controlled secure storage. **Do not use an ephemeral public GitHub Actions runner as the durable database.**
4. A separately designed/approved actual business-import transaction that reconciles the **signed original Event lifecycle**, historical holds, double counting, Event Invitation Tracker and human approvals. This SQLite module never imports a real Event and cannot certify free dates.
5. Private Staff/Management permissions and reviewed runtime operations, documented rollback/consistency protocol, explicit CEO production merge/activation approval.

**CEO action now:** none required for the synthetic tests. The announced maintenance through 30 November 2026 is not an automatic activation date. Never paste any bot token, encryption key, owner signing key or private Discord export into a public GitHub PR.

**Security status:** `freeSlotsCertified:false`, `safeToActivate:false`, `independentOffsiteHighwaterProven:false`, zero actual Events/slots/Discord messages affected. PR #143 stays DRAFT/unmerged.
