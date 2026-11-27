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
- Confirm the proposed daily/event-type rules with the CEO; existing diagnostic 3/day and 120-min warnings remain advisory, **not** final approved business policy.
- Real Staff handover, error/retry evidence, end-to-end authorization and independent CEO release approval.
- Full live third-party map-provider recovery and Core/Final Freeze approval remain separate blockers.

**Release classification: DRAFT / NOT PRODUCTION-ACCEPTED.** The mandatory Event Booking & Slot Management #17 remains explicitly excluded.
