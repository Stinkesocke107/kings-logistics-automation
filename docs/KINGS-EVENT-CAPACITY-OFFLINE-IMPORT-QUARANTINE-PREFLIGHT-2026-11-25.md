# Kings Event Capacity — Offline Import Quarantine & Repeatable Preview

**25 November 2026 · DRAFT PR #143 · PRIVATE, OFFLINE, READ-ONLY · NO LIVE EVENT IMPORT**

## Purpose

The staged old/new Convoy Center, old channels and outbound Event Invitation Tracker reconciliation is now extended by a deterministic, **fully quarantined** import preview. This is a design for a safe **future** authenticated historical data transition, **not** a live importer, an executable migration, or independent proof that all Discord originals exist.

**All records remain blocked**, even when an old and new snapshot match perfectly. An unchanged current source is still a *claim*, not verified original 24-month lifecycle coverage, not Kings Event Coordination Staff approval and not an available booking slot.

## What the new code does

### `event-capacity-staged-import-quarantine-plan.js`

1. Validates the **same two source snapshots and separate 24-month pagination receipt claims** through the existing safe `rehearseKingsStagedSourceHandoff` audit, including current guild, earlier/later timestamps, source counts and old channel records.
2. Compares **three independent kinds** of records: canonical Convoy Events, outgoing invitations **per invitation ID**, and source channels. Two threads of the same canonical Event ID remain **one claimed event identity**, while separate invitations to different VTC recipients remain separate invitation records.
3. Classifies each source identity into `UNCHANGED_UNVERIFIED`, `CHANGED_QUARANTINED`, `NOT_OBSERVED_QUARANTINED`, `NEW_UNVERIFIED_QUARANTINED`, `AMBIGUOUS_SOURCE_QUARANTINED` or `MISSING_CANONICAL_LINK_QUARANTINED`.
4. Generates a stable **HMAC-keyed private item identifier** and a separate HMAC-keyed change seal for each identity. No underlying Discord channel/thread or Event IDs, invitation names, source message digests or raw text are returned. Unknown/unlinked source identities require explicit human matching; no approximate title/date matching.
5. Binds the **whole-batch HMAC replay seal** to the old/new source items and **both pagination receipt inventories**, including archive page continuations, response digests, scan timestamps and outbound Tracker coverage flags. Changing the evidence while leaving Event statuses unchanged therefore changes the replay seal. Merely reordering independent source rows or scan groups leaves the seal stable.
6. Makes the impossibility of real writes explicit: zero committed imports, external writes, Discord messages, Staff approvals, automatic deletions or old date releases; `stagingReadyForProduction:false`, `freeSlotsCertified:false` and `safeToActivate:false`.

**HMAC does not authenticate Discord originals, independent owner highwater or backups by itself.** These seals only make replaying the same private claimed input *detectably consistent* under the same private key. Key custody and real source attestation remain external blockers.

### `event-capacity-staged-import-team-preview.js`

Produces an **ephemeral private Event Coordination preview** of the quarantine breakdown, linked with the existing staged source Team queue, Convoy Center, 24-month historical source claims, old channel manifests and outgoing Tracker. The original and calendar inputs must share the **exact same current in-memory source and pagination objects** so mismatched candidates cannot be silently combined.

The preview shows anonymized aggregate counts: Event identities, invitation identities, source channels, unchanged, changed, new, missing, ambiguous, unlinked and urgent human-review counts. It never prints individual source refs or actual event details and does not register a Discord command.

## Why all events are quarantined

* **Previously observed but absent now** is NOT proof of deletion, cancellation or withdrawal.
* A source that changed from `Scheduled` to `Cancelled`, `Completed` or `Rescheduled` is not a Staff-signed lifecycle decision.
* Previous possible booking/hold dates may have to remain reserved until independently reconciled; a reschedule does not automatically release the original date.
* A Tracker `Accepted` is a recipient's response to an outbound invitation, not an accepted inbound Event Capacity booking.
* Multiple old/current threads linked to one canonical Event are source history, not extra Partner/External capacity events.
* A complete-looking untrusted page receipt is not original Discord provider authentication or proof that archived/private/deleted events were fully recovered.

## Test scope

Pure synthetic tests cover identical reruns, source order invariance, new/removed/renamed events, changed status/date/category or message digests, lost edit history, old channel disappearance, outbound invitation multiplicity and withdrawal, source pagination failures, Tracker coverage changes, changed archive receipt hash/continuation/fetch time, HMAC-key rotation and no sensitive identifiers in summaries.

The strict production isolation test confirms the new modules are not imported into the existing public Convoy Checker or its GitHub workflow, and there are no HTTP clients, token reads, Discord writers, filesystem writers or business approval authority inside the new modules.

## Real enablement

**Not authorized.** Before any private real source pilot or eventual deployment: explicit CEO consent, effective permission-scoped actual Discord reader, complete source inventory and privacy approval, independent owner signed latest highwater, offsite encrypted backup and recovery proof, effective Event Staff permissions and independently signed decisions. Only then would an **entirely separate and reviewed** import/approval implementation be considered.

The CEO does not need to change a setting for current offline testing. No automatic activation follows 30 November 2026. Never share bot tokens, signing keys or private Discord exports through a public PR.
