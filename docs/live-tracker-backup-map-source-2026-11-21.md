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

## Operational failover — 25 November 2026

If a full verified map scan fails, the `Kings Live Systems` workflow does **not** publish partial or guessed Kings online numbers. Its map-dependent Tracker step is handled as a recoverable degraded condition, and the existing `live-outage-notice.js` updates the already-owned **Live Tracker, Advanced Statistics and Central Overview** Discord messages using independently verified official TruckersMP VTC membership and global server totals where available. Official server populations are labelled as **all TruckersMP players**, never as Kings online players. The last successful live snapshot and statistics history are left unchanged.

Map-dependent statistics and the normal Central Overview renderer are skipped during fallback, preventing stale state from being republished as current. The provider/API-health observations and stale-data health checks remain visible to technical monitoring; fallback success **does not mean live map recovery**. The workflow emits a degraded-mode warning and GitHub Step Summary. A missing or uneditable **existing Live Tracker, Advanced Statistics or Central Overview message** fails the fallback instead of silently reporting a healthy run: all three displays must show the honest unavailable state. Other reachable displays are still updated, and no replacement message is automatically created.

Normal full-map refreshes automatically resume when every required active server is verified, after which the Tracker, Statistics and Central Overview share the same new snapshot generation. This change does not add an unverified secondary player-position API or weaken the final full-live-coverage gate.

## Monitoring visibility — map outage vs. fallback

The Kings System Monitor explicitly distinguishes the external player-map provider from the Live Systems workflow: a failed map provider with a successfully completed Live Systems run is shown as **degraded player-map availability with an official-data fallback**, *not* as a healthy live player map. Missing/failed Live Systems runs show fallback delivery as unverified. A green player-map source requires provider health, successful production workflow and a fresh verified Tracker snapshot. The underlying monitoring issues, full-live source freshness checks, and Core/Final Freeze readiness gates remain unchanged and must continue to show the real dependency outage.

## Auditable delivery proof — 25 November 2026

The Live Systems pipeline now writes a small, public, **aggregate-only** `data/live-systems-delivery.json` file after attempting the existing Discord displays. The file includes no webhook URL/token, Discord message ID, player identity or coordinates. It records the checked time, fixed display labels, delivery mode and independently verified source type.

- `fallback-delivered`: all three existing Discord displays were verified. The source is recorded as `official-vtc-and-servers`, `official-vtc-only`, `recent-roster`, or `status-only`. A *status-only* notice must never be presented as verified official player data.
- `fallback-incomplete`: at least one display is missing or failed. Other reachable displays still receive safe notices; the workflow fails and the state is not green.
- `verified-live`: recorded **only after** the Tracker, Statistics and Central Overview succeed using one freshly verified full player-map generation. A stale or mismatched Tracker/Statistics source is rejected.

The Kings System Monitor displays successful fallback only when this proof is fresh (25 minutes), complete for **all three** fixed displays and the actual Live Systems workflow is healthy. Without proof, with old proof or with partial delivery, the monitor says fallback is **not verified**, even if GitHub happened to report a green workflow. The map API's own down/degraded status and strict full-live source freshness/Freeze blockers remain unchanged.

The delivery proof is persisted together with the live pipeline's existing data and API-health state. It is **not a substitute** for the full player-map API, an online-driver sample, or a full technical release sign-off.
