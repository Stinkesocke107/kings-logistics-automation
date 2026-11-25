# Kings Events #12 + #13 + #16 — First practical Convoy Checker → Calendar integration

**25 November 2026 — Draft PR #143, GitHub Free only, NOT LIVE**

## Existing real GitHub Actions integration

The already present \`.github/workflows/convoy-checker.yml\` on \`main\` has an **opt-in Event Capacity step** that uses the SAME scheduled GitHub Actions runner. It already supports a read-only preview, a manually gated private Discord message bootstrap and an opt-in sync. Prior to this change it could only publish a generic "availability unverified" message.

This development reuses that existing pathway, rather than starting another bot or service:

1. \`scripts/event-capacity-github-actions.js\` uses \`createPrivateGitHubReader\` and the established \`verifySourceFreshness\` contract (fixed own-repo, scheduled successful live Convoy Checker run, expected workflow/branch, bounded ZIP artifact, expected guild/forum, fresh report and matching Convoy Center/Overview inventory).
2. **Only after these checks**, the optional calendar callback executes on the same in-memory \`convoy-check-results.json\` and \`convoy-overview.json\`.
3. \`event-capacity-live-calendar-summary.js\` uses \`adaptConvoyReports\` with fixed Kings scope and freshness to project **12 rolling UTC months**, including rows of declared event dates, source status counts, separately classified Kings/Partner/External planning claims and unresolved source warnings. Known frozen legacy calendar rows stay **separate and not additive**.
4. Existing \`event-capacity-github-only.js\` now renders the **first three months** and a compact current-month day breakdown into the same existing private, permission-checked, no-mention Discord status message. Its existing idempotent message editing, manual empty-private-channel bootstrap and strict permissions continue unchanged. The message is capped at 2000 chars.
5. Any source/projection error falls back to **unverified availability** rather than inventing zero bookings, automatically retrying writes or claiming a free capacity.

## Current planning policy vs legacy core

The *planning-only warning calculation* reflects the latest Kings Event Coordination proposal:
- Monday–Thursday up to **3** Partner+External Convoys per UTC day.
- Friday–Sunday up to **5** Partner+External Convoys per UTC day.
- At most **2 Partner** and **2 External** per UTC day, each as separately declared categories.
- Kings Convoys exempt from quota.
- Less than **2 hours between departure claims** flagged as a possible conflict; a 2–3-hour separation remains the team's planning guideline.

**Important:** The historical \`event-capacity-core.js\` and downstream booking modules still implement the **older 2/day, 20/month proposal**. This new calendar does **not** use that legacy core to determine or publish "remaining slots." Before any booking/approval activation, all dependent capacity and calendar rules must be reconciled into one approved policy (including treatment of weekends, cancellations, reschedules and verified date windows). Never mix old and new quota engines for booking decisions.

## What the pilot can display

Example PRIVATE message excerpt (all values below are illustrative **synthetic tests**, not live Kings claims):

\`2027-03 | source planned 1 (P1 E0 K0 ?0) | pending 0 | cancelled 0 | review days 0\`

A count of source-reported "Scheduled", "Completed" or "Rescheduled" is **not independently Staff-approved acceptance** and is not proof of real attendance. Missing or deleted source records and old reschedule holds may still occupy capacity. No free slots are ever certified by this projection.

## How to activate a limited preview later

**Do not activate yet:** this functionality exists on Draft PR #143, not \`main\`. Once reviewed and ready, enable only the existing protected GitHub-only Event Capacity pathway. The CEO/operator must ensure the actual **private Discord destination** exists, that the three required role ID repository variables reflect current permissions, and that the existing bot-only message is initially bootstrapped manually into an empty restricted channel. Then a read-only calendar summary can be synced by the existing scheduler. Never ask for tokens in chat or store them in public PRs.

No change here creates a new workflow, adds a server, touches the real Convoy Center, writes Event data to Git, issues Staff decisions or starts bookings. This project will continue with source authorization/bridge integration and full latest-policy reconciliation before real Capacity bookings.
