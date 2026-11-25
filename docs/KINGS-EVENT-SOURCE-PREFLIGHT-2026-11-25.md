# Kings Events 12/13/16 — Live Convoy Source-to-Calendar GET-only Preflight

**Date:** 25 November 2026  
**Status:** Draft PR #143, NOT on main, not deployed  
**Infrastructure:** Existing GitHub Free `Kings Convoy Checker` workflow; no separate hosting or new Discord bot.

## Concrete first-live-readiness gap resolved

Before this change we had (a) a synthetic, credentials-free private Event Capacity `preview`, and (b) a **Discord GET-only** channel/role preflight. Neither confirmed whether the **actual most recent successful scheduled Convoy Checker report ZIP** could be read and converted to the 12-month Event Calendar using the existing protected GitHub-only pipeline.

The newly added manual action `capacity_action: source-preflight` checks that real data path without ever sending Discord messages:

1. Manually dispatch **Actions → Kings Convoy Checker**, branch `main`, select **`mode: dry-run`** and **`capacity_action: source-preflight`** after an owner-reviewed merge.
2. The current workflow treats this action as **capacity-only**: all 22 Convoy operational steps (including actual Discord Convoy read/parse, reminders, announcements, archive/status writes, report upload) are skipped. Even if `mode: live` is selected, the mode calculation forces `dry_run=true`. Scheduled normal Convoy jobs are unchanged.
3. The existing short-lived `GITHUB_TOKEN` is used only with the already bounded GET-only `event-capacity-github-source.js` reader; no Discord token, channel, role ID, evidence inspection or write-enable variable is required for the **source-preflight** mode.
4. The reader selects a **successful, scheduled** Convoy Checker `main` run and verifies its run/attempt/workflow identity, expected artifact and ZIP size, report and overview, Kings guild/forum identity, source inventory agreement and freshness (maximum 30 minutes).
5. The **exact same `monthlyFromReports` calendar projection** used by the protected Event Capacity sync is built privately in memory for twelve rolling UTC months. Missing, stale, malformed, tampered, incomplete or contradictory inputs cannot become a `SOURCE_CALENDAR_PREVIEW_READY` result.
6. The script prints only one of **three fixed states** to the GitHub Actions log:
   - `SOURCE_CALENDAR_PREVIEW_READY`: valid source artifact **and** a private read-only 12-month Calendar projection passed. This DOES NOT verify Staff approvals, historical completeness, bookings or free slots.
   - `CALENDAR_UNVERIFIED`: source ZIP structure checked, but Calendar projection unavailable or refused.
   - `SOURCE_UNVERIFIED`: source cannot be proven current, scoped and consistent.
7. Any result other than `SOURCE_CALENDAR_PREVIEW_READY` causes the manually requested GitHub job to **fail**, not show green merely because the regular Convoy stages were skipped.

No individual Event, Staff, bot, channel, role or run IDs, token, private Convoy contents, detailed calendar lines, or synthetic "free remaining" counts are printed, written to artifacts or sent to Discord by this mode. The preflight returns fixed boolean metadata only; it does not authorize a deployment.

## Distinct preflight phases

| Manual capacity_action | Network scope | Reads Convoy Event source? | Sends/edits Discord? | Enabled variable needed? |
| --- | --- | --- | --- | --- |
| `preview` | None | No | No | No |
| `preflight` | Discord GET only | No | No | No |
| `source-preflight` | GitHub GET only | Yes, validated scheduled ZIP | No | No |
| `bootstrap` | Discord GET+POST, protected channel | No | Sends one only after permission/empty-channel check | **Yes** |
| `sync` | GitHub GET + Discord GET/PATCH, optional message replies | Yes | Edits protected bot-owned message only | **Yes** |

**Automatic bookings are outside all five modes.**

## Still required before any first real protected channel posting

- Review PR #143 and separately authorize a limited promotion to `main` (the PR remains Draft until then).
- Ensure a real private Event Coordination channel exists, roles and bot credentials are configured in protected repository variables/secrets, and **run the Discord GET-only `preflight`**.
- Run **`source-preflight`** separately to authenticate the currently scheduled source ZIP and calendar projection, with no Discord permissions required.
- Only if both checks pass, consider a CEO-approved, manually initialized `bootstrap` in an empty private channel and a limited `sync` pilot. Both remain disabled without `KINGS_EVENT_CAPACITY_ENABLED=true`.
- Do not approve bookings or claim remaining capacity until historical active, cancelled and rescheduled holds are independently reconciled and Staff authority and durable recovery are checked.

**No live GitHub artifact was downloaded or Discord contacted during the PR development/testing.** Synthetic tests cannot establish current production availability.
