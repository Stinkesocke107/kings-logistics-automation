# Kings Event Capacity — Event-Team Year / Month / Day Review

**25 November 2026 · Draft PR #143 · Private, read-only software projection · Not deployed**

## Purpose

A single staff-oriented view should make the **year, individual UTC months and days** intelligible to Event Coordination and its leadership, instead of manually checking separate snapshot totals and old Convoy Center threads.

`event-capacity-staff-calendar-review.js` contains two **pure functions**:

- `projectKingsStaffCalendarReview({capacity, year, selectedMonth, historicalHoldsReports, historicalEvidenceReport})`
- `renderKingsStaffCalendarEphemeral(view)`

The implementation **reuses the existing Kings `event-capacity-dashboard.js` calendar projection** and its day calculations, rather than introducing an independent scheduling rule engine. It **does not** connect a Discord command or an actual Staff backend yet; a real ephemeral command must only be wired after independently verified authorization, privacy and source-provenance work.

## Calendar content

### Year selection (January through December)

One calendar call gives exactly twelve UTC monthly review summaries. Each month displays the two **separate** evidence tracks:

| Track | What is counted | Interpretation |
|---|---|---|
| Current snapshot | Partner / Other External / Kings convoys from the existing evaluator | A reported current event planning snapshot, **not** authenticated complete historical coverage |
| Signed historical provisional holds | Partner / External identities from the owner-signed historical journal, with old dates retained | Historical booking obligations requiring human reconciliation, **not** confirmed active occupancy |
| Original-source evidence gaps | Unresolved claims from the 24-month signed-source reconciliation | Missing/contradictory original evidence needing independent verification |

**Never add a current Partner count and a signed historical Partner count together as though they were different events.** They may represent the same accepted event. Conversely, a historical reservation missing from the current snapshot must not be automatically released.

The month report also displays whether the supplied historical count exceeds the current snapshot; this is a **human review hint**, not a proven error or slot release.

### Month selection (every UTC day)

Choosing a month adds a day-by-day view to the year summary. Each day shows the current accepted Partner+External count, the **separate** signed historical provisional hold count if one was supplied, and an explicit review status:

- **Daily Quota Conflict — Human Review:** a reported daily count exceeds the Kings standard combined limit of 2.
- **Historical Hold — Human Review:** an earlier accepted or approved-rescheduled date is still provisionally held.
- **Current Snapshot Acceptance — History Unverified:** currently reported booking without a signed-hold report for that date.
- **No Verified Booking Evidence — Not Available For Approval:** absence of accepted records is **not evidence of an available slot**.

All displayed months and days retain `remainingSlots:null`, `canApprove:false`, `freeSlotsCertified:false` and `safeToActivate:false`. The review does **not** automatically mark calendar days Available, Limited, Full, or free based on the legacy optimistic snapshot status.

### Policy

- Combined Partner+Other External accepted convoys: **2 per UTC day**.
- Monthly Partner: **20**; monthly Other External: **20**.
- Kings-owned official convoys remain quota-exempt.
- No weekly quotas.
- A cancellation, completion, or rescheduling never automatically releases a previous confirmed historical reservation.
- Human approval and supported original historical evidence are mandatory before a real acceptance or quota exception.

The private Discord **preview** uses ephemeral type 4, `flags:64`, disallows mentions, and renders a compact 12-month year text + one optional month day text. Blue uses Kings `#182DFF`. This is rendering code only; **no live Discord command or dashboard has been enabled**.

## Consistency and privacy boundaries

- Reject invalid year/month selections, wrong Kings quotas, malformed source day dates, unsupported negative or conflicting snapshot day/month counters, duplicate historical months, altered historical hold totals and mismatched signed journal revisions across months.
- A missing historical hold report is explicitly unknown, **not zero verified holds**.
- A historical evidence report may cover fewer than the displayed 12 months; those months remain marked as missing source verification.
- All raw Event IDs, Discord user IDs, owner signatures, source digests, key material and actual tokens are excluded from rendered results.
- Even if every month has a hold report and the source snapshot claims freshness, original 24-month source completeness, external latest owner highwater and real token scope have **not** been proved by these pure input reports.

## Draft integration and release blockers

The focused test suite validates year/month/day boundaries (including February 29), duplicate source/evidence controls, quota conflicts, old/new-date historical holds, no double counting, partial evidence, private Discord rendering and strict fail-closed behavior. The broader offline integration rehearsal now composes the staff calendar with the synthetic owner-signed history, five mock private grant probes, encrypted backup recovery, and private CEO safety summary.

Before any real Staff visibility or appointment acceptance, the separately authorized private backend must authenticate individual Event Coordination roles, ensure only minimum necessary Event metadata reaches staff, verify complete original historical source evidence, isolate token/key custody, perform independent backup restores and obtain explicit CEO approval. **No code here grants availability or permits production deployment.**
