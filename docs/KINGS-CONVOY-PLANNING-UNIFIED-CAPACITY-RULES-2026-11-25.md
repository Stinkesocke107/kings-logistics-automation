# Kings Logistics — Live Convoy Planning aligned with Event Capacity

**25 November 2026 | Existing production Checker/Overview | Advisory-only integration**

## Why this change is required

The existing operational Convoy Center planning module previously used an outdated **External 2/day** limit, a separate **Partner 3/day** limit and no 20/month Partner ceiling. Those rules contradict the final Kings Event Capacity policy and also disagreed with the newly integrated read-only Event Calendar projector.

Both the **operational** `convoy-planning-limits.js` and the **candidate Calendar** now use:

- **3 total Convoys per UTC day**, all seven days, Kings + Partner + External combined.
- **20 Partner Convoys per UTC month**, independent of the 20 External/month ceiling.
- **20 External Convoys per UTC month**.
- **No Kings monthly ceiling**, but Kings events still count toward the 3/day total.
- Departures **under 120 minutes apart generate an advisory warning only**, never automatic denial.
- New unconfirmed requests may be reviewed in priority Kings > Partner > External, but **already confirmed Convoys cannot be displaced automatically**.

Source dates are anchored to the actual verified UTC **departure instant**, including explicit offsets and calendar-month boundary changes. Only when a verified departure instant is absent does the planning review retain the tentative event display date and flag the missing departure separately. Invalid calendar dates are not silently accepted.

## Where this is connected

1. `convoy-overview.js` already calls the real `convoy-planning-limits.evaluate()`; the new rules therefore flow automatically into the existing Convoy Checker `output/convoy-planning-limits.json` report and the merged `output/convoy-overview.json`.
2. `convoy-overview-discord.js` shows **Partner x/20, External x/20, Kings uncapped monthly, combined UTC Today x/3**. Old 2/day External and separate 3/day Partner display rules are removed.
3. `convoy-planning-alerts.js` produces review-only monthly Partner/External thresholds, global 3/day warnings and 120-minute spacing warnings. Existing duplicate protection remains; notifications **never approve, cancel, move or reserve** a Convoy.
4. The #12/#16 read-only Calendar source integration can compare the same numerical capacity policy against the finalized Checker and Overview reports without silently mixing old limits.

## Authority and privacy boundaries

This is **operational advisory source data**, not a finished booked-capacity database. Existing Convoy Center source claims can include pending or incomplete Events and may omit historical decisions or separate Legacy records. A canceled/rescheduled Event or a missing source does not independently prove a previously confirmed place is freed. No free slots are certified (`freeSlotsCertified:false`), no historic Staff approvals are asserted and no personal identifiers are added to public summaries. Staff must review source conflicts, historical holds, classifications and approvals manually.

The public GitHub Actions **dry-run** of planning warnings emits only a fixed aggregate count and does not log private Event IDs. The normal already-owned private Event Leadership channel continues to receive allowed advisory messages. Existing HR/Driver systems and Event Booking #17 are outside scope.

## Release verification

- All JS/shell syntax and offline regression tests pass.
- A real main Convoy Checker live run updates the already-owned Convoy Overview with the new rules.
- Staff validates that earlier automated Discord notices are not mistaken for current policy; this rollout does **not** delete old Discord messages automatically.
- Historical original-source coverage, Staff decisions and the full Event Calendar UI remain separate launch gates.

## Event Staff classification queue — connected to existing operational alerts

Actual recent Convoy Checker reports can contain unresolved Event categories even when the 12-month Calendar source structurally reconciles. Staff must classify Kings/Partner/External using original source evidence; there is no safe automatic assumption based on a public TruckersMP host (only independently verified Kings-hosted events may be inferred).

`convoy-planning-alerts.js` now sends **at most one aggregate Staff source triage notice per UTC day** in the already owned private Event Leadership channel if the current `version:2`, advisory-only `convoy-planning-limits.json` has unknown Event classifications and/or missing verified UTC departure timestamps. The digest tells Staff how many source records need review and points to the existing Convoy Center, **without posting private Event names/IDs into GitHub Actions logs or a new public channel**.

- Existing persistent `data/convoy-planning-alert-state.json` and Discord recovery key protection prevents repeat messages on re-runs. Counts do not change a day's key; a new UTC day permits another reminder while unresolved.
- The digest remains an information-only Staff action request. It does not guess a category, accept an Event, release a confirmed date, or authorize bookings.
- Clean or malformed/untrusted planning input produces no fabricated alert.
