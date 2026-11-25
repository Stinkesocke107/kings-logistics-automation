# Kings Event Capacity — Unified November 2026 Daily Rules and Private Pilot Boundary

**Status:** Draft PR #143 only — 25 November 2026. **Not live, not approved for automatic booking.**
**Infrastructure:** Existing scheduled GitHub Actions / GitHub Free, without additional hosting.

## What this release step solves

The newly wired Event Calendar previously displayed the November 2026 *planning* caps (3 Mon–Thu, 5 Fri–Sun, Partner/External each 2 per UTC day), while the older Capacity, Staff Calendar and Booking Safety modules still used a historic 2/day + 20 Partner/month + 20 External/month policy. Mixing these calculations could falsely advertise available slots or cause different views to disagree.

The canonical \`event-capacity-policy.js\` now explicitly sets:

| Rule | Current planning value |
| --- | --- |
| Monday–Thursday, UTC day, Partner + External combined | Maximum 3 |
| Friday–Sunday, UTC day, Partner + External combined | Maximum 5 |
| Partner Convoys, any UTC day | Maximum 2 |
| External Convoys, any UTC day | Maximum 2 |
| Kings Convoys | Exempt from these quotas |
| Separation between convoy departures | Warn below 120 minutes; 120–180 minutes is the planning guideline |
| Monthly Partner/External caps | **Not adopted**; old 20+20/month figures do not apply automatically |

These are *planning review limits*, not automatic Staff approval or permission to reserve a parking slot. The category caps can make the theoretical combined Friday–Sunday allowance of five unreachable when all quota-consuming Events are only Partner or External; **no new hidden category or booking entitlement is inferred**.

## What was actually connected

- \`event-capacity-live-calendar-summary.js\` uses the shared rules to mark source-reported dates that require Event Coordination review.
- \`event-capacity-core.js\` evaluates daily and per-category warnings using the shared policy, emits monthly totals **without invented monthly remaining slots**, and does not assert real available slots from a current source alone.
- \`event-capacity-dashboard.js\` and \`event-capacity-day-view.js\` display *unverified planning claims*, not "green available"/"confirmed free" capacity, and use the correct weekday/weekend daily denominator.
- \`event-capacity-staff-calendar-review.js\` reports current source counts and **signed historical provisional holds separately**, without adding possible duplicates together.
- \`event-capacity-booking-safety-review.js\` uses the current combined/day and category/day limits for human review of proposed requests; all actual booking, approvals and capacity release remain disabled.
- \`event-capacity-github-only.js\` renders the planning-guide line from the same shared module rather than duplicated numeric strings.
- \`event-capacity-historical-reservation-holds.js\` deliberately preserves **frozen old 2/day and 20/month indicator flags** for signed historical evidence compatibility. These labels are not modern limits, may not be used to release historical dates, and never make a slot available.

## Important safety distinction

A fresh, authenticated GitHub Actions Convoy Checker ZIP is evidence that a current snapshot was obtained; it does not independently prove complete 24-month historical Discord archive coverage, approved Staff categorization for every event, recovered edits/deletions, current registered seats or parking capacity. Therefore every newly produced \`remaining\` / \`freeSlotsCertified\` / \`canApprove\` output intended for booking remains **null or false**. \`planningRemaining\` is an in-memory review aid only, never shown as a confirmed free-slot count.

Existing live production \`main\` and the Convoy Checker remain untouched. Draft PR #143 cannot enable a deployed job. None of these changes adds a workflow, bot server, database, Discord webhook, token, or extra hosting.

## Path to the first limited, protected read-only Event Calendar pilot

1. Review tests and PR #143 for correct source policy; confirm that only the existing **opt-in** Event Capacity step in \`.github/workflows/convoy-checker.yml\` is used.
2. Verify that the current private Event Coordination Discord channel truly restricts viewing to authorized roles; verify the actual Event Coordination, Event Leadership and CEO role ID variables through the repository's protected settings, and verify that the bot can only edit its designated message. Never paste secrets into a PR or chat.
3. After explicit owner review/approval, merge only an accepted minimal branch and initialize one private, bot-owned Event Capacity message using the existing controlled manual \`bootstrap\` path in an empty approved channel; record its message ID in the protected configuration.
4. Enable the **read-only Event source-summary sync**, only after private-role checks pass. The existing scheduled GitHub Actions runner edits that one message without mentions; it never sends Event booking confirmations or modifies Convoy Center data.
5. Observe actual runs, compare source counts against current private Convoy Center data, and reject any false "available" message. Keep automatic Staff commands/approvals, migrations and booking writes off until independently checked.

**No activation was performed in the Draft branch.** Offline tests cannot establish that the private channel and role IDs are correct; actual protected production verification and operator go/no-go are separate tasks.

## Regression coverage

The policy tests cover UTC weekdays/weekends, per-category caps, Kings exemptions and invalid dates. Core, Dashboard, Day View, Staff Calendar, Booking Safety and end-to-end shared-policy tests cover consistency, no prior monthly quota leak, false free-capacity flags, historic signed-hold separation and private Discord preview safety.
