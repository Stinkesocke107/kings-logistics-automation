# Kings Logistics — Event Invitation Tracker: private Discord GET-only source

25 November 2026. DRAFT, GitHub Free only. Stacked PR #148 based on #143. No production activation.

## Code in this branch

- event-invitation-discord-readonly-source.js: bounded private source scan, Discord v10 GET only, current Staff membership, verified effective channel VIEW and READ permissions, no unverified status acceptance.
- scripts/event-invitation-readonly-probe.js: real Node 24 HTTPS Discord GET transport with exact host/path allowlist, redirect denial, response cap and fixed no-data logging; main+workflow_dispatch only.
- .github/workflows/convoy-checker.yml: extra opt-in invitation_readonly_probe input (default false) on the EXISTING Convoy Checker manual workflow; no new scheduled workflow or independent Action. The Offline System Verification remains strictly token-free.
- Existing event-invitation-tracker-offline.js and event-capacity-invitation-lifecycle-bridge.js are reused; there is NO second Calendar, Convoy Center, booking or invitation engine.

## Minimum private configuration for any real manual run

Owner must authorize and check a dedicated PRIVATE Discord TEXT channel, exact authorized human Event Coordination/Leadership role IDs, approved Administrator role IDs and bot access. Do not guess old Event messages or point to a public forum.

Configure in existing source repository Actions settings only after permission and public-repo workflow review:

1. Actions Secret KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID — exact verified PRIVATE source channel ID.
2. Actions Variable KINGS_EVENT_INVITATION_STAFF_ROLE_IDS — comma-separated exact authorized Kings Event Staff role IDs.
3. Actions Variable KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS — comma-separated independently verified authorized Administrator role IDs. Unapproved Admin roles block the preflight.
4. Existing Actions Secret DISCORD_BOT_TOKEN is used for GET requests. Do not paste credentials into chat. Prefer a separate read-only token/bot identity after scope review, because existing bot tokens can grant more than read access.

Source channel must be type 0, in Guild 1114967437788577792, explicitly deny @everyone VIEW, and allow the current authorized Staff and Bot VIEW/READ. Historical Staff role membership is NOT proven by current membership.

## Strict structured dedicated-channel records

Each record is a normal private Discord message by an authorized human Staff member with exactly one prefix and JSON object:

Invitation creation:
KINGS_INVITE_V1 {"kind":"invitation","invitationId":"private-opaque-1","eventId":"12345","departureAtUtc":"2026-12-05T18:00:00.000Z","replyDueAtUtc":"2026-12-03T18:00:00.000Z"}

Status update:
KINGS_INVITE_V1 {"kind":"status","invitationId":"private-opaque-1","status":"Sent"}

Permitted state values for updates: Sent, Accepted, Declined, Withdrawn, Unknown. Status chronology and source digests derive from actual message timestamps/IDs, never caller-provided signatures. Input format is a NEW controlled format, not a claim that older Discord posts follow it.

CRITICAL: Staff-entered Accepted status DOES NOT prove the actual external organizer replied, or that Kings Event Leadership formally approved an Event. Evidence of the original external reply and independently approved organizer identity would be required for that separate proof step. A Staff claim never creates a booking or certifies capacity.

## Limits and privacy

- At most five message pages, each at most 100 entries, and 25 Staff authors. Full pages must be paginated and any exhausted page limit fails closed.
- Only fixed no-data readiness strings may enter public GitHub Actions logs. Private original message content, event IDs, Discord IDs, user IDs, attachments, credentials, hashes and original source claims stay ephemeral in-memory.
- Discord errors, unknown roles, unexpected message content, missing source access, incomplete history, ambiguous IDs or non-private channels fail closed.
- This manual reader cannot prove 24-month completeness or recover deleted/edited messages, past Staff role assignment, organizer identity, source ownership or signed approvals.

After separate owner configuration and review, manual path:
GitHub Actions > Kings Convoy Checker > Run workflow > branch main > mode=dry-run > capacity_action=off > invitation_readonly_probe=true. This still runs the existing Convoy Checker dry-run checks; no new separate scheduler exists.

Before that, source remains NOT CONFIGURED. The optional source-reading step cannot be triggered from PR/push/schedule or live Convoy Checker runs and cannot run on a feature branch. The pre-existing Convoy Checker dry-run job itself still runs normally.

The private in-memory report can be passed to the existing Event Invitation and Event Calendar bridge only when a matching, separately verified Convoy Center snapshot is supplied. There are NO Discord writes, booking actions, approval changes, new hosting costs, auto-reminders or production merges.

Remaining real source, organizer-response, historical, private storage/backup and authorization release gates remain open. Software-only CI success is not go-live authorization.
