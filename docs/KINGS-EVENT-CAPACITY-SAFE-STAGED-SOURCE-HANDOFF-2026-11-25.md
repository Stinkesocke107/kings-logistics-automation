# Kings Logistics — Safe staged Convoy source handoff & Event Team review

**25 November 2026 · DRAFT PR #143 · OFFLINE, PRIVATE, READ-ONLY · NO LIVE EVENT MIGRATION**

## Goal: do not lose anything between imports

The Kings Event Coordination system must reconcile **Convoy Center & Checker**, former/monthly/archived channels, the outgoing **Event Invitation Tracker**, existing frozen legacy entries, and the separate **owner-signed historical event lifecycle journal**.

A common but dangerous failure occurs when an archived thread or older channel is omitted from a later scan. A naïve data synchronizer may interpret *absent from the latest source snapshot* as *deleted*, release old calendar reservations, or overwrite previously accepted/cancelled/rescheduled information. That is **not allowed**.

**Binding rule: any current or old Event missing in a new source snapshot means NOT OBSERVED, not DELETED or CANCELLED. A previous date cannot be released simply because the Event was marked Cancelled or Rescheduled in an untrusted source inventory.**

## Implemented modules

### `event-capacity-staged-source-handoff-review.js`

Runs a **dry-run** comparison of two private caller-supplied event-source snapshots. Both snapshots are independently checked by the established `reconcileKingsMultiSourceConvoys` validator and the per-channel archive/deletion count auditor.

Separate 24-month pagination receipts are validated by `auditKingsDiscordHistoryPagination`, and then compared against their respective snapshot source-channel inventories (guild, time window, exact timestamp, channel ID, coverage intervals, current/legacy classification). A matching count still does **not** prove actual Discord source authenticity.

The dry-run specifically records:

- **Unchanged, new, changed, and no-longer-observed Event identities**, using only an explicit canonical Event ID; entries without one use their original channel+thread identity. No fuzzy matching based on date, name, location or VTC.
- **Cancelled/Completed/Rescheduled source status changes**, changed Event category, changed scheduled departure and conflicting claims across current Center and legacy channels. These become private human-review issues only.
- **Original message digest changes, lost previous revision digests and changes without any newly supplied edit revision**. No original edit is fabricated or declared authentic.
- **An old thread no longer observed**, even when the same canonical Event still appears elsewhere; newly linked or reclassified historical threads; source channel disappearance or changed claimed month coverage.
- **Outgoing invitation added, no longer observed, relinked to another Event, moved to another date or changed status**, without treating an outbound VTC reply as a Kings Staff booking approval. Multiple invitations to the same Event may be legitimately addressed to separate VTC recipients.
- **Prior potentially reserved dates** retained as per-month, deduplicated **provisional review indicators**, even if a later source claims cancellation, completion or a new date. They are NOT authenticated owner-signed holds, and NEVER represent certified free capacity.

All individual review references use HMAC-keyed private opaque identifiers. No raw Event ID, Discord thread/channel ID, invitation ID, message content, digest, token or signing key is emitted in the summary.

**The scanner cannot distinguish actual deletion from lack of visibility.** Even when all supplied sources and pagination claims appear internally complete, `originalDiscordProviderAuthenticated:false`, `independentSignedOwnerHighwaterVerified:false`, `freeSlotsCertified:false` and `safeToActivate:false` remain mandatory.

### `event-capacity-staged-source-team-queue.js`

Combines the source-diff results with the existing `event-capacity-unified-evidence-coverage.js` (24-month historical Discord sources, Event Team calendar, current Center, old channels, outbound Tracker).

The private preview shows only aggregate incoming/outgoing source changes and outstanding Staff review categories. The handoff input's **newer source and its pagination report must be the same objects passed into the Event Team calendar**, preventing an accidental comparison of two different in-memory snapshots.

The private Discord-style output is only **ephemeral preview data** (no command registration, no bot sending, no actual Discord reads/writes). It has no authority to approve an Event, overwrite old source evidence, set available slots or change monthly quotas.

## Tested failure modes

1. A previously visible Event disappears entirely from the newer source.
2. An old archived thread disappears while a current Convoy Center event remains.
3. A scheduled-like Event becomes Cancelled, Completed, or Rescheduled.
4. Old and new dates differ; previous potential reservations remain visible.
5. Category switches from Partner to External, or different sources disagree on the Event status.
6. An event is added or a thread is moved/renamed/relinked with another canonical Event ID.
7. A message digest changes without new revision evidence, or previous revision evidence is dropped.
8. An entire source channel disappears or its claimed historical coverage interval changes.
9. An outbound invitation disappears, changes date/status/Event link or is added for a second recipient.
10. New archive pagination is incomplete, source inventory totals contradict rows or old-channel inventories disagree.
11. Claim timestamps roll back, historical scopes change, or inputs include undeclared sensitive fields.
12. Aggregate report and ephemeral preview do not reveal raw private IDs, and cannot be forged to enable production.

## Production blockers and CEO intervention

**No CEO action is required for these offline tests.** The real transfer requires a separate authorized private read-only Discord source collector, actual source-channel IDs and permissions, signed/independently highwater-verified lifecycle history, secure private source storage, full 24-month original-source reconciliation, independently stored encrypted backups and tested isolated recovery, privacy/Staff authorization, two-person consequential review, and explicit CEO pilot and later production permission.

The existing `data/legacy-convoys.json` has **115 frozen future records across six months**, but this is not proof of the original retrospective 24-month Discord lifecycle. The existing source audits and new staged handoff must not convert historical Kings parking-slot indicators into formal accepted Event Capacity allocations.

**DO NOT** paste any Discord bot tokens, private GitHub App tokens, owner Ed25519 keys, private Discord exports or credentials in public GitHub content. No live Convoy Checker workflow is changed and PR #143 remains unmerged.

## Acceptance gates before a real pilot

1. Explicit CEO read-only pilot consent; confirm the Kings system maintenance period has actually ended rather than assuming service restoration after 30 November 2026.
2. Test provider identity and effective channel-specific read permissions; privately inventory all original active and old/archived Discord channels.
3. Fetch source data with bounded, resumable, secure historical pagination (not just metadata-only mock scans). Retain raw private evidence only if legally permitted and in encrypted private storage.
4. Reconcile both old and new original-source snapshots and owner-signed journal before any status/hold transitions. Preserve all missing/unknown Event identities and source digests until human-reviewed.
5. Verify owner highwater independently, privacy and security boundaries, restricted runtime credentials and actual offsite encrypted restore.
6. Obtain separate CEO authorization for any consequential Staff booking decision, production merge or activation.

This feature is **tested offline** only; it is not a live Discord import, not an independently verified migration, and not a source of confirmed available calendar slots.
