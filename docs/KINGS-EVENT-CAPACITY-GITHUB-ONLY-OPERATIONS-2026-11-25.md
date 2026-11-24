# Kings Event Capacity – GitHub-only Bot without separate hosting

**Date:** 25 November 2026. **Status:** Draft PR #143 only. No live channel, Discord publication, or main-branch rollout was performed.

## Core decision

The user cannot host a server. The default operating path is **GitHub Actions + outbound Discord REST API**, not a paid VPS, Docker deployment or 24/7 WebSocket bot.

The **existing Kings Convoy Checker** already runs on GitHub Actions every 15 minutes. A new optional Event Capacity stage has been added to that existing workflow, rather than creating a second workflow that would require new registry/monitoring entries. It uses the same short-lived GitHub-hosted Node.js runner. These are best-effort scheduled runs; GitHub may delay/drop them. The bot can update Discord messages while it appears offline. This does not need the bot to run continuously.

Discord real-time slash commands, buttons and modal interactions require a reachable HTTP interactions endpoint or an online Gateway. GitHub Actions alone does **not** provide this. A later no-hosting management implementation can poll private Discord text requests, verify the author and current roles using Discord REST, and respond in a later run; it will not be real-time.

## Added draft files

- .github/workflows/convoy-checker.yml (existing workflow; optional guarded Event Capacity step and manual capacity_action input)
- scripts/event-capacity-github-actions.js
- event-capacity-github-only.js
- tests/event-capacity-github-only.test.cjs
- tests/event-capacity-github-actions-runner.test.cjs

The existing Convoy Checker already schedules on the default main branch. Its new Event Capacity step runs on schedule **only when an explicit repository variable opts in**; normal Convoy Checker behavior remains unchanged when the variable is absent. The draft branch cannot modify the live workflow. Manual dry-run/preview mode does not need the opt-in, channel IDs, bot token or network. The new capacity_action input defaults to off.

## Current safe functionality

1. GitHub API selects a recent successful scheduled main-branch Kings Convoy Checker run, validates provenance, artifact identity, bounded ZIP and source inventory. Manual dispatch and dry-run are never assumed to be confirmed routine source data.
2. Missing, expired, conflicting or unverifiable source shows **Data Outdated**.
3. Even when the source report passes integrity checks, **human Event Coordination classification, acceptance and exception evidence are not yet independently verified in GitHub-only mode**. The output therefore shows **Needs Verification**, three UTC months with question marks and **no confirmed free slots**. This is a safety preview, not a finished verified capacity calendar.
4. Before any Discord write, read current guild, channel and role information; require the specific private channel to deny View Channel to everyone and grant it only to Event Coordination, Event Leadership and CEO. Reject unknown allowed role/member overwrites. Guild owners and administrators can bypass normal channel permissions; real effective-permission review is still required.
5. Scheduled sync edits only an explicitly configured, preexisting bot-owned message in that exact channel; identical text does not trigger an API edit. Never add mentions or send notifications.
6. One-time manual bootstrap is permitted only in an **empty** private text channel with correct overwrites and a real bot token. It creates exactly one initial bot message and no accepted-event actions. No recurring job can bootstrap or create new messages.
7. Errors fail closed, do not leak private ZIP contents, tokens or human decisions to public logs, and never silently accept/cancel an event.

## Configuration after explicit CEO approval only

GitHub Settings → Secrets and variables → Actions:

**Secret already used by Kings workflows:** DISCORD_BOT_TOKEN. Never commit or print the credential.

**Repository variables:**
- KINGS_EVENT_CAPACITY_ENABLED — leave unset/false until the release is approved; then set to exactly true.
- KINGS_EVENT_CAPACITY_CHANNEL_ID — the new restricted 📊│event-capacity channel ID; do NOT use the existing Convoy Overview channel.
- KINGS_EVENT_CAPACITY_MESSAGE_ID — the initial bot message ID, added *after* the one-time bootstrap.
- KINGS_EVENT_COORDINATION_ROLE_ID — exact eligible Discord role.
- KINGS_EVENT_LEADERSHIP_ROLE_ID — exact eligible Discord role.
- KINGS_EVENT_CEO_ROLE_ID — exact eligible Discord role.

A secure rollout sequence:
1. Review the draft, tests, new channel/role permissions, bot permissions and release scope. Require the CEO's explicit merge/activation approval.
2. Merge reviewed code to main, leave opt-in false.
3. Dispatch the existing Kings Convoy Checker on main with mode **dry-run** and capacity_action **preview**: the Capacity preview itself makes no Discord calls. Existing Convoy Checker dry-run steps still execute as defined.
4. Create an empty private Event Capacity text channel, set exact channel/role IDs, ensure bot can View Channel, Read Message History and Send Messages and ensure only authorized staff may view.
5. With owner approval, set opt-in true and dispatch the existing Kings Convoy Checker with mode **dry-run** and capacity_action **bootstrap** once. In the private Discord channel, enable Developer Mode, select the bot message and Copy Message ID. No IDs are printed to public GitHub logs.
6. Set the message ID variable; dispatch the Convoy Checker with mode **dry-run** and capacity_action **sync** once. Confirm the same bot message updates safely.
7. Allow scheduled runs, monitor the workflows. Any missed schedule, bad permissions or stale source must not claim slots are free.

