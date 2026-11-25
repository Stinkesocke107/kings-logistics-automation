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

The CEO-confirmed **current binding event capacity policy** uses only **one daily cap applying identically on all seven UTC weekdays: at most 3 Convoys total**, **including Kings, Partner and External**. There are **no weekly limits** and **no separate 2/day Partner or External caps**. The independent monthly limits are **20 Partner Convoys** and **20 External Convoys**, each resetting at the UTC month boundary. **Kings Convoys have no monthly ceiling but count against the 3/day total.** The prior Mon–Thu/Fri–Sun distinction and prior Kings-daily exemption are superseded and must not be used for future planning.

The in-memory calendar separates source-reported Kings, Partner and External counts by month, using UTC departure dates, and reports `partnerMonthlyLimit:20`, `externalMonthlyLimit:20`, `kingsMonthlyLimit:null`, plus separate flags when observed Partner or External monthly counts exceed twenty. The review marks all-category totals above three per UTC date, departures closer than two hours, and pending, cancelled, or unclassified claims. The review counts remain **unverified source claims** rather than independently approved requests. Historical holds, unverified moves, pending changes, and cancellations never certify that a slot was released. `monthlyRemainingVerified` is **null**; no automatic booking, Staff approval, or free-space certification is introduced. The calendar details remain in memory and are never written to public GitHub logs.

## CEO-confirmed event planning priority

For new **unconfirmed** requests that compete for the same day, Event Coordination reviews them in this fixed order:

1. **Kings Convoy — priority 1**
2. **Partner Convoy — priority 2**
3. **External Convoy — priority 3**

The total daily maximum remains **three Convoys per UTC day**, counting **all three categories including Kings**. The independent UTC monthly ceilings remain **20 Partner**, **20 External**, **unlimited Kings**; there is **no weekly ceiling**. Priority does not override these limits.

The source-pilot now includes a deterministic, stable, read-only `prioritizeUnconfirmedRequests` helper and monthly counters for days over the global daily limit and days with mixed-category priority conflicts. It returns only category, priority and position, not private identifiers. Unclassified requests go to manual classification at the end. The helper is for **staff review order only**; it does not grant a reservation, undo an accepted invitation, cancel a confirmed event, move an approved convoy, release a slot, or make a promise that a higher-priority late request can displace an existing booking. Conflict resolution remains a human Event Coordination/Leadership decision under current permissions.

This is **planning priority**, not an automatic historical priority transformation: already confirmed or completed source reports remain untouched; the pilot cannot prove approvals from its current source ZIP alone.

The script never reads Discord secrets, sends Discord requests, writes GitHub content, logs Event identities, creates bookings, or claims free capacity. This pilot is a **source proof**, not a public Calendar and not a private Discord deployment.

## Explicit activation boundary

Even a successful real ZIP probe does **not** activate Event Capacity, Event Calendar, private Discord dashboard, tickets, reminders or booking automation. For a protected read-only Discord calendar next: configure and independently check the private channel's actual permissions and existing bot-owned status message, then selectively review required code from #143 rather than merging its unrelated systems. For booking: verified historical holds, secure Staff authority and durable recovery are further prerequisites.

**No additional hosting/VPS/payment is needed.**
