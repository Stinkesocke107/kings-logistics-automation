# Kings Logistics — Event evidence-boundary hardening (27 November 2026)

## Scope

This change advances the **existing** Event Capacity (#12), Event History (#14), Event Calendar (#16) and Event Operations / Manual Staff Review (#18). Invitation Tracker (#15) is unchanged; its original forum/reply reconciliation remains open. No new booking/slot system (#17) is introduced.

## Changes and rationale

1. **#12 Capacity:** The first month in the existing twelve-month UTC view now checks an active Convoy that departed within the previous 120 minutes **before** the first visible month. A 23:45 previous-month departure and a 00:30 current-month departure must flag the current UTC day for Staff review. The preceding Convoy is only a comparison point, **not** a current-month claim. Cancelled previous-month claims do not create this spacing warning.
2. **#14 History:** Future frozen Legacy holds now carry an explicit `utcMonth` in the twelve-month source. The History review agenda rejects missing, shifted, repeated or inconsistent future month identities instead of relabeling rows by their array index.
3. **#16 Calendar:** Same-run read-only integration checks all twelve UTC month identities in addition to the existing scope, rules, source age and reconciliation conditions. It still cannot declare free slots or independent Staff approvals.
4. **#18 Manual Review:** The protected Staff journal now rejects nonmonotonic/future-dated audit steps and evidence-kind mismatch. An already recorded Staff check must be **explicitly reopened** before starting the review again; it cannot be silently reverted to `IN_REVIEW`.

## Verification

- Added synthetic regressions in `tests/event-capacity-pilot-source.test.cjs`, `tests/event-history-review-agenda.test.cjs`, and `tests/event-operations-manual-review.test.cjs`.
- GitHub offline verification is expected to run on the PR. A successful Node test does **not** prove live private Discord access, original 24-month history completeness, authentic Staff decisions or a complete Event calendar.
- All comparisons remain **read-only** or operate only on already authorized encrypted Staff-review journal state. No new Discord messages, invitations, slots, approvals, roles, public Event details or personal data are included.

## Still open for acceptance

- Original Event Center / Legacy / Invitation forum provenance, full 24-month archive, UTC month and date changes, and same-source Leadership dashboard read-back after a **new authentic authorized Staff action**.
- **CEO planning policy confirmed on 27 November 2026:** max **3 combined Kings/Partner/External per UTC day**, **30 Partner** and **30 External** claims separately per UTC month, no monthly cap for Kings and no weekly/weekend caps. Under **120 minutes** between verified departures is a **Staff review warning only**. The policy is settled; original records, actual human decisions, booking status and final system acceptance are **not** independently verified.
- Real Staff handover, error/retry evidence, end-to-end authorization and independent CEO release approval.
- Full live third-party map-provider recovery and Core/Final Freeze approval remain separate blockers.

**Release classification: DRAFT / NOT PRODUCTION-ACCEPTED.** The mandatory Event Booking & Slot Management #17 remains explicitly excluded.

## Follow-up source integrity guard (27 November 2026)

`event-history-leadership-bridge.js` now rejects impossible ISO local dates (including 30 February and non-leap 29 February), invalid time/offset components and non-explicit timestamps before allocating an Event source claim to any of the 24 UTC historical months. Valid ISO UTC and ±offset dates retain their original instant. Unverifiable dates become an **undated original-source review flag**, or cause the source chain to fail closed if a stricter upstream Calendar check rejects the record. No original Event date, approval, participant or attendance is fabricated. Regression tests are in `tests/event-history-leadership-bridge.test.cjs`.

This is source-only hardening; it does **not** prove full historical archive coverage, a Staff signoff, confirmed Calendar availability or a final system release. The existing #17 Booking/Slot feature remains cancelled.
