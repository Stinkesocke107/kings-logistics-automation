# Kings Event Capacity — Convoy Center + Legacy Channels + Invitation Tracker

**DRAFT PR #143 · 25 November 2026 · Private-source integration plan · NO live Discord access in this change**

## The two Kings event systems — one shared scheduling evidence model

1. **Convoy Center & Checker:** authoritative operational source of incoming Event/Convoy submissions, Staff-controlled status transitions, accepted dates, reschedules and completion processing. The existing scheduled workflow `.github/workflows/convoy-checker.yml` configures Discord Guild `1114967437788577792` and primary Convoy Center forum `1550619824005062697`. Its checker reads active and public archived forum threads and creates the existing checker/overview output reports. The existing workflow must remain unchanged until authorized integration gates are met.
2. **Event Invitation Tracker:** planned outbound invitation-tracking system. Do **not** pretend the Tracker has been deployed or that an outgoing invitation marked Accepted proves the same Convoy Center event was approved for Kings capacity. A real outbound invitation may be related to an incoming Convoy Center entry, but **may also be legitimately unmatched**; unmatched entries require review, not silent insertion into the accepted calendar.

The active and former Convoy channels are **evidence sources** to these two systems, **not** independent schedulers. A single original event may be referenced by one current thread, one or several archived monthly-channel messages, and one outbound invitation; this is one Event identity and never three accepted bookings.

## Verified existing frozen legacy evidence

The existing `data/legacy-convoys.json` is a **one-time frozen legacy import** dated 2026-10-05T02:24:37.156Z, not a live Discord export. It currently contains **115** legacy convoy entries across **six** month sources:

| Source month | Existing frozen records |
| --- | ---: |
| October 2026 | 24 (1 preserved with missing original source) |
| November 2026 | 20 |
| December 2026 | 24 |
| January 2027 | 20 |
| February 2027 | 21 |
| March 2027 | 6 |
| **Total** | **115** |

The frozen file reports **111 confirmed Kings parking-slot records**, **1 pending slot**, **3 unknown slots**, **0 internal duplicate Event IDs**, **0 reported import failures**, and **1 preserved record with an unavailable original source**. **None** of those slot indicators is independently authenticated proof that an incoming Event invitation was formally accepted for capacity, nor proof of actual attendance. The original message/edited/deleted/archived thread history and older months outside these six sources remain to be checked. Never copy these private legacy rows into a public PR, logs or Discord output.

### Existing diagnostic and bridge code

- `event-capacity-convoy-multi-source-intake.js`: accepts **metadata-only** caller-supplied inventories for one current Convoy Center channel, zero or more known old channels, and an optionally configured outbound Tracker. Requires exactly a 24-UTC-calendar-month review window. Correlates only by canonical Event ID, never by fuzzy name, organizer, date or route. Missing IDs, conflicting status/category/departure, broken source thread counts, edited/deleted/archived original evidence and unmatched outgoing invitations become private HMAC-keyed review items.
- `event-capacity-convoy-system-calendar-bridge.js`: combines the claims-only audit with the **existing private 12-month Event Capacity staff calendar**. Current accepted snapshot counts and signed historical provisional holds remain **separate**; no automatic addition, release, approval or free-slot certainty. Produces a PRIVATE ephemeral preview without names/IDs/mentions.
- `event-capacity-frozen-legacy-calendar-audit.js`: independently checks structural/monthly consistency of the existing frozen six-month legacy import and reports only month counts plus evidence gaps. **0** new Kings Event Capacity acceptances are created, even when legacy Kings parking slots are marked confirmed.

The modules do not authenticate live Discord API results or issue tokens. All source-inventory flags are claimed by an external caller and remain **untrusted** until verified by a separately authorized collector.

## Real source acquisition that still requires authorization / connection

A private read-only source collector, separate from the existing production runner and from public CI logs, must:

- Enumerate the current Convoy Center forum's active and publicly archived threads with **complete pagination** and controlled error/retry handling.
- Enumerate all **actual** old month-channels with correct provider channel IDs (do not infer them from synthetic tests). Reconcile the six known month sources from the legacy file **plus** any older real archived channels that were not part of the frozen import.
- Retrieve the original permitted message history and edits or source digest snapshots if available; record deletion tombstones and gaps transparently where Discord no longer retains the original. Never forge lost messages or mark inaccessible sources as complete.
- Cross-reference canonical Event IDs, linked threads, outbound Tracker IDs, Staff decisions and reschedule histories; identify duplicate links, conflicting classifications and previously reserved UTC dates. Reconcile accepted invitations **only against trusted, authorized Kings Staff decisions**.
- Review monthly original-source completeness for the required rolling **24 calendar months**, and treat future legacy scheduled entries separately from the past 24-month history window.
- Store raw private source evidence only in authorized private, encrypted storage with least-privilege credentials and proper retention, legal holds and independent recovery; no personal data or private channel IDs in public repo artifacts.
- Require separate effective Discord role checks, two-person consequential review, permitted privacy/retention policy, complete independent owner highwater and genuine offsite recovery before future production go-live.

**Release blockers remain unchanged:** no direct Discord source fetching occurred during this ChatGPT development turn; no real Tracker connection was activated; no automatically accepted/declined events, Discord messages, production secrets or merges occurred. PR #143 remains DRAFT. Even a review board showing zero conflicts is **not** certified free capacity.
