# Kings Logistics — Event Invitation Tracker: private Discord GET-only source

25 November 2026. DRAFT, GitHub Free only. Stacked PR #148 based on #143. No production activation.

## Code in this branch

- event-invitation-discord-readonly-source.js: bounded private source scan, Discord v10 GET only, current Staff membership, verified effective channel VIEW and READ permissions, no unverified status acceptance.
- scripts/event-invitation-readonly-probe.js: real Node 24 HTTPS Discord GET transport with exact host/path allowlist, redirect denial, response cap and fixed no-data logging; main+workflow_dispatch only.
- .github/workflows/convoy-checker.yml: extra opt-in invitation_readonly_probe input (default false) on the EXISTING Convoy Checker manual workflow; no new scheduled workflow or independent Action. The Offline System Verification remains strictly token-free.
- Existing event-invitation-tracker-offline.js and event-capacity-invitation-lifecycle-bridge.js are reused; there is NO second Calendar, Convoy Center, booking or invitation engine.

## Minimum private configuration for any real manual run

Owner must authorize and check a dedicated PRIVATE Discord TEXT channel, exact authorized human Event Coordination/Leadership role IDs, approved Administrator role IDs and bot access. Prefer the EXISTING Kings invite-tracker forum if its real ID, private visibility and permissions can be independently verified. Do not create an unneeded second tracker or interpret public forum discussions as private source.

Configure in existing source repository Actions settings only after permission and public-repo workflow review:

1. Actions Secret KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID — exact verified PRIVATE source channel ID.
2. Actions Variable KINGS_EVENT_INVITATION_STAFF_ROLE_IDS — comma-separated exact authorized Kings Event Staff role IDs.
3. Actions Variable KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS — comma-separated independently verified authorized Administrator role IDs. Unapproved Admin roles block the preflight.
4. Existing Actions Secret DISCORD_BOT_TOKEN is used for GET requests. Do not paste credentials into chat. Prefer a separate read-only token/bot identity after scope review, because existing bot tokens can grant more than read access.

Source channel must be a private TEXT channel (type 0) or the already existing private invite-tracker FORUM (type 15), in Guild 1114967437788577792, explicitly deny @everyone VIEW, and allow the current authorized Staff and Bot VIEW/READ. Historical Staff role membership is NOT proven by current membership.

## Existing invite-tracker forum and optional strict structured text records

Earlier Kings event planning referred to an existing internal invite-tracker forum and a separate convoy-invitations forum. Neither channel's present identity, roles or private visibility has been independently verified here. **Exact private source channel IDs belong only in authorized configuration, never in this PUBLIC repository.** The forum reader supports active and archived public threads, bounded per-thread message reads and the existing human-readable VTC / VTC Link / Invited by entry layout. It reports only unverified counts and missing/ambiguous official Event links. It does NOT convert old forum discussion into Accepted, Delivered, assigned Event identity or a booking. The current mode supports a bounded 40-thread inspection and refuses incomplete pagination. No additional Discord channel is required just to scan existing forum history.

**Optional controlled type-0 channel format for future migration or formally authorized use:**

Each record is a normal private Discord message by an authorized human Staff member with exactly one prefix and JSON object:

Invitation creation:
KINGS_INVITE_V1 {"kind":"invitation","invitationId":"private-opaque-1","eventId":"12345","departureAtUtc":"2026-12-05T18:00:00.000Z","replyDueAtUtc":"2026-12-03T18:00:00.000Z"}

Status update:
KINGS_INVITE_V1 {"kind":"status","invitationId":"private-opaque-1","status":"Sent"}

Permitted state values for structured text updates: Sent, Accepted, Declined, Withdrawn, Unknown. Status chronology and source digests derive from actual message timestamps/IDs, never caller-provided signatures. Input format is a NEW controlled format, not a claim that older Discord posts follow it.

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

The existing forum mode deliberately returns only a private, anonymized unverified source review. It has no trustworthy per-VTC recipient IDs, accepted/rejected organizer evidence or canonical departure dates sufficient to populate the structured lifecycle/calendar. Those mappings must be independently validated with Convoy Center and human Event Coordination before any automatic calendar projection. A code-only forum scan is a discovery tool, not the completed outbound source-of-truth.