## Remaining functionality to implement WITHOUT a self-hosted bot

- Verify actual Event Coordination classifications and accepted Convoy Center decisions without storing sensitive plaintext in the public Git repository.
- Read-only staff day/month/search requests through scheduled private Discord text messages, with current role verification and durable duplicate-response prevention.
- Task and checklist management, protected role-authorized decisions, staff reminders, milestones, publication reverification, monthly/yearly reports through GitHub Actions and Discord REST, all with encrypted or otherwise appropriately access-restricted durable records.
- Historical reconciliations, 24-month audit history and 90-day encrypted backups with monthly isolated restore checks. Public GitHub Actions artifacts expire within 90 days and do not provide a permanent 24-month audit store.
- Security and permission E2E verification, reliable abuse handling, opt-in rollback and CEO release approval.

**The older private SQLite/independent-host architecture remains an optional engineering prototype, not a mandatory paid hosting requirement for the GitHub-only path.** It must not be treated as persistent when running on an ephemeral GitHub runner.

## Operational limitations

GitHub schedule is best effort. For public repositories, scheduled workflows may be automatically disabled after 60 days without repository activity. This requires monitoring and manual recovery. A green offline CI result does not prove the real Discord setup, historical source completeness, or the actual absence of private permission leaks.

Production main, existing Convoy Checker rules, accepted statuses, public messages and Discord roles stay unchanged until separate owner authorization.


## Hosting-free Staff read commands (new draft)

The existing GitHub-only runner now has a **second independent opt-in** for private read-only Staff text commands. The code remains disabled when this variable is absent/false:

- GitHub Actions repository variable: KINGS_EVENT_CAPACITY_COMMANDS_ENABLED — must be exactly true **in addition to** KINGS_EVENT_CAPACITY_ENABLED=true and a successful approved private dashboard setup.
- Existing Convoy Checker 15-minute scheduled workflow runs the normal Event Capacity status update, then optionally reads recent messages in the same private channel using outbound Discord REST. There is still **no separate hosted bot, WebSocket Gateway, or incoming HTTP endpoint**.
- Staff can type precisely these commands in the private channel:
  - !capacity help
  - !capacity status
  - !capacity month YYYY-MM
  - !capacity day YYYY-MM-DD
- Responses appear as ordinary **delayed message replies** (not native slash commands, dropdowns, ephemeral messages, tickets, or staff approval buttons). The bot disables author, role and everyone mentions.
- The first release is deliberately **READ ONLY**. It does not accept, cancel, reschedule or classify an Event, grant an exception, close a task, change a private ledger, or claim free capacity. Day/month outputs show the correct capacity *policy limits* but leave **actual accepted usage and free places unverified** until independently evidenced historical Staff decisions are available.

### Permission and dedupe constraints

Before processing, the runner validates the exact allowed guild and channel, the three current authorized role IDs, @everyone View deny and current guild role definitions. In particular, **an unrelated guild Administrator role is treated as a possible permission bypass** and prevents the private Staff-command worker from answering. Discord guild-owner exceptions remain subject to an explicit independent permission review. Every individual author is rechecked against Discord's **current guild member roles**; cached or self-asserted roles are not accepted.

The runner reads at most **99 recent messages** (requests yielding a full 100-message page refuse processing due to ambiguous deduplication). It only examines unedited, recent (35-minute window) exact commands, re-reads each original message, confirms it has not been changed or deleted, rechecks the current private channel/roles and current author membership, then replies to at most **two** eligible commands per GitHub run.

It detects prior bot answers using Discord message references. This is **bounded best-effort idempotence**, not an indefinitely durable exactly-once guarantee: deleted replies, an overloaded/busy channel or scheduler delays can prevent replies. For critical human decisions, a **separate protected durable audit and idempotency service is still required**. No critical writes are enabled in this workflow.

The application's **Message Content privileged intent/permission** must be available for the bot to read other members' message content through Discord APIs. If Discord returns blank or restricted content, there are no processable commands; never fall back to pretending a slash command was received. Review current Discord Developer Portal settings and application eligibility before activating. The bot must also have View Channel, Read Message History and Send Messages permissions in the restricted channel.

No raw staff command contents, user IDs, bot token, ticket information or private event history are logged to public GitHub CI. The source code includes synthetic fixtures only.

### Remaining gaps

A protected 24-month Staff audit store, immutable human decision validation, source history reconciliation, departmental tasks/approved exceptions and fully verified capacity remain open. The GitHub-only Staff command parser is not a substitute for independent evidence. A true real-time native Discord slash UI continues to require a hosted receiver or live Gateway and is **not** promised by this GitHub-only operation.
