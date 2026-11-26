# Kings Logistics — #18 Event Operations: opt-in Discord-native Staff review commands

26 November 2026 — **NOT active until the Kings owner approves channel/roles and enables it.**

## Purpose

The CEO and authorised Event leadership can document the existing #12 Capacity / #14 History / #15 Invitation Tracker / #16 Calendar / #18 manual review progress **directly from Discord**, without their own GitHub accounts. This is a message-command interface processed by the existing GitHub Actions runner approximately every 10 minutes, **not** a slash-command gateway or real-time bot. A successfully accepted command updates only the existing AES-256-GCM protected `data/event-leadership-report-state.json` and refreshes the same fixed Event Leadership dashboard on commit. Discord Event content is strictly GET-only.

All Event review categories and original decisions are still advisory unless an authorised Event staff member checks original source records. A Staff journal check NEVER certifies original Staff approvals, true capacity, RSVP participation, cancellation, route details, bookings or released dates. **System #17 remains cancelled.**

## Private owner activation (required, not automatically performed)

1. In the Kings Discord server, select/create one private **TEXT channel** for Staff review commands. Protect it with an explicit `@everyone` **Deny View Channel** override and give exactly the six CEO-approved roles — **CEO**, **Head Management Event**, **Event Management**, **Event Director**, **Event Coordination Lead**, **Event Coordinator** — access to **View Channel + Send Messages**. The CEO's Administrator role bypasses Discord's ordinary per-channel permission overrides; the other five roles must receive explicit View + Send grants. Explicit individual View grants to other users or unrelated role View grants cause the source privacy check to fail. Bot role access is allowed. Do not use public channels, external invitation forums or Event announcement channels. Do not paste an actual Event URL or original message into this channel.
2. Enable the Discord bot's **MESSAGE_CONTENT privileged intent** in the Discord Developer Portal if required/eligible. Discord may otherwise return blank message content and the worker will fail closed (no cursor movement) rather than silently discard commands. The bot needs channel history access and GET guild roles, bot identity and member role data. A missing permission fails closed. See official API requirements: https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx
3. Confirm the **real role IDs** in Discord. The immutable Discord role IDs, **not the editable role display names**, authorize these six operators. Decorated names (for example a vertical bar preceding CEO) do not affect verification. Put the **CEO role ID first** in the secret; only that first role may possess Discord ADMINISTRATOR permission. All five remaining roles must not possess ADMINISTRATOR. Administrator access elsewhere on the server cannot be technically excluded by a channel deny; review that residual privacy risk before go-live. No role is assigned or renamed by this system.
4. In GitHub Actions **repository secrets**, privately set: `KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID` = approved Discord text-channel ID; `KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS` = comma-separated, genuine approved IDs for **all six** operator roles, ordered **CEO, Head Management Event, Event Management, Event Director, Event Coordination Lead, Event Coordinator**; `KINGS_EVENT_DISCORD_REVIEW_ENABLED` = `VERIFY_ONLY` for a metadata-only source access check, or (only after separate owner approval) exact value `ENABLED` for real Staff command processing. The existing `DISCORD_BOT_TOKEN` must already be configured; `DRIVER_STATE_KEY` is additionally required only for `ENABLED` command processing. NEVER paste tokens or private IDs into public GitHub inputs/logs/README.
5. The scheduled `Kings Event Operations — Discord Staff Review` workflow runs at minute 7/17/27/37/47/57. **When unset or any value other than `VERIFY_ONLY` / `ENABLED`, it does NOTHING: no Discord GETs, no encrypted state writes, no actions.** With `VERIFY_ONLY`, it performs precisely the four metadata GETs needed for privacy checks and does not read Discord message history or the protected Event state. `ENABLED` is the only mode that reads Staff messages and may update the encrypted review journal. On the first enabled run, it boots to the latest existing message without processing older messages. The channel can initially be empty; subsequent new commands are processed. This prevents historical messages being accidentally treated as commands.
6. Open the **private Event Leadership Dashboard** and copy a current opaque `KR…` code from `Event Operations — Private Review Codes`. Source timestamps or UTC date changes invalidate old codes, so always copy the newest one. The user’s Discord role is independently checked live using the bot’s guild-member lookup; the code alone cannot authorize a change.

**Live preflight adjustment (26 November 2026):** Live `VERIFY_ONLY` run #45735506101 returned `ROLE_NAME_MISMATCH`. The operator list is deliberately based on owner-approved **role IDs**, not mutable Discord display names. This fixes cosmetic CEO/event role name mismatches while preserving all permission, membership, channel privacy and non-CEO Administrator checks. Only the order in the existing private role-ID secret distinguishes the CEO Administrator exception; the owner must keep the CEO ID first. No live Event processing has been enabled.

**Role policy confirmed by CEO (26 November 2026):** All six roles have full access to the private Event Operations **review controls** (start, block, reopen and record_check). Higher Event leadership is **not read-only**. These commands change *review progress only*, not original Event approvals, capacity claims, invitations or bookings. The original Staff decision and evidence sources remain separately controlled. The operator role IDs must be stored as a private GitHub Actions secret; names alone never authorize command processing.

## Safe read-only setup preflight (before any activation)

The owner can set the private Actions secret `KINGS_EVENT_DISCORD_REVIEW_ENABLED=VERIFY_ONLY` while leaving live command processing **off**. On the next scheduled run or explicitly approved manual verification run, the existing #18 workflow checks only:

- The configured Discord channel metadata and exact private permission overwrites;
- The six owner-approved, immutable Guild role IDs, membership and permission flags (including the first-position CEO Administrator exception; cosmetic role names are not authority);
- The bot identity and current Guild bot membership roles.

