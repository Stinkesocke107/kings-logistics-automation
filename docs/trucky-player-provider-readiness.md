# Kings Live Systems — Trucky candidate provider acceptance gate

**Status (19 November 2026): PREPARATION ONLY — NOT ACTIVE.**

The live player-status source remains unchanged. The Trucky adapter cannot be enabled yet because the Kings application has not been confirmed as registered and the documented player-status endpoints were not reachable from the tested GitHub runners.

## Verified findings

- Official TruckersMP `/v2/servers` and Trucky server-list and static map endpoints returned HTTP 200 in read-only tests.
- Trucky `/v2/map/onlineList?ids=...` and `/v3/map/online?playerID=...` timed out in read-only tests.
- Trucky announced on 3 November 2026 that its new live map shows **Trucky-connected drivers**, not the entire TruckersMP population. This can change the coverage of a Kings Tracker unless clarified by the provider.
- The existing Kings Tracker must keep its last confirmed snapshot, display **Live Data Unavailable**, and leave real monitoring failures visible until full online data is verified.

Sources:
- https://api.truckyapp.com/docs/
- https://truckyapp.com/blog/announcements/new-trucky-live-map-is-now-available-on-the-trucky-hub/
- https://truckyapp.com/register-your-app/
- https://github.com/Stinkesocke107/kings-logistics-automation/issues/42

## Implemented but not enabled

The pure validation module `trucky-player-provider-contract.js` and its offline tests provide a fail-closed contract for a **future candidate** response.

It accepts a candidate response only if:

1. The requested set of TruckersMP IDs is nonempty, unique and bounded.
2. Every requested player has exactly one explicit online/offline boolean, matched by a real TruckersMP ID.
3. There are no missing, duplicate or unexpected players. An online-only list is **not** a complete status snapshot; omission does not mean offline.
4. Every online record has fresh observation time, a known ETS2/ATS game and a safe server name.
5. Results are returned as a sanitized, in-memory observation. No player status or location is written to the public repository.
6. Ambiguous, incomplete or stale data raises a validation error. It must never enter Tracker, Statistics, Central Overview, Leaderboards or Driver Management.

**This validation shape is a safety contract, not proof of the real Trucky API response format.** Once the provider works, compare redacted real response shapes with this contract and adjust only against verified documentation and tests. The production `tracker.js` and workflow intentionally do not import or call this module.

## Requirements before enabling Trucky

- [ ] Kings Logistics registers the application with Trucky, provides contact information and accepts applicable API-use conditions.
- [ ] The provider confirms whether `onlineList` explicitly returns offline entries for **every requested TruckersMP ID**, or only connected/online users.
- [ ] The provider confirms whether online coverage includes all TruckersMP users or only users connected to Trucky.
- [ ] Confirm the request limit, allowable cadence, response freshness and accurate ETS2/ATS server attribution.
- [ ] Perform a limited, registered, read-only test with synthetic fixtures and a small consenting Kings sample. Do not print IDs, names or location data in public logs.
- [ ] Confirm **complete requested roster coverage**, then stage the candidate provider behind an explicit opt-in. Do not automatically fall back to partial provider counts.
- [ ] Complete end-to-end validation: Tracker → Statistics → Central Overview, plus freshness, outage, stale and zero-online cases.
- [ ] Only switch production source after a verified real run and sustained health; continue monitoring.

No Discord roles, Driver membership, Staff permissions, Convoy data or historical statistics are modified by this preparation.
