# Kings Event Capacity — Manually Invoked Discord Preflight (Systems #12/#13/#16)

**Date:** 25 November 2026  
**Status:** Draft PR #143, NOT merged, NOT activated  
**Infrastructure:** Only the existing GitHub Free / `Kings Convoy Checker` GitHub Actions workflow; no additional hosting and no permanent Discord Gateway.

## What was missing

The existing private Event Capacity status flow correctly rechecks privacy before **sending/editing** a message, but had no standalone way for the CEO or Event Leadership to test actual current guild/channel/bot access **without sending anything**. GitHub repository metadata and offline synthetic tests do not prove live Discord role ID variables, channel overwrites, bot member roles, missing message IDs or permission drift.

The new `preflight` action is explicitly **READ-ONLY**. It queries only the existing Discord REST API (v10):

- `GET /users/@me`: current bot identity.
- `GET /guilds/{fixed-guild}/roles`: present role IDs and guild-level privilege bypass.
- `GET /channels/{configured-private-channel}`: current channel type and permission overwrites.
- `GET /guilds/{fixed-guild}/members/{bot-id}`: current effective bot member roles.
- Either `GET /channels/{configured-private-channel}/messages/{configured-message}` for a pinned private status message or `GET /channels/{configured-private-channel}/messages?limit=100` **only when message ID is absent**.

The check validates strict role IDs, explicit `@everyone` View denial, exactly three authorized dashboard role View grants, absence of additional View/Administrator bypasses within the fetched role inventory, unique channel overwrites, **effective bot VIEW + READ_MESSAGE_HISTORY + SEND_MESSAGES**, and the existing message owner + channel + marker. Admin-level bot credentials fail this check to avoid overprivileged publication credentials.

**Important:** This validates only the returned snapshot for configured guild/channel at check time. It does NOT prove that the Discord guild owner has no special access, that a role ID corresponds to the intended real-world Staff title, that no other unobserved private channels contain sensitive data, or that all historical Event records are complete. Server/guild owner access is a platform exception. A snapshot also does not guarantee permissions will remain unchanged.

## Operator flow after separate CEO-reviewed merge

1. In GitHub, open **Actions → Kings Convoy Checker → Run workflow**, on the protected `main` branch, with `mode: dry-run` and `capacity_action: preflight`. The workflow forcibly sets dry-run even if `live` was selected, as a second guard; the Node worker also rejects preflight unless `CONVOY_DRY_RUN=true`.
2. This action is intentionally available **without** setting `KINGS_EVENT_CAPACITY_ENABLED=true`. It needs the existing `DISCORD_BOT_TOKEN` secret but never prints it. Protected GitHub Variables required for meaningful verification: `KINGS_EVENT_CAPACITY_CHANNEL_ID`, `KINGS_EVENT_COORDINATION_ROLE_ID`, `KINGS_EVENT_LEADERSHIP_ROLE_ID`, `KINGS_EVENT_CEO_ROLE_ID`. The optional `KINGS_EVENT_CAPACITY_MESSAGE_ID` determines whether to check a message or an empty channel.
3. The only logs produced by this new preflight contain allowlisted operational **state codes**, never channel IDs, role IDs, member IDs, message IDs, private Event text, API responses or secrets.

Expected outcomes:

| Result | Meaning | What happens |
| --- | --- | --- |
| `READY_FOR_MANUAL_BOOTSTRAP` | The target is private, bot has effective permissions, no message ID configured, channel returned empty | No message sent. Separate manual bootstrap is still disabled unless explicitly enabled and approved. |
| `READY_FOR_READ_ONLY_SYNC` | Current protected message ID matches bot author/channel/marker and bot permissions pass | No edit. This is only permission readiness, not an actual test of Event source correctness. |
| `MESSAGE_ID_NOT_CONFIGURED` | An existing dedicated bot status was seen, but its ID isn't configured | Fail the preflight; set the correct ID in protected variables after independent owner verification. |
| `CHANNEL_NOT_EMPTY` | Channel has other messages and no configured target message | Fail the preflight; NEVER automatically create another status message. |
| `MESSAGE_NOT_VERIFIED` | Target message unreadable, incorrectly owned or fails the fixed marker check | Fail. Do not overwrite, adopt or create arbitrary messages. |
| `CONFIGURATION_UNVERIFIED` | Credentials, roles, privacy, bot permissions or REST data cannot be verified | Fail closed with a generic privacy-safe code; review protected configuration and Discord permission setup. |

Any non-ready state results in a **failed manually requested preflight** while the optional Event Capacity step remains noncritical to ordinary Convoy Checker health. No auto retries, role changes, reservations, archive edits, messages or GitHub state writes are performed by the preflight.

## Isolated manual Capacity-only run

On a manually dispatched workflow, selecting **preview**, **preflight**, **bootstrap** or **sync** sets the new `capacity_only=true` workflow output before the live/dry-run decision. The step always forces `dry_run=true`, regardless of the original requested mode, and skips **all 22 ordinary Convoy operational steps**. This includes the initial Convoy Center Discord scan, Driver reminders, announcements, archiving, monitoring/health writes, ordinary Convoy reporting and uploading the ordinary Convoy ZIP. Unlike the previous draft, a Discord preflight has no unrelated Convoy operations.

The only capacity-specific runner step executes the selected action. For a manual preflight it performs **Discord GET only**; even its result remains an operational readiness state rather than permission for automatic publication. The normal 15-minute scheduled Convoy Checker, its live stages and normal `capacity_action=off` manual runs remain unchanged.

Manually requested preview, preflight, bootstrap and sync actions fail the GitHub job if their selected action fails; this avoids false-green activation attempts. Auxiliary scheduled Capacity sync still remains optional so that a Capacity issue cannot mark a healthy normal Convoy run failed.

**Bootstrap and sync still require explicit write enablement** in protected GitHub settings; the GET-only preflight does not. Do not enable write modes merely to test Discord configuration. No changes from this Draft PR run on production `main` yet.

## Deployment boundary / next actions

**As of this PR, the real private Discord configuration has not been checked.** The GitHub connector cannot read existing Discord channel permission state or repository secrets, and there was no legitimate reason to request token material in chat. This code and its tests demonstrate a controlled path for verification **after a reviewed deployment**, not that the channel is already ready.

Once preflight passes and a separate owner-approved read-only source calendar is prepared, the existing opt-in `bootstrap` + `sync` mode can be enabled and observed. These write modes are distinct from the GET-only preflight and continue to require explicit opt-in; **automatic booking remains disabled** until independently verified Capacity history, Staff authority and durable storage/recovery.
