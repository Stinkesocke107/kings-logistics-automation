# Kings Logistics — Full TruckersMP Live Map Backup Assessment

Date: 21 November 2026
Decision: No secondary player-position feed enabled until verified complete and independent.

## Verified distinctions
- Kings VTC ID: 64284. Public Tracker and statistics count the FULL TruckersMP VTC, including players without Discord Kings Driver role.
- Discord Kings Driver membership and private Kings join dates remain independent and cannot filter the VTC player population.
- The official VTC members endpoint provides the complete member roster, NOT a per-player online list.
- Official server directory gives global server populations, NOT Kings-specific online identities.
- The current ETS2Map world-area endpoint is affected by the TruckersMP Map API incident. Its current failure must remain visible.
- Trucky redesigned its map on 3 November 2026. The new map includes only Trucky-connected drivers, not all TruckersMP drivers; do not use as a complete replacement.
- RoadWatch documents ETS2Map as its map source, so independence is unproven.
- Fleet-Tracker and other telemetry apps monitor participating clients, not proven full TruckersMP coverage.
- TMP Time advertises TMP VTC online views, but no independently documented full-coverage public data API and reuse terms were verified.

## Activation requirements
1. Confirm documented API, provider consent and permitted rate limits. No scraping public map sites.
2. Confirm source is independent from ETS2Map and remains available when ETS2Map is unavailable.
3. Confirm fresh player records on every official active TruckersMP ATS and ETS2 server, irrespective of Trucky, Discord or another app.
4. Confirm exact TruckersMP player IDs and VTC IDs, plus timestamps and server mapping.
5. Require FULL coverage of every official server. Compare complete player-list counts with the official server directory; reject partial results.
6. Fail closed on stale timestamps, malformed entries, missing servers, duplicate player IDs, inconsistent counts and request failures.
7. Perform two independent live verification runs and a privacy/rate-limit review.
8. Do not persist private Discord IDs, Kings join dates or per-player positions in public GitHub artifacts.

The new map-source-coverage.js is a pure FAIL-CLOSED validator for future integration. It is not a working second provider and is NOT wired into tracker.js. Existing outage behavior preserves the last valid online snapshot and shows independently verified Kings VTC membership without inventing online counts.

## Public CI error privacy during the current outage

The tracker preserves **actual** complete-server coverage results and never substitutes guessed online counts when the map provider fails. Its GitHub Actions output reports only **aggregate successful/total server checks, fixed error categories or a safe HTTP status code**. Arbitrary thrown provider errors and stack traces can contain user IDs, names, coordinates, request URLs or authentication material; these are never printed wholesale by the public tracker entrypoint.

This log minimization is **not a live-map recovery**: the external Map API outage and the Core End-to-End / Freeze gate failures must stay visible until a genuinely complete new verified run succeeds. Do not update the last-good snapshot timestamp on a failure.

## References
- https://truckersmpstatus.com/
- https://docs.truckersmp.com/
- https://truckyapp.com/blog/announcements/new-trucky-live-map-is-now-available-on-the-trucky-hub/
- https://forum.scssoft.com/viewtopic.php?t=353486
- https://fleet-tracker.eu/api-docs/
- https://tmptime.com/
