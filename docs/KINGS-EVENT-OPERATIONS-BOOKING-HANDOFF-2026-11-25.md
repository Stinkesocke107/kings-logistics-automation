# Kings Event Operations × Booking — Safe Offline Handoff (Systems 12, 16, 17, 18)

**Status:** DRAFT, PRIVATE, READ-ONLY, NOT DEPLOYED.
**Date:** 25 November 2026.
**Hosting constraint:** GitHub Free only. No paid database, external VPS, always-on Discord service or subscription.

## What changed

New \`event-capacity-operations-handoff.js\` connects an **untrusted booking request review** from \`event-capacity-booking-safety-review.js\` to the **existing Event Operations preparation checklist templates** from \`event-capacity-preparation.js\`.

This is a pure computation only. The module:
- Reuses the previously validated private Event Calendar request preflight.
- Crosschecks **exact UTC instant** for departure, meeting and planned end, plus event category, status and reschedule claim.
- Does not infer completion, attendance, parking/slot assignment, external invitation acceptance, effective staff authorization, or available quota.
- Treats all caller-supplied records as **untrusted**, even when their fields say "verified."
- Produces countable, code-only **proposed checklist items**, never real tasks; it does not read or mutate the private Workboard.
- Refuses to make checklist proposals for Cancelled, Completed, Pending, Submitted, Needs Information, Ready for Approval or unknown event claims; a reschedule requires an explicit approval claim merely to enter the **offline proposal stage**.
- Blocks proposals for mismatched event category/time, false verification fields and source conflict, without changing any actual event state.
- Applies to Kings/Partner/External event templates without treating Kings quota exemption as approval.
- Outputs a redacted, ephemeral Discord-response **payload shape**, not an actual Discord API call.
- Does not import any private credential, contact Discord/GitHub, create bookings, ping roles, publish, commit data or change permissions.

## How the private pilot would eventually work

1. Protected Event Coordination pulls a current authenticated Convoy Center record and independently verified archival corrections.
2. The calendar source state is checked against complete historical evidence; uncertain occupancy still fails closed.
3. A real authorized user initiates or reviews a candidate booking; event identity and all UTC timestamps are matched.
4. Human-approved acceptance, slot proof and real staff authorization are verified before any durable Workboard task creation.
5. A separate secure protected transaction may create deduplicated checklist tasks in the private encrypted data store and monitor their status. This module **never** executes that transaction.
6. Any reply requires recipient permission checks, deduplication and Discord API safety. GitHub Actions cannot provide real-time Discord interaction callbacks by itself.

## Regression coverage

\`tests/event-capacity-operations-handoff.test.cjs\` includes offline cases for:
- Accepted-but-untrusted draft checklist proposal handoff.
- Canonical UTC timestamp equivalence, mismatches and invalid dates.
- Missing meeting/end information.
- Cancels, completed, pending, stale/contradictory data.
- Rescheduled claims, current daily quota conflict, Kings-owned exception.
- Invalid event identities, forged approval/success fields, privacy redaction.
- No import into existing live Convoy Checker or production workflow and no external API calls.

**Release gates remain:** real 24-month history and source authenticity, private runtime roles, durable private data/witness/backups with owner-independent checkpoint assurance, actual booking/slot identity model, verified overlap/parking and explicit CEO go-live review. CI success alone does not satisfy these gates.

**PR #143 remains draft. Production main and scheduled Convoy Checker remain unchanged.**
