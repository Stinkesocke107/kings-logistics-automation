# Kings Convoy Entry — Simplified Draft (October 2026)

This draft documents the new input split. It is not yet the live Discord forum template.

## Event Staff supplies
- **TruckersMP Event Link:** paste the full event URL, e.g. `https://truckersmp.com/events/12345`. The automation extracts the event ID internally; Event Staff does not need to enter a numeric ID.
- **Event Type:** `External Convoy` or `Partner Convoy` (Kings classification, selected by Event Staff).
- **Responsible Staff:** Discord @mention.
- **Kings Slot:** confirmed slot text or uploaded slot image; pending is not confirmed.
- **Additional Notes:** optional.
- Meeting point/time overrides: optional when Kings needs a different gathering point than the organiser.

## Read from TruckersMP automatically (when API has them)
- Event title, game, server, date, start and destination, route, meetup time, **departure time** and public event link.
- **Meeting time and departure time are separate values**; calendar-spacing checks must use departure time.
- Missing/unavailable API data should remain visible as an issue; never silently invent a time.
- Event host or TruckersMP event type must never decide whether the entry is an official Kings partner convoy.

## Rollout safety
- Existing convoy threads should not be force-migrated, cancelled, or rewritten solely because new fields are being introduced.
- Automated daily/monthly quota enforcement and new-entry-only strict validation belong to the next implementation phase.
- Until the Discord forum template is explicitly updated, this document is a draft rather than user-facing instructions.