This mode uses four Discord **GET** requests. It does **not** read channel messages, member commands, Event records, the AES-protected Event journal or its replay cursor; it does not create or update a GitHub state commit. Public logs expose only `SOURCE_METADATA_CHECKED` on success or `SOURCE_UNAVAILABLE` plus a **fixed, identifier-free diagnostic category** on failure. They never disclose raw Discord responses, channel or role IDs, bot tokens, or source records. The result checks the returned metadata **at inspection time only**. It does not independently prove effective permissions for all server administrators, full Discord message-read access, message-content intent, or that future human decisions are correct. An offline test cannot substitute for an actual owner-configured Discord source check.

### Reading a failed preflight

In `VERIFY_ONLY`, a failed run may now show `SOURCE_UNAVAILABLE [CATEGORY]`:

| Category | Safe next check |
| --- | --- |
| `CONFIG_INVALID` | Recheck the private Actions secret format: one Discord channel ID; comma-separated real operator role IDs; existing bot token |
| `CHANNEL_UNAVAILABLE` | Confirm the bot account is in the server and has **View Channel** for the private Event Operations channel |
| `GUILD_ROLES_UNAVAILABLE` | Check that the configured bot token belongs to a bot in the Kings Discord server |
| `BOT_AUTH_UNAVAILABLE` | Check the existing `DISCORD_BOT_TOKEN` privately in GitHub Secrets; never share the value |
| `BOT_MEMBER_UNAVAILABLE` | Verify bot membership and its ability to read guild membership metadata |
| `CHANNEL_METADATA_INVALID` | Confirm this is a normal private server text channel, not a thread/forum or other channel type |
| `ROLE_POLICY_INVALID` | Discord's Guild role response has invalid or incomplete general role metadata |
| `ROLE_MISSING` | An ID saved in the operator-role secret is not a role in the Kings Discord server; recheck all six role IDs privately |
| `ROLE_UNEXPECTED_ADMIN` | At least one non-CEO configured role has Discord server-wide Administrator permission; owner should review the elevated role permission, rather than silently disabling the safety check |
| `CHANNEL_PRIVATE_POLICY_INVALID` | Explicitly deny **View Channel** for `@everyone`; remove any unintended user or unrelated role grants |
| `ROLE_ACCESS_INVALID` | Give each non-Administrator operator role explicit **View Channel + Send Messages** allowances |

The exact first failing category is a diagnostic aid, not proof that every other setting is correct. Correct the cause and re-run in `VERIFY_ONLY`. The existing restrictive gates remain unchanged; a failure never permits command processing.

To activate human command processing later, an owner must separately change this same secret to `ENABLED`, after verifying effective staff privacy, intent availability, and review policy. An absent or unknown value still disables all network access. No Staff commands, bookings, invitations, approvals, role changes or messages are sent by the preflight.

## Messages for authorized CEO and Event leadership operators

Post ONLY a private message using these exact templates (one command/message; no raw Event link, sensitive records, mentions or notes):

- Start review: `!kings-review KR<24-lowercase-hex-chars> start`
- Missing source evidence: `!kings-review KR<24-lowercase-hex-chars> block`
- Reopen: `!kings-review KR<24-lowercase-hex-chars> reopen`
- Record a human evidence check: `!kings-review KR<24-lowercase-hex-chars> record_check STAFF_RECORD ORIGINAL_RECORDS_CHECKED`

For the final command, `STAFF_RECORD` can also be `ORIGINAL_DISCORD` or `ORIGINAL_EVENT_PAGE`. The final phrase indicates the human has manually checked the original record separately. The system records only evidence **kind**, not its private content; it does not verify the original independently. `record_check` requires a previously authorized `start` action on the current same source finding. Messages from users without one of the six approved roles are ignored.

## Safety / idempotence

- Before ANY command is processed, the worker GETs real guild role metadata, its own bot member roles and the channel's actual overwrites; it refuses public/unapproved or changed channels and no Discord writes are performed.
- Each message is checked against the current Discord guild member roles (not Discord username or claimed role in message text). Unknown command formats, invalid/expired issue codes and invalid status transitions never create an approval or Event source write.
- The encrypted `discordReviewCursor` prevents replay; the first poll is bootstrap only. The worker reads up to 800 messages over eight bounded API pages, failing closed on backlog overflow. A deleted previous message is okay if the cursor’s snowflake order is still intact.
- Rejected command counts are aggregated only in encrypted state and summarized in the same private dashboard; GitHub Actions logs print fixed result statuses only and must never show message text, role IDs, historical months, usernames or VTC/Event data.
- GitHub Actions shares the existing Event Leadership concurrency group and uses `scripts/git-safe-push.sh` for state-only commits. The shared Leadership dashboard refreshes via the protected state-file push trigger.
- **No immediate slash-command/ephemeral response:** feedback arrives via the fixed private dashboard on the next run. A task counts as staff checked only if the protected journal shows `STAFF_CHECK_RECORDED`. If the issue source changes or the recorded check is older than seven days, `RECHECK_REQUIRED` is shown.

## Release gate and known limitations

Offline synthetic tests cover strict Discord privacy overwrites, immutable Guild Event role IDs regardless of cosmetic names, GET-only API calls, member checks, forged/stale codes, first-run bootstrap and replay, bounded pagination, denied message-content access and AES-protected state. A successful GitHub workflow does not prove the actual Discord channel has been configured; **production adoption requires the owner-provided secret values and a successful real source check**.

This is a low-infrastructure command polling adapter built on existing GitHub/Discord permissions, **not a continuously connected Discord Gateway bot**. For future instant slash commands, Kings would need a separately deployed secure Discord interactions endpoint with signature verification and controlled write persistence. That deployment is not implied or created here.
