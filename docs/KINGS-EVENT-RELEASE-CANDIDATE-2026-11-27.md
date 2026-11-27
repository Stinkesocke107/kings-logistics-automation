# Kings Logistics — Integrated Event Systems: release candidate / evidence gate

**Date:** 27 November 2026. **Scope:** #12 Capacity, #14 History, #15 Invitation Tracker, #16 Calendar, #18 Event Operations. **Explicit exclusion:** #17 Event Booking & Slot Management.

## Implemented in this integrated code candidate
- The earlier protected #12/#14/#16 source and UTC-boundary validation changes from draft PR #230.
- The #15 Forum inventory / duplicate / paginated archive hardening and #15+#18 actual stored Discord dashboard GET-read-back from draft PR #231.
- The protected #18 Staff journal chronological integrity and explicit reopen rules.
- A combined **manual** `integration-check` inside the **existing** Kings Event Leadership Reports workflow (not a 47th workflow): real Convoy Center/History/Calendar/Invitation source observations first; then the existing encrypted Event state vs. owner-bot Discord dashboard **Manual Staff Progress and Invitation Tracker** fields. No new invitations, allocations, Staff decisions, roles, channel messages, or bookings are generated.
- This manually requested job is no longer silently green after an integrated verification failure; optional push-time diagnostics remain nonblocking.
- A strict handover-only dashboard mode rejects absent, stale or unreconciled original Event/Invitation observations, even when the stored Discord message correctly says “Unavailable”. Ordinary dashboard delivery checks retain the distinct, weaker meaning **message equals source**.

## Safety and limitations
- All underlying forum and dashboard reads are GET-only; source data stay in memory or the existing protected encrypted repository state. Public CI prints only fixed status labels, never original private Event / Staff details.
- This **does not** prove a new authorized human Staff action happened in the same run. Source verification and stored dashboard read-back are separate checks even when executed together. Do not call that an authenticated same-transaction E2E.
- A successful read-only source inventory cannot prove all 24 historical months contain every original Event or that recorded invitation replies represent externally verified acceptance.
- The existing diagnostic 3/day, 20/month and 120-minute spacing calculations remain advisory, not a final policy authorization or reservation availability. Zero invitation claims must never be inferred from an unavailable source.

## After code review and safe merge: exact final real-world checks
1. An authorized operator runs **Kings Event Leadership Reports → `integration-check`** on `main`. Both the original source stage and independent protected stored-message stage must actually succeed. Record the Actions run URL in the private operator acceptance evidence.
2. Event Coordination Lead reconciles the original 24-month Event and Legacy source, the twelve-month future Calendar, actual cancellations/holds, Invitation Tracker original forum replies, missing/duplicate references, true ownership and responsible Staff roles. Record the exceptions and genuine decisions only in protected evidence, not public GitHub.
3. After a **new, naturally occurring authorized Staff review command**, prove the complete chain: human Discord command → authenticated role/source check → AES-protected journal commit → existing Leadership dashboard dispatch → actual owner-bot stored message re-read. Compare against the before-state and confirm recovery/retry. Never manufacture a personal decision to pass a test.
4. Event Coordination Lead confirms operational handover and error/recovery procedures. CEO approves the final Event policy and separately signs off each system using real evidence. No `COMPLETE` state before these checks are proved.

## Current formal state
**Technical code candidate; read-only and synthetic verification. No final production or CEO acceptance.** Keep #12/#14/#15/#16/#18 partially verified and all unchecked master gates open. The current 46-workflow inventory is unchanged.
