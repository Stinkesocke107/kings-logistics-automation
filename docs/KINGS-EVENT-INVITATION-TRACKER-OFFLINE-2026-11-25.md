# Kings Logistics — Event Invitation Tracker, Offline Review (System 15)

**25 November 2026 — draft development only. No production release.**

## Purpose and no-duplication boundary

The current main already has the Convoy Checker, source and Discord monitoring, and the independent PR #144 metadata preview. Draft PR #143 already contains an untrusted multi-source future tracker export contract (event-capacity-convoy-multi-source-intake.js), but not a standalone outgoing invitation lifecycle review. This small isolated branch adds only that missing offline review. Do not fork or replace the Convoy Center, booking engine, event calendar, or existing staff approval flow.

## What is implemented

- Pure bounded input validation for original invitation claims and separately reported chronological status transitions.
- Draft -> Sent -> Accepted/Declined/Withdrawn/Unknown, with draft withdrawal allowed. Ambiguous, repeated, out-of-order, future and unknown references fail closed or require review.
- Counts for pending replies, overdue human follow-ups, source-reported outcomes, missing event links, duplicate event links and unresolved past departures.
- Output intentionally omits invitation IDs, Event IDs, Discord IDs, raw hashes, organizer names and raw dates. Review items refer only to an ephemeral source-row index and fixed reason code.
- Synthetic Node tests: node --test tests/event-invitation-tracker-offline.test.cjs.

**Accepted by a source is NOT a staff-approved Kings event.** Neither an accepted invitation nor a matching Event ID proves available capacity, parking, a confirmed slot or a human-approved Convoy Center status.

## Source contract

reviewKingsEventInvitationsOffline({asOfUtc, invitations, changes}) accepts strictly plain objects.

Each invitation must contain exactly: invitationId, eventId (nullable), departureAtUtc, createdAtUtc, replyDueAtUtc (nullable), sourceDigest.

Each status change must contain exactly: invitationId, status, atUtc, sourceDigest.

Times must be canonical UTC ISO milliseconds (YYYY-MM-DDTHH:mm:ss.sssZ); digests are 64-character lowercase SHA-256-shaped strings. **Caller-provided digests are not verified signatures or source authentication.** This module never fetches Discord or another external provider and never takes authorization booleans at face value.

All returned review counts are unverified source claims, not official confirmations. Returned data is for an internal private review and has safeToActivate:false, remindersSent:0, eventBookingsCreated:0, and staffApprovalsCommitted:0.

## Remaining integration (explicitly NOT implemented)

1. Identify one authorized outbound invitation source and verify Event identity and original message/reply evidence through read-only, private Discord/GitHub access.
2. Independently authenticate organizer response and handle a reopened or corrected invitation through an approved versioned lifecycle contract.
3. Integrate an authorized, redacted tracker export with PR #143 existing sourceIntake.tracker contract; until independently verified, connected and claimsComplete must be false.
4. Resolve conflicts, deleted/archived invitation messages, source completeness, reschedules, duplicates and organizer identity with Event leadership.
5. Add durable private storage, scoped roles, confidential history, human approval and recovery checks before any send, reminder or production sync.
6. Re-run full exact-head CI and independent privacy/permissions review before considering a merge.

**No new GitHub Actions workflow, Discord writes, tickets, invitations, automations, secrets, VPS or paid services.** Existing active main remains unchanged.
