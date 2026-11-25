# Kings Event Capacity — Independent witness contract for staged SQLite quarantine

**25 November 2026 · DRAFT PR #143 · OFFLINE, PRIVATE, SYNTHETIC-ONLY TESTING**

## Scope and existing modules

The Kings source-handoff work already includes `event-capacity-atomic-import-rehearsal.js` (pure four-stage local checkpoint simulation) and `event-capacity-atomic-staged-import-sqlite.js` (a **real on-disk, AES-256-GCM encrypted SQLite** prototype storing a quarantined source-comparison manifest and four-phase review history transactionally). The established `event-capacity-external-anchor.js` protects a *different* encrypted Convoy snapshot/cursor store.

This development adds `event-capacity-staged-import-external-anchor.js`, a specialized adaptation of the existing independent-witness **interface** for the new local staged-quarantine checkpoint. It requires `store.read/advance/checkpointDigest` and `anchor.load/compareAndAdvance`, with identical scoped guild/forum IDs. It does **NOT** provision, discover, authenticate, store or operate an independent offsite witness. The tests inject a **simulation-only in-memory witness**.

## Exact offline witness protocol

1. **Before read or write:** compute a valid local SQLite digest using `checkpointDigest({sourceInput})`; separately ask the injected witness for its claimed latest `{revision,digest}`. Both must have **exactly the same** revision and SHA-256 digest, or both must be absent on a new synthetic database. Invalid shapes, incomplete permissions, unavailable witnesses or mismatches fail **closed**.
2. **Read:** only after matching, call the strictly quarantined local read, then compare both checkpoint copies **again**, requiring no concurrent revision change. The output contains only stage and count summaries, not source IDs or the raw digest.
3. **One-step write:** verify both checkpoints; require an expected integer revision and call local SQLite `advance`. Its own `BEGIN IMMEDIATE` transaction provides atomic local review-state persistence.
4. **Independent compare-and-swap:** after local SQLite commits, obtain its **new encrypted bytes' digest**, then call the injected witness `compareAndAdvance({scope,expected,next})`. A separately protected **linearizable and durable witness** is necessary for this to have security value in a future real environment.
5. **After write:** load both records again and require exact equality with the new SQLite checkpoint. Success of the injected callback alone does **not** establish source authentication, physical witness independence, or secure custody.
6. **Duplicate retry:** a previously committed *and witnessed* local step is recognized without a fifth phase or duplicate witness advancement. Invalid stale CAS or changing source data is rejected.

## Why a failed or delayed acknowledgment must block progress

SQLite and an external authority **cannot participate in one ordinary local SQLite transaction**. After the local SQLite COMMIT there is a **critical gap** until remote compare-and-swap is durably acknowledged. The caller must never mask this with a fake rollback or an unconditional remote advance.

If the external authority is unavailable, returns false, lies about success, or the source lost a local post-COMMIT acknowledgment, **local and remote no longer match**. This wrapper refuses further reads and writes and calls for a separately authorized operator recovery. It **does not automatically resynchronize**, release dates, delete Events, restore an older database, or publish a source.

A database restored from older bytes fails if the external witness still claims the newer revision/digest; a modified encrypted row at the same revision also fails. An attacker that can roll back **both** local database and witness would not be stopped by this interface alone: an independently retained signed owner highwater is still mandatory.

## What was tested

Isolated tests use the real temporary `node:sqlite` encrypted quarantine database and separate **synthetic in-memory** witness, including these cases:

- New empty state; one witnessed local commit; restart and progression through four offline phases.
- Idempotent duplicate requests and concurrent requests with the same expected revision.
- Witness CAS denied after SQLite commit; false witness-success acknowledgment; witness outage.
- Local COMMIT completed but the caller lost its acknowledgment; local commit without remote CAS.
- Same-revision ciphertext digest mismatch, remote witness ahead, missing remote witness.
- Actual SQLite file deletion and rollback by copying a previous database file over the current one, while the synthetic witness remains at the newer revision.
- Changed original-source data, forged witness record, channel scope mismatch and privacy/production isolation.

The mock only demonstrates **algorithmic fail-closed behavior**. It is *not* an independently hosted, authenticated, physically separate monotonic checkpoint authority, not an offsite backup, and not a production restoration test.

## Release gates (not satisfied)

Actual Kings Event Capacity admission still depends on independently authenticated full 24-month original Discord evidence (including edited/archived/deleted channels), connected outbound Tracker, protected private runtime credentials, privacy/role/two-person review and CEO approval, independently stored **owner-signed latest highwater**, an authentic external durable CAS witness with tested custody and access controls, encrypted offsite backups (90-day retention) and an isolated tested restore. The prototype is disconnected from the live Convoy Checker and cannot change a booking or certify free slots.

**CEO action NOW: none for the offline tests.** Future real private test access and infrastructure setup need explicit approval and concrete configuration; never paste tokens, private keys, or private Discord exports into a GitHub PR or chat.

The maintenance notice through 30 November 2026 does not automatically enable any protected workload.
