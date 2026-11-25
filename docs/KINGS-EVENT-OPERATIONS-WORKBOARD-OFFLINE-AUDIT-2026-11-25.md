# Kings Event Operations — Private Workboard Read-Only Audit

**Date:** 25 November 2026  
**Scope:** Event Systems 12/16/17/18 — Capacity, Calendar, Booking, Operations.  
**Status:** DRAFT / OFFLINE ONLY / NOT CONNECTED TO LIVE DISCORD.  
**Infrastructure constraint:** GitHub Free only. No external hosting, paid database or always-on server.

## What this connects

\`event-capacity-operations-workboard-audit.js\` composes the existing read-only:
1. \`event-capacity-booking-safety-review.js\` candidate UTC-month/day/quota review,
2. \`event-capacity-operations-handoff.js\` Event Operations checklist proposal,
3. \`event-capacity-preparation.js\` Kings/Partner/External convoy checklist templates,
4. \`event-capacity-workboard.js\` Workboard state validation and attention/reminder proposals.

The new pure function **does not fetch real Discord data, authenticate original sources, approve Staff, mutate Workboard, send reminders, reserve parking, book slots, change any Event status, edit an existing Convoy Center thread or create GitHub repository state.**

## Read-only behavior

- Requires an existing candidate event/booking/calendar and a supplied, structurally validated Workboard state with an explicit canonical UTC review timestamp.
- Checks event identity and matching UTC schedule using the previously built Booking→Operations handoff; no checklist proposals for a mismatched, cancelled, pending, completed, conflicting or unapproved-reschedule event claim.
- Rejects Workboard snapshots whose task/request dictionary keys disagree with their embedded IDs, whose creation/update timestamps are reversed, or whose child record timestamps exceed the board revision timestamp.
- Reuses the standard per-category checklist template. A previously existing task with the same canonical event reference + task code suppresses an unnecessary duplicate suggestion. This is only a *proposal count*, never task creation.
- Identifies duplicate task-code groups, unknown checklist codes and requirement inconsistencies as private issues for human review; it never merges or silently deletes conflicting records.
- Counts assigned, in-progress, on-hold and finished tasks without exposing actual actor, assignee, Event or request identifiers.
- Verifies that department requests are bidirectionally linked to the correct event task. Orphan/mismatched request links fail closed.
- Uses the existing Workboard \`attention\` logic for 24h coordination, 48h leadership, hold follow-up and department requests. All reminders are **proposal counts only**. On Hold pauses routine inactivity notices.
- Returns a redacted ephemeral Discord-message **payload shape**, not an API call. All output is labelled untrusted/offline/review required and cannot assert verified free slots, delivery, readiness, approval, identities or completed Workboard changes.

## Security limits

This audit validates structures and compares **caller-supplied** snapshots. It **does not** cryptographically authenticate the source, check the effective live Discord permissions, prove that a GitHub state is the latest version, establish independent owner highwater or verify message delivery. The existing Workboard \`actor.source='trusted-server-gateway'\` is not a real authenticated transport; only a later protected gateway/host can perform those checks.

To use it in a real GitHub Actions-only workflow later, we must design a separate, permission-checked, revision-locked, encrypted durable read/write transaction with verified roles and deduplicated delivery IDs. A human decision must precede task creation or slot allocation. GitHub Actions scheduling is not continuous/real-time. No new external hosting is authorized.

## Tests and rollout

\`tests/event-capacity-operations-workboard-audit.test.cjs\` covers empty/existing tasks, required/optional codes, duplicate tasks, inconsistent required flags, department request links, hold/follow-up, 24h/48h reminders, forged claims, mismatched Event schedules, malformed timestamps, privacy redaction, and live workflow isolation.

**Release blockers unchanged:** complete authenticated 24-month Convoy Center/archived/deleted history, effective Staff permissions, private GitHub runtime credential separation, independently held checkpoint/backup recovery, correct booking/parking/overlap evidence, CEO signoff and real Discord end-to-end testing.

**Do not merge PR #143, run live activation, or alter the main Convoy Checker because of these offline tests.**
