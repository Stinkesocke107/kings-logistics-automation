# Kings Event Capacity — Focused Manual Source/Calendar Pilot

**25 November 2026 | GitHub Free | Draft | Not deployed**

## Why a separate pilot exists

The original Event System PR #143 is a large, deliberately unmerged experimental branch containing future Staff, booking, historical evidence and recovery modules. It must NOT be promoted wholesale merely to test whether a **real current** Convoy Checker source ZIP can be read and transformed into a private twelve-month Calendar source summary.

This is a **separate branch based on current production main**, with only:

- `event-capacity-pilot-archive.js`: strict bounded in-memory ZIP parser (copied from the tested archive parser)
- `event-capacity-pilot-reconcile.js`: Convoy Center ↔ Overview and legacy inventory crosscheck (standalone; no booking engine)
- `event-capacity-pilot-source.js`: GET-only scheduled GitHub run/artifact/ZIP reader and internal 12-month source-claim projection
- Synthetic unit and integration tests
- A **single default-OFF manual input** in the **existing** `Kings Offline System Verification` workflow

Production `.github/workflows/convoy-checker.yml`, the Convoy Checker code, and every other live Kings workflow are **untouched**.

## Actual source evidence behind this pilot

The repository's most recent inspected successful *scheduled* Convoy Checker run has an unexpired `kings-convoy-reports` ZIP with the expected main-repo provenance and the required reports. This was independently checked through the user's connected GitHub API on 25 November 2026. Its private original Event/Staff details and the ZIP contents are **not committed to this branch**.

**Critical:** The scheduled jobs observed in GitHub metadata are much less frequent than the nominal 15-minute cron. A report older than 30 minutes will correctly yield `SOURCE_NOT_RECENT`. Do NOT relax that gate or substitute an unverified manual dry-run as a scheduled source merely to make the pilot green. Diagnose underlying Convoy scheduling before any continuous calendar sync.

## How the first read-only test will work

Only AFTER the small PR has passed CI, undergone explicit owner review, and been merged:

1. GitHub → Actions → **Kings Offline System Verification** → **Run workflow**
2. Branch: `main`
3. Turn on **`capacity_source_pilot`** (default false)
4. Run manually. GitHub Actions receives only its ephemeral `GITHUB_TOKEN`, limited by workflow permissions `actions: read` and `contents: read`.
5. The runner fetches the **most recent scheduled** main Convoy Checker run, **including failed or unfinished attempts**. It refuses to fall back to an older successful run if a newer scheduled run has failed or is still unfinished. Only if the newest scheduled run itself succeeded and is fresh does it verify the run-specific artifact and its run/commit identity, download the ZIP **into memory only**, and verify exact Kings guild/forum, current Center-to-Overview inventory and twelve UTC months of source claims. Frozen legacy rows are handled separately and never counted toward automatically available places.
6. Only a fixed safe result appears in the (PUBLIC) GitHub Actions log: `SOURCE_CALENDAR_READONLY_READY`, `SOURCE_NOT_RECENT`, `CALENDAR_UNVERIFIED`, `SOURCE_UNVERIFIED`, or `CONTEXT_REJECTED`. The first is structural source freshness/integrity readiness **not** proof of Staff approvals or historical completeness.
7. Any non-ready state fails the optional manual probe and does not affect ordinary scheduled Convoy Checker runs.

The in-memory calendar now also separates **source-reported** Kings, Partner and External counts by month, using UTC departure dates. Daily human-review flags follow the currently recorded planning limits (Mon–Thu 3 combined; Fri–Sun 5 combined; Partner and External 2 each; below two hours' departure separation warrants review). Pending, cancelled and unclassified claims also require review. **No category count or review flag certifies a bookable slot or an approved Staff decision.** None of this detail is written into the public action logs.

The script never reads Discord secrets, sends Discord requests, writes GitHub content, logs Event identities, creates bookings, or claims free capacity. This pilot is a **source proof**, not a public Calendar and not a private Discord deployment.

## Explicit activation boundary

Even a successful real ZIP probe does **not** activate Event Capacity, Event Calendar, private Discord dashboard, tickets, reminders or booking automation. For a protected read-only Discord calendar next: configure and independently check the private channel's actual permissions and existing bot-owned status message, then selectively review required code from #143 rather than merging its unrelated systems. For booking: verified historical holds, secure Staff authority and durable recovery are further prerequisites.

**No additional hosting/VPS/payment is needed.**
