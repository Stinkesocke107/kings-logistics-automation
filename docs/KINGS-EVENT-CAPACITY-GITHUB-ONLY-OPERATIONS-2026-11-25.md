# Kings Event Capacity – GitHub-only Bot without separate hosting

**Date:** 25 November 2026. **Status:** Draft PR #143 only. No live channel, Discord publication, or main-branch rollout was performed.

## Core decision

The user cannot host a server. The default operating path is **GitHub Actions + outbound Discord REST API**, not a paid VPS, Docker deployment or 24/7 WebSocket bot.

A short-lived GitHub-hosted Node.js runner attempts the private update at UTC minutes **07, 22, 37, 52**. These are best-effort scheduled runs; GitHub may delay/drop them. The bot can update Discord messages while it appears offline. This does not need the bot to run continuously.

Discord real-time slash commands, buttons and modal interactions require a reachable HTTP interactions endpoint or an online Gateway. GitHub Actions alone does **not** provide this. A later no-hosting management implementation can poll private Discord text requests, verify the author and current roles using Discord REST, and respond in a later run; it will not be real-time.

## Added draft files

- .github/workflows/kings-event-capacity-github-only.yml
- scripts/event-capacity-github-actions.js
- event-capacity-github-only.js
- tests/event-capacity-github-only.test.cjs
- tests/event-capacity-github-actions-runner.test.cjs

The workflow only schedules on the default main branch and its running job is gated behind an explicit repository opt-in. Until approved and merged, this branch cannot start the periodic workflow. Manual preview does not need the opt-in, channel IDs, bot token or network.

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
3. Run GitHub workflow manually with mode **preview**: no Discord actions or credentials required.
4. Create an empty private Event Capacity text channel, set exact channel/role IDs, ensure bot can View Channel, Read Message History and Send Messages and ensure only authorized staff may view.
5. With owner approval, set opt-in true and dispatch mode **bootstrap** once. In the private Discord channel, enable Developer Mode, select the bot message and Copy Message ID. No IDs are printed to public GitHub logs.
6. Set the message ID variable; dispatch mode **sync** once. Confirm the same bot message updates safely.
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
