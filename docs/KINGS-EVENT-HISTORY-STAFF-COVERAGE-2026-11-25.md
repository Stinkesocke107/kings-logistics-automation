# Kings Event History & Archive — 24-Month Staff Coverage and Rendering Safety

**Status:** DRAFT / PRIVATE PREVIEW / OFFLINE ONLY — 25 November 2026.
**Systems:** #12 Capacity, #14 Event History & Archive, #16 Calendar, #18 Event Operations.
**Hosting:** GitHub Free; no VPS, external hosting or new paid service.

## Problem and solution

The existing audit compares the current Convoy Center inventory against caller-supplied legacy channel claims, archived pagination receipts and staff-reviewed 24-month checklists. Previously the top-level status could say source inventory claims were internally consistent even when nearly all historical staff checklists were missing. This was not proof of availability, but it was too easy to misread as a completed review.

\`event-capacity-unified-evidence-coverage.js\` now:
- Separately counts **24-month staff checklists missing** and **staff checklists with open review items**.
- Prioritizes source inventory disagreement, unknown historical source, and incomplete archive pagination, then makes missing/incomplete human checklists explicitly visible. Even when every human claim is marked complete, the status still warns that Discord sources are **not independently authenticated**.
- Displays missing/open checklist counts in the private ephemeral Discord *preview shape only*, alongside missing sources and scan issues.
- Rejects shifted, reordered or missing months in the 24-row UTC history.
- Rejects forged output where per-month source counts or submitted checklist status differ from aggregate counters.
- Rejects rows falsely relabeled complete when supplied human review items remain unresolved; retains distinct precedence for missing sources and scan failures.
- Refuses fake \`eventBookingCapacityCertified\` and \`original24MonthDiscordHistoryIndependentlyVerified\` flags. Nothing in this draft authorizes live booking or private source import.

## Tests

New regressions in \`tests/event-capacity-unified-evidence-coverage.test.cjs\` cover:
1. Complete-looking Discord scan with **24 missing staff checklists**.
2. All 24 staff checklists submitted, but one has unresolved archive/review work.
3. Tampered month order, history window, aggregate counts, fake authenticated status and fake availability.
4. Submitted checklist flag forged for a month never reviewed.
5. Unresolved human review disguised as an independently complete source.

## Actual release blockers

These safeguards apply to **caller-supplied claims**, not real Discord responses. Before production we need independently authenticated current, older, archived and known deleted source handling, valid staff permissions, private encrypted storage, revision-safe owner-held checkpoints, real Discord REST validation, backup/restore tests, and CEO permission for activation.

No live Discord reads/writes, new tasks, bookings or approvals are introduced. Existing \`main\` and the production Convoy Checker workflow are unchanged; PR #143 remains Draft.
