# Kings Event Capacity — Discord 24-Month History / Pagination Evidence Runbook

**25 November 2026 · DRAFT PR #143 · Private, read-only, synthetic-only functional integration**

## Goal

Kings Event Capacity must reconcile **Convoy Center & Checker**, the historical month/archived Discord channels and the planned **Event Invitation Tracker** without losing Events or automatically declaring dates available. This needs a review of **original Discord history over 24 UTC calendar months**, not only the existing six-month **frozen future Event import** or the current calendar.

The source-discovery and pagination modules in this development batch do **not connect to Discord**. They validate caller-provided, metadata-only **claimed** source inventory and page-fetch receipts. Even a completely green receipt chain does not verify that a real Discord bot had the permissions, discovered all channels, recovered deleted messages or reviewed all historical edits.

## New modules

- `event-capacity-discord-history-pagination-audit.js`: validates a bounded **exactly 24-month UTC** inventory with one claimed current forum and optional legacy forums/text channels. Source scan types are `active`, `archived-public`, `archived-private`, or `messages`, as appropriate to channel type. For each scan, validate paginated cursor sequence, page numbers, status, timestamp, metadata digest and indicated completion. Missing streams, incomplete scan continuation, forbidden/not-found/rate-limited API responses, gaps in claimed calendar month coverage and broken cursors become **private HMAC-keyed review issues**.
- `event-capacity-historical-discovery-workboard.js`: joins the new pagination receipt claims against the existing `event-capacity-historical-24month-readiness.js` **monthly human checklists**. A month with every human checkbox true but no claimed source or incomplete pagination remains blocked; a month where all receipts and checklists appear complete is still labelled *independent Discord source proof missing*.
- `event-capacity-unified-evidence-coverage.js`: combines the **year/month Event Team + Convoy Center + outgoing invitation Tracker** claims with the 24-month Discord source review. Requires matching guild, cutoff timestamp and exact 24-month scope; compares channel inventories by immutable ID and claimed coverage range, and marks missing/extra/contradictory source channels as human review items. A private ephemeral preview shows counts and each of the 24 UTC months without Discord IDs, Event names, messages, staff identities or credentials.

## Claims vs evidence: exact meaning

| Result | Can be asserted from current offline tests? | Proof of live source availability? |
|---|---|---|
| A claimed source has internally consistent cursor pages | Yes, in isolated synthetic tests | **No** |
| A claimed old channel is missing or has another claimed month range | Yes | **No**, still requires actual provider source list |
| One archive/private page returns forbidden or rate limited in supplied receipts | Yes, as a diagnostic scenario | **No**: needs a real permission/error receipt and retry history |
| All 24 Staff checklist rows claim reviewed | Yes | **No**, checkbox declarations are not an independent original-source inventory |
| Every original, edited, archived and deleted Event was recovered | **No** | Cannot be presumed even when Discord is reachable |
| Real Event Capacity date or booking availability is independently certified | **No** | Requires the full separately authorized source/Staff approval workflow |

A **missing channel or month means unknown/unreviewed, not zero Events**. A `hasMore=true` page without a complete continuation is a review gap. A scan with invalid cursor continuity never certifies a complete archive. A missing or deleted original cannot be recreated as authentic evidence by this software.

### Current frozen legacy file — separate meaning

The repository contains `data/legacy-convoys.json`, a **one-time frozen import dated 5 October 2026** with **115 future convoy entries across October 2026 through March 2027**. Of them, 111 have Kings parking slot confirmations; one preserved entry has missing original source evidence. This is valuable scheduling context, but is **not the previous 24 months of original Discord lifecycle history** and Kings slot confirmations are **not formal inbound Event Capacity acceptance**. Keep future scheduled legacy Event records separate from the 24-month retrospective original-source completeness review.

## Security and real source acquisition

For a future **CEO-approved, private, read-only source collection**:

1. Enumerate the real Kings Convoy Center forum and each genuine old month channel with their IDs through a separately authorized service. The current forum is configured in the existing workflow; the full list of old source channels is NOT known to this development run. Never substitute fixture IDs.
2. Fetch **active and archived** material with provider-side pagination. Capture only minimal metadata/cryptographic digests in a private evidence manifest; keep any original private message content in separately governed encrypted storage if retention and privacy policies permit.
3. For private archives, use only effective permitted permissions and record inaccessible responses as gaps. Do not assume Discord exposes arbitrary deleted message text or historical edit versions. Record source limitations and deleted/tombstone evidence separately.
4. Compare the actual provider inventory with the historical original-source events, Staff-signed approvals, cancellations, reschedules, old time slots, the outbound Tracker and 24 monthly checklist rows. Resolve ambiguity with humans, not with fuzzy Event matching or auto-declines.
5. Verify external highwater/key custody, independent offsite backups and recovery, exact Staff access, privacy/two-person checks and the separately requested private pilot.
6. **Do not enable live writes, merge PR #143, release old holds or certify available dates** until expressly authorized by the CEO and verified in the real environment.

## Action needed from CEO?

**Nothing immediately for these offline software tests.** For a real read-only Discord import, the CEO will later need to authorize the access method and help identify or enable a properly permission-scoped collector for the actual older channels, if the existing Kings bot cannot already access them. **Never paste a Discord bot token, private GitHub App token, signing key or raw private Discord export into a public PR.** Do not assume the reported maintenance period ending 30 November 2026 automatically restores services.

## Test coverage

Focused tests use synthetic source receipts only and include: 24-month period borders, channel-specific streams, total/archived/private pagination gaps, broken cursors, duplicate source claims, forbidden/rate-limited/not-found results, impossible timestamps, malformed or private input fields, human-checklist contradictions, source window disagreements, same-channel conflicting month ranges, no duplicate incoming/outgoing acceptances, private ephemeral rendering and production-import isolation.

**This is a software readiness step, not a deployed Discord collector or independently authenticated historical evidence.**
