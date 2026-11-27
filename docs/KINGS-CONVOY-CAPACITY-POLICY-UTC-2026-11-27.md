# Kings Logistics — Definitive UTC+0 Convoy planning limits

**Owner decision:** 27 November 2026. This decision supersedes earlier provisional 20/month Partner and External counts in historical planning notes, which are no longer the active policy.

## Limits (UTC+0 only)

| Scope | Rule | Timing | Outcome |
| --- | --- | --- | --- |
| All types combined | **3 Convoys per UTC day** | Every day, Monday–Sunday | Human review warning above 3; no automatic cancellation |
| Partner Convoys | **30 per UTC calendar month** | Separate Partner count | At 20, 25 and 30: staged advisory; 31+: over-limit review |
| External Convoys | **30 per UTC calendar month** | Separate External count | At 20, 25 and 30: staged advisory; 31+: over-limit review |
| Kings Convoys | **No Kings-specific monthly maximum** | Still count towards combined daily cap | Daily cap review still applies |
| Departure interval | **Under 120 minutes** | Compare UTC departures across midnight/month boundaries | Advisory only; human scheduling review |

There is **no weekly convoy quota and no special weekend quota**. Friday, Saturday and Sunday use the identical 3-convoy combined UTC-day limit. Monthly counters reset on the first instant of each UTC month. The official verified UTC departure determines a convoy's day/month, not the viewer's local Discord timezone. If departure/time or category is unverified, flag it for Staff source triage; do not silently certify a free slot.

## Wiring

- `convoy-planning-limits.js`: same pure advisory source claim counts with separate 30/30 thresholds, 3/day, no weekly/weekend branch.
- `convoy-planning-alerts.js`: existing private bot-owned Staff notification flow; deduplicated monthly thresholds 20/25/30 and >30, daily >3, <120-minute spacing.
- `convoy-overview-discord.js`: same live Convoy Overview source; UTC monthly counters `External x/30` and `Partner x/30`, combined 3/day unchanged.
- `event-capacity-pilot-source.js` and `event-calendar-inline-checker.js`: 12-month Calendar source 30/30 checks and common 3/day UTC policy.
- `event-leadership-observation.js`, `event-history-leadership-bridge.js`, `event-operations-staff-triage.js`, `event-operations-integrated-readonly-proof.js`, `event-capacity-real-source-preview.js`, `leadership-dashboard.js`: propagate the independent >30 monthly review aggregates through Event History, Calendar, encrypted Event observation, Staff worklist and Leadership views.
- `kings-system-acceptance.js`: descriptive policy item aligned with the owner's decision.

## Strict evidence boundaries

These are **read-only source-claim counts and private warning/advisory rules**, not a reservation engine or certified open capacity. A 30th source claim is not over-limit; a 31st is a human review warning. Staff checks the original source, genuine approvals, cancellations, historical holds and invitations. Previously confirmed Events must never be automatically displaced. No Event, person, role, external invitation, or Discord approval is changed by this rule update. The cancelled **#17 Event Booking & Slot Management** is not reintroduced. The master technical and CEO final acceptance gates remain open pending authentic end-to-end production evidence.

**Verification:** Source functions, month-boundary conversions, weekdays and weekends, 30/31 thresholds, dedicated Partner/External counters, Staff alerts, Calendar, Event Operations, and Leadership dashboard are covered by the existing offline CI; green CI alone is not a full production or Event Coordination Lead signoff.
