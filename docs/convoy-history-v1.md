# Kings Convoy History v1

## Purpose

This subsystem is the long-term source of truth for Kings Logistics convoy history and public convoy statistics.

It is deliberately separate from the current live Convoy Checker so the existing production Core can remain stable while historical data is reconstructed and reviewed.

## Scope of v1

- Store one normalized record per convoy.
- Support own Kings-hosted and external convoys.
- Support multiple platforms without requiring them to be active.
- Keep participation evidence separate from Driver attendance.
- Prevent duplicate platform event IDs.
- Generate all-time, yearly, monthly and platform statistics from source records.
- Keep uncertain historical data out of public totals until reviewed.

## Platform status

- TruckersMP: active
- HaulMP: active
- TLMP: planned
- RealmMP: future

The history format is platform-neutral. TLMP and RealmMP are not queried by this v1 work.

## Public counting rule

A convoy counts as "attended" in the public statistics only when all of these are true:

1. status = completed
2. participation.status = attended
3. participation.confidence = verified OR confirmed_internal

For Kings Logistics, a TruckersMP **VTCs Attending** entry for Kings Logistics is accepted as verified evidence that Kings participated in that convoy. This reflects the Kings operating rule that when the VTC was entered as attending, Kings did take part.

Therefore a historical TruckersMP VTCs Attending record is stored as:

- participation.status = attended
- participation.confidence = verified

The individual number of Kings Drivers is still separate. If the Driver count is unknown, the convoy can count as a Kings participation while attendance.count remains unknown.

## Record model

Each record includes:

- internal Kings convoy-history ID
- platform
- platform event ID
- name and date
- own / external type
- organizer
- status
- participation status + confidence
- optional Driver attendance count/list
- event URL
- evidence list

When available, platform + platformEventId is the authoritative duplicate key.

## Data quality / confidence

- verified: strong primary evidence
- confirmed_internal: Kings-owned internal evidence confirms it
- partial: some information exists but is incomplete
- review_required: human review is required
- unknown: no reliable conclusion yet

## Planned historical backfill

The TruckersMP historical candidate collector gathers old Kings hosted and VTCs Attending events. VTCs Attending is accepted as verified Kings participation; uncertain metadata, duplicate conflicts or missing dates can still be routed to review before history import.

Pipeline:

TruckersMP candidate -> normalize -> deduplicate -> evidence classification -> review if needed -> convoy-history.json -> generated public statistics

## Public Discord output

The future public channel is:

`📊・convoy-statistics`

The generator in `convoy-history.js` already produces:

- `output/convoy-history-statistics.json`
- `output/convoy-history-statistics.md`

A later Discord publisher can render All-Time, Current Year, Own vs External and Records embeds from these generated statistics without changing the history data model.
