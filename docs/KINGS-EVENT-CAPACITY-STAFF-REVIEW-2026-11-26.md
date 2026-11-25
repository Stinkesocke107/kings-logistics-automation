# Kings Logistics — #12 Event Capacity: Staff review integration

**26 November 2026 — existing Convoy Checker, Calendar #16, History #14, Event Operations #18, and Leadership dashboards**

## Confirmed policy

- **3 Convoys total per UTC day**, Kings + Partner + External combined, seven days a week.
- **20 Partner Convoys/month** and independently **20 External Convoys/month** (UTC). Kings monthly unlimited, but Kings still counts toward the daily three.
- **120-minute spacing** between departures is a warning for human review, not a rejection.
- For unconfirmed candidate review only: Kings > Partner > External; never displace or automatically cancel approved Convoys.
- No free/bookable capacity can be certified from incomplete source records. Canceled records do not independently release an approved hold. **System #17 Booking & Slot Management remains removed**.

## Integrated source checks

The operational Convoy planning code already warned when monthly limits or departure gaps were exceeded. The provisional 12-month Calendar also computed over-limit months, but the private Leadership Event observation and Event Operations queue did not expose those warnings.

- The existing Calendar projector now counts **UTC days with departures under 2 hours apart**. The check compares departures across midnight and UTC month boundaries; the *later* UTC date receives the warning. Multiple close departure pairs on the same date produce one day warning.
- The History/Calendar bridge passes three aggregate fields: **Partner months >20**, **External months >20**, and **UTC dates with <2h spacing**, alongside existing >3/day and classifications.
- The existing encrypted Event Leadership observation validates the new aggregates and stores only safe totals. Old state lacking the required fields is **Unavailable** until the next source refresh, not falsely zero.
- The fixed private Event and Management Leadership dashboards display policy and aggregate review counts only.
- The Event Operations human-only review queue prioritizes **HIGH** Partner/External monthly cap conflicts and **NORMAL** short-gap days; functional ownership is Event Coordinator or Event Coordination Lead, never an automatic personnel assignment.
- Existing Event Leadership / Dashboard workflow checks now include the shared capacity source. No new Discord channels, event writes or public reports.

## Release proof and limits

Synthetic tests cover independent Partner/External monthly limits, daily combined cap, UTC day counting, 23:30-to-00:30 UTC boundary gaps, invalid/missing source, no free slots, encrypted aggregate safety, and read-only staff review. Offline CI checks are distinct from actual source freshness and production dashboard publication.

This implementation cannot independently confirm original 24-month historical approval coverage, booked dates, true remaining slots, invitations accepted, or which individual Event Coordinators completed a task. The Event Leadership observation is normally refreshed through its existing non-preview source pipeline; stale or absent data remain unavailable until that happens.

## Phase 2 — operational UTC warning alignment and actual read-only source proof

The operational Convoy Checker and 12-month Calendar now attribute every under-120-minute departure warning crossing UTC midnight to the LATER departure UTC date. Previously the Convoy Checker used the earlier date while Calendar used the later date; now both agree. This does not modify approved events or change the durable warning deduplication key (which depends on the Event pair, not the date).

The new event-capacity-real-source-preview.js verifies actual generated Convoy Checker and Overview files in memory through the same reconciled Calendar/History -> protected Event observation -> Event Operations human-review chain. Success prints only the fixed public-safe code CAPACITY_READ_ONLY_SOURCE_RECONCILED; failures print only SOURCE_UNVERIFIED. It never logs real Event dates, totals, VTC/Staff names, IDs, links or messages, and it does not save source output.

The existing Event Leadership GitHub workflow now invokes this proof after its real Calendar/History preflight on push. It also offers a manual capacity-check option under Actions -> Kings Event Leadership Reports -> Run workflow on main. This separate job uses contents: read and runs only the existing GET-only Convoy source pipeline (all source stdout/stderr suppressed), then proof. It does not post Discord messages, migrate or commit private state, or approve/book events.

A green check confirms source readability, current reconciliation and aggregate Staff review. It does NOT certify free capacity, original Staff approval, complete 24-month archives or RSVP attendance. Private Leadership observations still refresh on the existing Event Leadership reporting schedule; a manual capacity-check does not rewrite them.
