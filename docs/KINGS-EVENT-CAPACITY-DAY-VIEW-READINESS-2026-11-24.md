# Kings Event Capacity — Private UTC Day Detail (2026-11-24)

**Status:** Protected, read-only Discord prototype in draft PR #143; **not deployed** and not wired to public/live Convoy Center operations.

## Implemented source changes

- event-capacity-day-view.js — pure day projection with strict UTC date, 10 records/page, separate accepted, pending, cancelled, needs-verification and conflicting entries. Uses verified UTC departure for allocation and only a clearly labeled possible-date fallback for unverified entries.
- event-capacity-read-service.js — extends the existing signed /event-capacity command prototype with an optionally configured **day subcommand**. The server parses and validates date/page arguments before any private data retrieval and checks current member roles and channel privacy.
- tests/event-capacity-day-view.test.cjs and expanded tests/event-capacity-read-service.test.cjs — cover UTC day/month boundaries, denied unverified availability, cancelled/pending non-counting records, duplicates, safe Discord links, 10-entry pagination, malicious source status, input rejection, role checks and ephemeral-only output.

## Proposed slash-command shapes (not yet registered)

- /event-capacity — existing three-month read-only calendar preview.
- /event-capacity day date:2027-03-20 — private day details (Discord string date option with strict YYYY-MM-DD UTC validation).
- /event-capacity day date:2027-03-20 page:2 — the next 10 private items, if there are enough.

Day results use the already agreed daily cap of **2 Partner + Other External combined**, separate monthly 20/20 quotas, with Kings-owned events visible but non-consuming. Approved exceptions remain explicit and never expand the underlying cap.

## Safety/accuracy notes

- A Completed planning event remains **not** proof that Kings physically participated.
- Accepted source records are counted only after the existing policy engine's verified gates. Pending records are displayed but not treated as accepted, and cancellations never take capacity.
- Unreliable/contradictory/unknown departure, end or event status is always shown as **Needs Verification** or **Data Conflict**. A stale source must never be labeled verified free.
- A day contains only records whose UTC departure matches. Records without an assignable date are not placed in an arbitrary day; the private preview displays a generic warning.
- Cross-midnight departure spacing and meeting-to-end overlap still belong to the same advisory/conflict analysis, never automatic rejection.
- The preview limits data disclosure: no raw event IDs, staff IDs, organizer names, evidence references, or free-text external descriptions. It may provide a safe Discord Convoy Center thread link only for a numeric source reference; actual report provenance still requires a production attested adapter.
- Every response is an ephemeral Discord payload with flags:64 and allowed_mentions.parse empty. Calendar day result embeds contain at most **10 fixed-format fields**, bounded by Discord message limits. No auto-replies to channels and no persistent public messages.
- Read-service errors are generic so source content/credentials do not appear in user-facing failures. Existing private Activity Log/retention rules remain required.
- Current read service supports a single day query per signed Discord application command. No interactive buttons have been registered and no automatic live polling is enabled.

## Still required before real Discord use

1. Private, always-on application HTTP host + Discord ACK/defer lifecycle, robust retries and rate-limited checks; no real credentials in repository or GitHub Actions.
2. Verified role IDs, actual protected channel ID, owner/administrator access audit, durable nonce/replay tracking, and audit of all channel overwrites.
3. An authenticated transactional source for current and legacy Convoy Center data, encrypted decision history, version anchoring, encryption key rotation, 24-month personal-log retention and 90-day backup/restore with deletion propagation.
4. Human-confirmed historic events and careful reconciliation of all platform-neutral ETS2/ATS sources.
5. Genuine isolated real-guild end-to-end verification, followed by explicit CEO release approval.

**The existing production convoy-planning-limits.js and all staff event decisions remain unchanged.**
