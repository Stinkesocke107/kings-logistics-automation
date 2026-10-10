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

A TruckersMP "VTCs Attending" / RSVP entry is useful evidence, but by itself it proves registration rather than physical attendance. Such evidence should initially be stored as participation.status = registered unless another source confirms attendance.

This keeps the public statistics defensible and prevents inflated historical totals.

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

The next phase should build a TruckersMP historical candidate collector. Its job is to collect possible old Kings events into a review queue, not immediately inflate public totals.

Pipeline:

TruckersMP candidate -> normalize -> deduplicate -> evidence classification -> review if needed -> convoy-history.json -> generated public statistics

## Public Discord output

The future public channel is:

`📊・convoy-statistics`

The generator in `convoy-history.js` already produces:

- `output/convoy-history-statistics.json`
- `output/convoy-history-statistics.md`

A later Discord publisher can render All-Time, Current Year, Own vs External and Records embeds from these generated statistics without changing the history data model.
