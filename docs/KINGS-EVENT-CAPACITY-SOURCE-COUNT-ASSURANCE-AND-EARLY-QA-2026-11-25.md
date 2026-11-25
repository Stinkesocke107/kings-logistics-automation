# Kings Event Capacity — Source Count Assurance & Early QA

**25 November 2026 · PR #143 DRAFT · PRIVATE / OFFLINE / ZERO LIVE EVENT WRITES**

## Why we are testing already

The CEO reports that the Kings systems are not functioning normally until **30 November 2026**. Rather than waiting for all services to return, the software integration is tested **now**, with synthetic source records, the existing frozen six-month legacy import, unit tests and complete GitHub regression runs. The reported date is not a confirmed monitor incident or an authorization to automatically enable the system on 1 December.

There are **three distinct statuses**: *offline logic passed*, *offline data conflict detected*, and *live service not verified*. A passing software test is not a passing Discord access test, not an indication of unexpired runtime credentials, and not evidence that a slot may be offered.

## The actual discovered flaw

The original `event-capacity-convoy-multi-source-intake.js` checked **overall thread totals** but did not independently reconcile **archived and deleted thread subcounts per channel**. A source list could therefore have matching totals but hide an omitted archived or deleted original thread.

### Implemented safe mitigation

- `event-capacity-cross-channel-evidence-assurance.js` now checks claimed total, archived and deleted thread counts for each declared channel against the caller-supplied individual source records. It rejects invalid counts, unknown channels, duplicate source channel/thread keys, and malformed source kinds.
- `event-capacity-convoy-system-calendar-bridge.js` includes those discrepancies in its **private source-review summary**, separate from booking and historical hold counts. An archive mismatch is a human review issue, **not** a reason to silently add or delete Events.
- `event-capacity-prelaunch-diagnostics.js` already independently checks these counters and exposes its own mismatch statistics. The new scorecard uses the result while explicitly stating the lack of actual Discord provider verification.
- `event-capacity-prelaunch-test-scorecard.js` distinguishes **PASS (offline only)**, **FAIL (source-count mismatch)**, **WARN (incomplete archive/edit review)** and **BLOCKED (no live source verification)**.
- Unit and integration tests cover each boundary, including a total count that matches despite an incorrect archived or deleted count. **No original Discord messages, raw names or channel IDs** are emitted from the private reports.

The intended source of truth remains the authenticated authorized Convoy Center lifecycle history, not any of these input checkboxes. A claim that someone has reviewed edited/deleted threads cannot prove the original service still retains those messages.

**Outstanding software refactor:** A direct patch to the original multi-source intake was attempted but rejected by GitHub due to transient internal API/repository rule timeouts. The safe check **is active in the private bridge and prelaunch diagnostics**. It is **not** yet part of the original intake function's own source counters. Do not claim otherwise.

## System compatibility test matrix

| System | Offline test today | External/live test required |
| --- | --- | --- |
| Convoy Center & Checker | Existing syntax, workflow wiring, sample source inventory and status conflict | Authenticated actual Discord forum read/role permissions |
| Older/monthly Convoy channels | Frozen legacy counts, duplicate and archive/deletion gap detection | Every actual historical channel, pagination, inaccessible/deleted messages |
| Outgoing Event Invitation Tracker | Unlinked/duplicate invitations, no automatic acceptance | Actual Tracker connection and canonical Event association |
| Event Capacity | Daily combined 2 Partner+External, monthly 20+20, Kings exemption, no auto release | Original 24-month complete source and approved Staff allocations |
| Event Team calendar | Twelve months, daily review, no double counting, no `Available` claims | Verified private Staff authentication and read-only pilot |
| Backups and owner highwater | Synthetic signed history + AES-GCM recovery tests | Truly independent key/highwater custody, backup media, isolated restore |
| CI and production | Full exact-head offline GitHub Actions, public main unchanged | CEO-authorized private pilot, privacy signoff and separate production release |

## Maintainer checklist before invoking a private live diagnostic

1. Independently verify that access is restored and obtain explicit CEO authorization for the particular **read-only** pilot.
2. Privately enumerate actual current and legacy channel IDs; do not reuse synthetic test IDs and do not expose the list in the public PR.
3. Check effective Discord read permissions for the specific service identity, active and archived threads, and error handling for missing messages. Deleted content that no longer exists stays a documented gap.
4. Record source provenance, the exact owner-signed highwater, source digests and independently retained backup proofs without publishing private identities.
5. Use Staff/Management second-human review for consequential booking conflicts. No automatic accept/decline, slot release or post-maintenance activation.
6. Run the complete regression on the current PR commit and preserve logs before a separately authorized pilot or merge.

**Current authorization state: NO PRODUCTION WRITES, NO SECRET ISSUANCE, NO EVENT CAPACITY CERTIFICATION.**
